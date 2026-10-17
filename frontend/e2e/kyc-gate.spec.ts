import { expect, test } from "./fixtures"
import { seedCircle, seedProfile, signIn } from "./helpers/users"

// Creating or joining a circle: signed in → onboarded → KYC approved → form.
test.describe("KYC gate on create and join", () => {
  test("a signed-in user without a funding source is sent to finish onboarding", async ({ page, user }) => {
    await seedProfile(user)
    await signIn(page, user)
    await page.goto("/es/circles/new")
    await expect(page.getByText("Primero termina de configurar tu cuenta.")).toBeVisible()
    await page.getByRole("link", { name: "Terminar configuración" }).click()
    await expect(page).toHaveURL(/\/es\/onboarding$/)
  })

  test("onboarded but not verified → the verify button, no form", async ({ page, user }) => {
    await seedProfile(user, { wallet: true })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/circles/new")
    await expect(page.getByRole("heading", { name: "Verifica tu identidad" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Verificar mi identidad" })).toBeVisible()
    await expect(page.getByLabel("Nombre del círculo")).toHaveCount(0)
  })

  test("an OpenCircle account counts as onboarded for the gate", async ({ page, user }) => {
    await seedProfile(user, { internalAccount: true })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/circles/new")
    await expect(page.getByRole("heading", { name: "Verifica tu identidad" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Verificar mi identidad" })).toBeVisible()
  })

  test("approved with only an OpenCircle account → the create form appears", async ({ page, user }) => {
    await seedProfile(user, { internalAccount: true, kyc: "Approved" })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/circles/new")
    await expect(page.getByLabel("Nombre del círculo")).toBeVisible()
  })

  test("verification in review → a waiting message, no button", async ({ page, user, newUser }) => {
    const owner = await newUser()
    await seedProfile(owner, { wallet: true, kyc: "Approved" })
    const circle = await seedCircle(owner)
    await seedProfile(user, { wallet: true, kyc: "In Review" })
    await signIn(page, user, { lands: "circles" })
    await page.goto(`/es/circles/${circle.id}/join`)
    await expect(page.getByText("Estamos revisando tu verificación.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Verificar mi identidad" })).toHaveCount(0)
  })

  test("unfinished session → a checking message and a way to continue", async ({ page, user }) => {
    await seedProfile(user, { wallet: true, kyc: "In Progress" })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/circles/new")
    await expect(page.getByText("Estamos comprobando tu verificación.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Continuar verificación" })).toBeVisible()
  })

  test("declined → can try again", async ({ page, user }) => {
    await seedProfile(user, { wallet: true, kyc: "Declined" })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/circles/new")
    await expect(page.getByText("No pudimos verificar tu identidad.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Verificar mi identidad" })).toBeVisible()
  })

  test("approved → the create and join forms appear", async ({ page, user, newUser }) => {
    const owner = await newUser()
    await seedProfile(owner, { wallet: true, kyc: "Approved" })
    const circle = await seedCircle(owner)
    await seedProfile(user, { wallet: true, kyc: "Approved" })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/circles/new")
    await expect(page.getByLabel("Nombre del círculo")).toBeVisible()
    await page.goto(`/es/circles/${circle.id}/join`)
    await expect(page.getByText("Tu ronda de entrega", { exact: true })).toBeVisible()
  })

  test("the verify button opens Didit's real verification page", async ({ page, user }) => {
    test.skip(process.env.E2E_DIDIT !== "1", "creates a real Didit session; run with E2E_DIDIT=1")
    await seedProfile(user, { wallet: true })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/circles/new")
    await page.getByRole("button", { name: "Verificar mi identidad" }).click()
    await page.waitForURL((url) => url.hostname === "verify.didit.me", { timeout: 30_000 })
  })
})
