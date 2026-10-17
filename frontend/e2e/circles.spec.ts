import { createClient } from "@supabase/supabase-js"
import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { E2E_PREFIX, inviteCodeOf, seatMember, seedCircle, seedProfile, signIn, type TestUser } from "./helpers/users"

// Real circles end to end: the create form, joining through an invite link, the last seat
// starting the circle, the public list and member profiles. Every user here is KYC-approved.

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false } })

async function approved(user: TestUser, page: Page) {
  await seedProfile(user, { wallet: true, kyc: "Approved" })
  await signIn(page, user, { lands: "circles" })
}

const circleIdFrom = (url: string) => new URL(url).pathname.split("/").pop() ?? ""

test.describe("circles on real data", () => {
  test("create a circle with the form: it opens on its page with me in my seat", async ({ page, user }) => {
    await approved(user, page)
    await page.goto("/es/circles/new")
    await page.getByLabel("Nombre del círculo").fill(`${E2E_PREFIX}Natillera del parque`)
    await page.getByLabel("Aporte por ronda (COP)").fill("50000")
    await page.getByLabel("Número de miembros").selectOption("3")
    await page.getByRole("button", { name: "Mensual" }).click()
    await page.getByRole("group", { name: "Tu turno de entrega" }).getByRole("button", { name: "2", exact: true }).click()
    await page.getByRole("button", { name: "Crear círculo" }).click()

    await page.waitForURL(/\/es\/circles\/[0-9a-f-]{36}$/, { timeout: 30_000 })
    await expect(page.getByRole("heading", { name: `${E2E_PREFIX}Natillera del parque` })).toBeVisible()

    const id = circleIdFrom(page.url())
    const { data: circle } = await db().from("circles").select("status, size, cadence, contribution_value, asset_code, created_by, city").eq("id", id).single()
    expect(circle).toMatchObject({ status: "OPEN", size: 3, cadence: "MONTHLY", contribution_value: 5000000, asset_code: "COP", created_by: user.id, city: null })
    const { data: seats } = await db().from("circle_members").select("user_id, payout_round").eq("circle_id", id)
    expect(seats).toEqual([{ user_id: user.id, payout_round: 2 }])
  })

  test("the create form explains invalid fields and creates nothing", async ({ page, user }) => {
    await approved(user, page)
    await page.goto("/es/circles/new")
    await page.getByLabel("Nombre del círculo").fill("ab")
    await page.getByLabel("Aporte por ronda (COP)").fill("500")
    await page.getByRole("button", { name: "Crear círculo" }).click()
    await expect(page.getByText("Usa entre 3 y 60 caracteres.")).toBeVisible()
    await expect(page.getByText("Ingresa un monto entero entre 1.000 y 10.000.000 COP.")).toBeVisible()
    const { count } = await db().from("circles").select("id", { count: "exact", head: true }).eq("created_by", user.id)
    expect(count).toBe(0)
  })

  test("two members join through the invite link; the last seat starts the circle", async ({ page, user, newUser, browser }) => {
    // The creator's circle is private by default: others join with its invite link.
    await approved(user, page)
    const circle = await seedCircle(user, { size: 3 })
    await db().from("circles").update({ visibility: "PRIVATE" }).eq("id", circle.id)
    const invite = await inviteCodeOf(circle.id)

    for (const round of [2, 3]) {
      const member = await newUser()
      const context = await browser.newContext({ locale: "es-CO" })
      const memberPage = await context.newPage()
      await approved(member, memberPage)
      await memberPage.goto(`/es/circles/${circle.id}/join?invite=${invite}`)
      await memberPage.getByRole("button", { name: new RegExp(`Ronda ${round}`) }).click()
      await memberPage.getByRole("button", { name: "Continuar a la aprobación" }).click()
      await memberPage.waitForURL(new RegExp(`/es/circles/${circle.id}$`), { timeout: 30_000 })
      await context.close()
    }

    const { data: started } = await db().from("circles").select("status, started_at").eq("id", circle.id).single()
    expect(started?.status).toBe("ACTIVE")
    expect(started?.started_at).not.toBeNull()
    const { data: rounds } = await db().from("rounds").select("number, state").eq("circle_id", circle.id).order("number")
    expect(rounds?.map((r) => r.state)).toEqual(["COLLECTING", "UPCOMING", "UPCOMING"])

    // Without the invite, a private circle doesn't exist for outsiders.
    const outsider = await newUser()
    const context = await browser.newContext({ locale: "es-CO" })
    const outsiderPage = await context.newPage()
    await approved(outsider, outsiderPage)
    await outsiderPage.goto(`/es/circles/${circle.id}`)
    await expect(outsiderPage.getByText("Aquí no hay nada")).toBeVisible()
    await context.close()
  })

  test("public circles are listed; profiles are for members of a shared circle", async ({ page, user, newUser }) => {
    const owner = await newUser()
    await seedProfile(owner, { wallet: true, kyc: "Approved" })
    const circle = await seedCircle(owner, { name: `${E2E_PREFIX}Natillera pública` })

    await approved(user, page)
    await page.goto("/es/circles")
    await expect(page.getByText(`${E2E_PREFIX}Natillera pública`)).toBeVisible()

    // Strangers don't see each other's profiles.
    await page.goto(`/es/members/${owner.id}`)
    await expect(page.getByText("Aquí no hay nada")).toBeVisible()

    // Once they share a circle they do. Members appear as "First L.": the seeded name is "[e2e] Ana Gómez".
    await seatMember(circle.id, user, 2)
    await page.goto(`/es/members/${owner.id}`)
    await expect(page.getByRole("heading", { name: `${E2E_PREFIX.trim()} G.` })).toBeVisible()
    await expect(page.getByText(`${E2E_PREFIX}Natillera pública`)).toBeVisible()
  })

  // Pages stream, so a missing circle or member shows the not-found page (the status stays 200).
  test("an unknown circle or member shows the not-found page", async ({ page, user }) => {
    await approved(user, page)
    await page.goto("/es/circles/00000000-0000-4000-8000-000000000000")
    await expect(page.getByText("Aquí no hay nada")).toBeVisible()
    await page.goto("/es/members/00000000-0000-4000-8000-000000000000")
    await expect(page.getByText("Aquí no hay nada")).toBeVisible()
  })
})
