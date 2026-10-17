import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { E2E_PREFIX, invitesOf, seatMember, seedApprover, seedCircle, seedProfile, signIn, type TestUser } from "./helpers/users"

// Circle invitations end to end: who sees the manager panel, codes with limits, direct invites
// that show up in the invitee's account, revocation, and the token surviving sign-in.

async function approved(user: TestUser, page: Page) {
  await seedProfile(user, { wallet: true, kyc: "Approved" })
  await signIn(page, user, { lands: "circles" })
}

const PANEL = "Invitaciones"

test.describe("circle invitations", () => {
  test("the creator and approvers see the invite panel; a plain member doesn't", async ({ page, user, newUser, browser }) => {
    await approved(user, page)
    const circle = await seedCircle(user, { size: 4 })
    await page.goto(`/es/circles/${circle.id}`)
    await expect(page.getByRole("heading", { name: PANEL })).toBeVisible()
    await expect(page.getByRole("button", { name: "Generar un código" })).toBeVisible()

    const member = await newUser()
    await seedProfile(member, { wallet: true, kyc: "Approved" })
    await seatMember(circle.id, member, 2)
    const context = await browser.newContext({ locale: "es-CO" })
    const memberPage = await context.newPage()
    await signIn(memberPage, member, { lands: "circles" })
    await memberPage.goto(`/es/circles/${circle.id}`)
    await expect(memberPage.getByRole("heading", { name: `${E2E_PREFIX}Natillera` })).toBeVisible()
    await expect(memberPage.getByRole("heading", { name: PANEL })).toHaveCount(0)

    await seedApprover(circle.id, member)
    await memberPage.reload()
    await expect(memberPage.getByRole("heading", { name: PANEL })).toBeVisible()
    await context.close()
  })

  test("a generated code with one use seats one person, then the link is spent", async ({ page, user, newUser, browser }) => {
    await approved(user, page)
    const circle = await seedCircle(user, { size: 4 })
    await page.goto(`/es/circles/${circle.id}`)
    await page.getByRole("button", { name: "Generar un código" }).click()
    await page.getByLabel("Usos máximos").fill("1")
    await page.getByRole("button", { name: "Generar código" }).click()
    const link = await page.getByLabel("Tu nuevo enlace").inputValue()
    expect(link).toMatch(new RegExp(`/es/circles/${circle.id}\\?invite=[\\w-]+$`))
    const token = new URL(link).searchParams.get("invite") ?? ""

    for (const [round, outcome] of [
      [2, "seated"],
      [3, "spent"],
    ] as const) {
      const guest = await newUser()
      await seedProfile(guest, { wallet: true, kyc: "Approved" })
      const context = await browser.newContext({ locale: "es-CO" })
      const guestPage = await context.newPage()
      await signIn(guestPage, guest, { lands: "circles" })
      await guestPage.goto(`/es/circles/${circle.id}/join?invite=${token}`)
      if (outcome === "seated") {
        await guestPage.getByRole("button", { name: new RegExp(`Ronda ${round}`) }).click()
        await guestPage.getByRole("button", { name: "Continuar a la aprobación" }).click()
        await guestPage.waitForURL(new RegExp(`/es/circles/${circle.id}$`), { timeout: 30_000 })
      } else {
        // The circle is public, so the page still opens; joining needs an application instead.
        await guestPage.getByRole("button", { name: new RegExp(`Ronda ${round}`) }).click()
        await guestPage.getByRole("button", { name: "Continuar a la aprobación" }).click()
        await expect(guestPage.getByText("Este círculo recibe miembros por invitación")).toBeVisible()
      }
      await context.close()
    }
    const code = (await invitesOf(circle.id)).find((i) => i.token === token)
    expect(code).toMatchObject({ kind: "CODE", uses: 1, max_uses: 1 })
    await page.reload()
    await expect(page.getByText("1 de 1 usos")).toBeVisible()
    await expect(page.getByText("Vencida").first()).toBeVisible()
  })

  test("a direct invite by email reaches the invitee's account and seats them once accepted", async ({ page, user, newUser, browser }) => {
    await approved(user, page)
    const circle = await seedCircle(user, { size: 3 })
    const invitee = await newUser()
    await seedProfile(invitee, { wallet: true, kyc: "Approved" })

    await page.goto(`/es/circles/${circle.id}`)
    await page.getByRole("button", { name: "Invitar personas" }).click()
    await page.getByLabel("Correos").fill(invitee.email)
    await page.getByRole("button", { name: "Enviar invitaciones" }).click()
    await expect(page.getByText("1 invitaciones enviadas.")).toBeVisible()
    await expect(page.getByText(invitee.email)).toBeVisible()

    const context = await browser.newContext({ locale: "es-CO" })
    const inviteePage = await context.newPage()
    await signIn(inviteePage, invitee, { lands: "circles" })
    await inviteePage.goto("/es/account")
    await expect(inviteePage.getByText("Invitaciones para ti")).toBeVisible()
    await expect(inviteePage.getByText(`${E2E_PREFIX}Natillera`)).toBeVisible()
    await inviteePage.getByRole("link", { name: "Ver y tomar un cupo" }).click()
    await inviteePage.waitForURL(new RegExp(`/es/circles/${circle.id}\\?invite=`))
    await inviteePage.getByRole("link", { name: "Tomar un cupo" }).click()
    await inviteePage.getByRole("button", { name: /Ronda 2/ }).click()
    await inviteePage.getByRole("button", { name: "Continuar a la aprobación" }).click()
    await inviteePage.waitForURL(new RegExp(`/es/circles/${circle.id}$`), { timeout: 30_000 })
    await context.close()

    const invite = (await invitesOf(circle.id)).find((i) => i.kind === "DIRECT")
    expect(invite).toMatchObject({ status: "ACCEPTED", user_id: invitee.id })
    await page.reload()
    await expect(page.getByText("Aceptada")).toBeVisible()
  })

  test("a revoked invite opens nothing", async ({ page, user, newUser, browser }) => {
    await approved(user, page)
    const circle = await seedCircle(user, { size: 3 })
    const invitee = await newUser()
    await seedProfile(invitee, { wallet: true, kyc: "Approved" })
    await page.goto(`/es/circles/${circle.id}`)
    await page.getByRole("button", { name: "Invitar personas" }).click()
    await page.getByLabel("Correos").fill(invitee.email)
    await page.getByRole("button", { name: "Enviar invitaciones" }).click()
    await expect(page.getByText("1 invitaciones enviadas.")).toBeVisible()
    const invite = (await invitesOf(circle.id)).find((i) => i.kind === "DIRECT") as { token: string } | undefined
    expect(invite).toBeTruthy()

    // Revoke the direct invite from the "Personas" list.
    await page.getByRole("button", { name: "Revocar" }).last().click()
    await expect(page.getByText("Revocada").first()).toBeVisible()

    const context = await browser.newContext({ locale: "es-CO" })
    const inviteePage = await context.newPage()
    await signIn(inviteePage, invitee, { lands: "circles" })
    await inviteePage.goto("/es/account")
    await expect(inviteePage.getByText("No tienes invitaciones pendientes")).toBeVisible()
    await context.close()
  })

  test("a signed-out visitor keeps the invite token through the magic link", async ({ page, user, newUser }) => {
    const owner = await newUser()
    await seedProfile(owner, { wallet: true, kyc: "Approved" })
    const circle = await seedCircle(owner, { size: 3 })
    await seedProfile(user, { wallet: true, kyc: "Approved" })

    // The invite link, signed out: the login page keeps the path and the token.
    await page.goto(`/es/circles/${circle.id}/join?invite=${circle.inviteCode}`)
    await page.waitForURL(/\/es\/login\?next=/)
    expect(new URL(page.url()).searchParams.get("next")).toBe(`/es/circles/${circle.id}/join?invite=${circle.inviteCode}`)
    // Asking for the magic link stores the return path; the admin link then confirms the sign-in.
    await page.getByLabel("Correo").fill(user.email)
    await page.getByRole("button", { name: /enlace/i }).click()
    await expect(page.getByText(user.email)).toBeVisible()
    await signIn(page, user, { lands: "circles" }).catch(() => undefined)
    await page.waitForURL(new RegExp(`/es/circles/${circle.id}/join\\?invite=${circle.inviteCode}$`), { timeout: 30_000 })
    await expect(page.getByRole("button", { name: /Ronda 2/ })).toBeVisible()
  })
})
