import { expect, test } from "@playwright/test"

// Signed-out visitors: the landing and login are open; the app (circles, members,
// onboarding) asks to sign in first and remembers where they were going.
test.describe("signed out", () => {
  test("the root redirects to a language and the landing renders", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/es$/)
    await expect(page.locator("h1").first()).toBeVisible()
  })

  test("circles need sign-in; login remembers the page", async ({ page }) => {
    await page.goto("/es/circles")
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fcircles$/)
    await expect(page.locator('input[name="next"]')).toHaveValue("/es/circles")
  })

  test("the language toggle switches to English", async ({ page }) => {
    await page.goto("/es/login")
    await page.getByRole("link", { name: "English" }).click()
    await expect(page).toHaveURL(/\/en\/login$/)
    await expect(page.getByRole("button", { name: "Email me a link" })).toBeVisible()
  })

  test("onboarding redirects to login", async ({ page }) => {
    await page.goto("/es/onboarding")
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fonboarding$/)
  })

  test("creating a circle asks to sign in and remembers the page", async ({ page }) => {
    await page.goto("/es/circles/new")
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fcircles%2Fnew$/)
    await expect(page.locator('input[name="next"]')).toHaveValue("/es/circles/new")
  })

  test("joining a circle asks to sign in and remembers the page", async ({ page }) => {
    await page.goto("/en/circles/natillera-laureles/join")
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fcircles%2Fnatillera-laureles%2Fjoin$/)
  })

  test("the return path drops the query string", async ({ page }) => {
    await page.goto("/es/circles?status=OPEN")
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fcircles$/)
  })

  test("login ignores a return path that leaves the app", async ({ page }) => {
    await page.goto("/es/login?next=https://evil.example")
    await expect(page.locator('input[name="next"]')).toHaveCount(0)
  })

  test("login is magic link only: no password fields", async ({ page }) => {
    await page.goto("/es/login")
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Enviarme un enlace" })).toBeVisible()
  })

  test("login rejects an invalid email without sending anything", async ({ page }) => {
    await page.goto("/es/login")
    await page.getByLabel("Correo").fill("not-an-email")
    await page.getByRole("button", { name: "Enviarme un enlace" }).click()
    await expect(page.getByText("Escribe un correo válido.")).toBeVisible()
  })

  test("a bad magic link lands on login with an explanation", async ({ page }) => {
    await page.goto("/es/auth/confirm?token_hash=not-a-real-token&type=magiclink")
    await expect(page).toHaveURL(/\/es\/login\?error=link$/)
    await expect(page.getByText("Ese enlace de acceso no es válido o expiró. Pide uno nuevo.")).toBeVisible()
  })

  test("the KYC return route never redirects outside the app", async ({ page }) => {
    await page.goto("/es/kyc/callback?next=https://evil.example")
    // It falls back to circles, which (signed out) asks to sign in; the host never changes.
    await expect(page).toHaveURL(/^http:\/\/localhost:3001\/es\/login\?next=%2Fes%2Fcircles$/)
  })
})
