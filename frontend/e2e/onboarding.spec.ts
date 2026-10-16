import { expect, test } from "./fixtures"
import { E2E_PREFIX, seedProfile, signIn, storedProfile } from "./helpers/users"

test.describe("sign-in and onboarding", () => {
  test("a magic link signs in and lands on onboarding; the header shows sign-out", async ({ page, user }) => {
    await signIn(page, user)
    await expect(page).toHaveURL(/\/es\/onboarding$/)
    await expect(page.getByText("Paso 1 de 2")).toBeVisible()
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible()
  })

  test("step 1 explains each invalid field and stores nothing", async ({ page, user }) => {
    await signIn(page, user)
    await page.getByLabel("Nombre completo").fill(`${E2E_PREFIX}Ana Gómez`)
    await page.getByLabel("Número de documento").fill("12ab")
    await page.getByLabel("Fecha de nacimiento").fill("1995-04-12")
    await page.getByLabel("Teléfono").fill("3001234567")
    await page.getByRole("button", { name: "Continuar" }).click()

    await expect(page.getByText("Usa de 3 a 15 dígitos (pasaporte: de 5 a 20 letras o dígitos).")).toBeVisible()
    await expect(page.getByText("Usa formato internacional, por ejemplo +573001234567.")).toBeVisible()
    expect(await storedProfile(user)).toBeNull()
  })

  test("step 1 creates the profile; the document is then fixed", async ({ page, user }) => {
    await signIn(page, user)
    await page.getByLabel("Nombre completo").fill(`${E2E_PREFIX}Ana Gómez`)
    await page.getByLabel("Documento de identidad").selectOption("cc")
    await page.getByLabel("Número de documento").fill("1023456789")
    await page.getByLabel("Fecha de nacimiento").fill("1995-04-12")
    await page.getByLabel("Nacionalidad").fill("co")
    await page.getByLabel("Teléfono").fill("+573001234567")
    await page.getByRole("button", { name: "Continuar" }).click()

    await expect(page.getByText("Paso 2 de 2")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Conecta tu billetera" })).toBeVisible()
    const profile = await storedProfile(user)
    expect(profile).toMatchObject({
      email: user.email,
      document_type: "cc",
      document_number: "1023456789",
      nationality: "CO",
      phone: "+573001234567",
      dob: "1995-04-12",
      op_wallet: null,
    })

    await page.getByRole("link", { name: "Editar" }).click()
    await expect(page.getByText("Tu documento no se puede cambiar después del registro.")).toBeVisible()
    await expect(page.getByLabel("Número de documento")).toHaveCount(0)
  })

  test("the wallet step rejects addresses off the test network", async ({ page, user }) => {
    await seedProfile(user)
    await signIn(page, user)
    await page.getByLabel("Dirección de la billetera").fill("$wallet.example.com/ana")
    await page.getByRole("button", { name: "Continuar a mi billetera" }).click()
    await expect(page.getByText("Esa billetera no está en la red de prueba de Interledger.")).toBeVisible()
  })

  test("a test-network wallet sends the user to that wallet's real consent screen", async ({ page, user }) => {
    await seedProfile(user)
    await signIn(page, user)
    await page.getByLabel("Dirección de la billetera").fill("$ilp.interledger-test.dev/opencircle")
    await page.getByRole("button", { name: "Continuar a mi billetera" }).click()
    // Real Interledger test network: the grant is pending until the wallet owner approves.
    await page.waitForURL((url) => url.hostname.endsWith("interledger-test.dev"), { timeout: 30_000 })
  })

  test("coming back without approving explains it and offers to retry", async ({ page, user }) => {
    await seedProfile(user)
    await signIn(page, user)
    await page.goto("/consent/callback/0123456789abcdef0123456789abcdef0123456789a")
    await expect(page).toHaveURL(/\/es\/onboarding\?consent=rejected$/)
    await expect(page.getByText("La conexión con la billetera no fue aprobada. Puedes intentarlo de nuevo.")).toBeVisible()
  })

  test("an onboarded user goes straight to circles, never loading onboarding", async ({ page, user }) => {
    await seedProfile(user, { wallet: true })
    const visited: string[] = []
    page.on("request", (req) => {
      if (req.isNavigationRequest()) visited.push(new URL(req.url()).pathname)
    })
    await signIn(page, user, { lands: "circles" })
    await expect(page).toHaveURL(/\/es\/circles$/)
    expect(visited).not.toContain("/es/onboarding")
  })

  test("signing out ends the session", async ({ page, user }) => {
    await seedProfile(user, { wallet: true })
    await signIn(page, user, { lands: "circles" })
    await page.getByRole("button", { name: "Cerrar sesión" }).click()
    await expect(page).toHaveURL(/\/es$/)
    await page.goto("/es/onboarding")
    await expect(page).toHaveURL(/\/es\/login$/)
  })
})
