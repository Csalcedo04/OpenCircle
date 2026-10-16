import { expect, test } from "@playwright/test"

// Signed-out visitors: everything is browsable, nothing that needs an account is reachable.
test.describe("signed out", () => {
  test("the root redirects to a language and the landing renders", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/es$/)
    await expect(page.locator("h1").first()).toBeVisible()
  })

  test("circles are public; the header offers sign-in", async ({ page }) => {
    await page.goto("/es/circles")
    await expect(page.getByRole("heading", { level: 1, name: "Círculos" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Iniciar sesión" })).toBeVisible()
  })

  test("the language toggle switches to English", async ({ page }) => {
    await page.goto("/es/circles")
    await page.getByRole("link", { name: "English" }).click()
    await expect(page).toHaveURL(/\/en\/circles$/)
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
  })

  test("onboarding redirects to login", async ({ page }) => {
    await page.goto("/es/onboarding")
    await expect(page).toHaveURL(/\/es\/login$/)
    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible()
  })

  test("creating a circle asks to sign in, and the link remembers the page", async ({ page }) => {
    await page.goto("/es/circles/new")
    await expect(page.getByText("Inicia sesión para crear o unirte a un círculo.")).toBeVisible()
    await expect(page.getByLabel("Nombre del círculo")).toHaveCount(0)

    await page.getByRole("main").getByRole("link", { name: "Iniciar sesión" }).click()
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fcircles%2Fnew$/)
    await expect(page.locator('input[name="next"]')).toHaveValue("/es/circles/new")
  })

  test("joining a circle asks to sign in", async ({ page }) => {
    await page.goto("/en/circles/natillera-laureles/join")
    await expect(page.getByText("Sign in to create or join a circle")).toBeVisible()
    await expect(page.getByText("Tu ronda de entrega")).toHaveCount(0)
  })

  test("login ignores a return path that leaves the app", async ({ page }) => {
    await page.goto("/es/login?next=https://evil.example")
    await expect(page.locator('input[name="next"]')).toHaveCount(0)
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
    await expect(page).toHaveURL(/localhost:3001\/es\/circles$/)
  })
})
