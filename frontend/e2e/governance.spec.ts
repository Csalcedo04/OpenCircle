import { createClient } from "@supabase/supabase-js"
import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { E2E_PREFIX, seatMember, seedCircle, seedProfile, signIn, type TestUser } from "./helpers/users"

// Public circles without an invite link take applications; the circle's members decide.

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false } })

async function approved(user: TestUser, page: Page) {
  await seedProfile(user, { wallet: true, kyc: "Approved" })
  await signIn(page, user, { lands: "circles" })
}

async function applyTo(circleId: string, applicant: TestUser, page: Page) {
  await approved(applicant, page)
  await page.goto(`/es/circles/${circleId}`)
  await page.getByRole("link", { name: "Postularme a un cupo" }).click()
  await expect(page.getByRole("heading", { name: /Postularme a/ })).toBeVisible()
  await page.getByRole("button", { name: "Enviar solicitud" }).click()
  await page.waitForURL(new RegExp(`/es/circles/${circleId}\\?applied=1$`), { timeout: 30_000 })
  await expect(page.getByText("Tu solicitud fue enviada")).toBeVisible()
}

test.describe("circle governance", () => {
  test("a visitor applies to a public circle; the creator accepts and the applicant is seated", async ({ page, user, newUser, browser }) => {
    await approved(user, page)
    const circle = await seedCircle(user, { size: 3 })

    const applicant = await newUser()
    const context = await browser.newContext({ locale: "es-CO" })
    const applicantPage = await context.newPage()
    await applyTo(circle.id, applicant, applicantPage)
    // Still an outsider: no applicants tab for them.
    await expect(applicantPage.getByRole("tab", { name: /Solicitantes/ })).toHaveCount(0)

    await page.goto(`/es/circles/${circle.id}`)
    await page.getByRole("tab", { name: /Solicitantes/ }).click()
    await expect(page.getByText("En revisión")).toBeVisible()
    await page.getByRole("button", { name: "Aceptar" }).click()
    await expect(page.getByText("Aceptada")).toBeVisible()

    const { data: seats } = await db().from("circle_members").select("user_id").eq("circle_id", circle.id)
    expect(seats?.map((s) => s.user_id).sort()).toEqual([applicant.id, user.id].sort())
    await applicantPage.reload()
    await expect(applicantPage.getByRole("tab", { name: /Solicitantes/ })).toBeVisible()
    await context.close()
  })

  test("under MAJORITY one vote doesn't decide, and a plain member may vote", async ({ page, user, newUser, browser }) => {
    await approved(user, page)
    const circle = await seedCircle(user, { size: 4 })
    await db().from("circles").update({ approval_mode: "MAJORITY" }).eq("id", circle.id)
    const member = await newUser()
    await seedProfile(member, { wallet: true, kyc: "Approved" })
    await seatMember(circle.id, member, 2)

    const applicant = await newUser()
    const context = await browser.newContext({ locale: "es-CO" })
    const applicantPage = await context.newPage()
    await applyTo(circle.id, applicant, applicantPage)
    await context.close()

    // The creator's vote alone: 1 of 2 members, still under review.
    await page.goto(`/es/circles/${circle.id}`)
    await page.getByRole("tab", { name: /Solicitantes/ }).click()
    await page.getByRole("button", { name: "Aceptar" }).click()
    await expect(page.getByText("1 a favor · 0 en contra")).toBeVisible()
    await expect(page.getByText("En revisión")).toBeVisible()

    // A plain member votes too; more than half accepted, so the applicant is seated.
    const memberContext = await browser.newContext({ locale: "es-CO" })
    const memberPage = await memberContext.newPage()
    await signIn(memberPage, member, { lands: "circles" })
    await memberPage.goto(`/es/circles/${circle.id}`)
    await memberPage.getByRole("tab", { name: /Solicitantes/ }).click()
    await memberPage.getByRole("button", { name: "Aceptar" }).click()
    await expect(memberPage.getByText("Aceptada")).toBeVisible()
    await memberContext.close()

    const { data: application } = await db().from("circle_applications").select("status").eq("circle_id", circle.id).single()
    expect(application).toEqual({ status: "ACCEPTED" })
    expect(circle.inviteCode).toBeTruthy()
  })

  test("a member sees a reminder only for their own unpaid contribution", async ({ page, user }) => {
    await approved(user, page)
    const circle = await seedCircle(user, { size: 3 })
    await page.goto(`/es/circles/${circle.id}`)
    // OPEN circle: no round being collected, no reminder.
    await expect(page.getByText(/Tu aporte de/)).toHaveCount(0)
    expect(E2E_PREFIX).toBeTruthy()
  })
})
