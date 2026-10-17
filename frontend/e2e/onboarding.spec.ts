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
    await page.getByLabel("Teléfono").fill("123")
    await page.getByRole("button", { name: "Continuar" }).click()

    await expect(page.getByText("Usa de 3 a 15 dígitos (pasaporte: de 5 a 20 letras o dígitos).")).toBeVisible()
    await expect(page.getByText("Escribe un número de teléfono válido para ese país.")).toBeVisible()
    expect(await storedProfile(user)).toBeNull()
  })

  test("step 1 creates the profile; the document is then fixed", async ({ page, user }) => {
    await signIn(page, user)
    await page.getByLabel("Nombre completo").fill(`${E2E_PREFIX}Ana Gómez`)
    await page.getByLabel("Documento de identidad").selectOption("cc")
    await page.getByLabel("Número de documento").fill("1023456789")
    await page.getByLabel("Fecha de nacimiento").fill("1995-04-12")
    await page.getByLabel("Nacionalidad").selectOption("CO")
    await page.getByLabel("Indicativo").selectOption("CO")
    await page.getByLabel("Teléfono").fill("300 123 4567")
    await page.getByRole("button", { name: "Continuar" }).click()

    await expect(page.getByText("Paso 2 de 2")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Conecta tu billetera" })).toBeVisible()
    await expect(page.locator('li[aria-current="step"]')).toContainText("Conecta tu billetera")
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

  test("the step bar shows progress and animates only when motion is allowed", async ({ page, user }) => {
    const motion = async () => {
      const bar = page.locator('li[aria-current="step"] .oc-step-fill')
      await expect(bar).toHaveCount(1)
      return bar.evaluate((el) => getComputedStyle(el).animationName)
    }

    await signIn(page, user)
    await expect(page.locator('li[aria-current="step"]')).toContainText("Tus datos")
    expect(await motion()).toBe("oc-fill")
    expect(await page.locator(".oc-step-in").evaluate((el) => getComputedStyle(el).animationName)).toBe("oc-rise")

    // Reduced motion: nothing moves, the current bar is simply full.
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await motion()).toBe("none")
    const [barWidth, trackWidth] = await page
      .locator('li[aria-current="step"] .oc-step-fill')
      .evaluate((el) => [el.getBoundingClientRect().width, (el.parentElement as HTMLElement).getBoundingClientRect().width])
    expect(barWidth).toBe(trackWidth)
  })

  test("the phone code follows the nationality until picked by hand", async ({ page, user }) => {
    await signIn(page, user)
    const nationality = page.getByLabel("Nacionalidad")
    const code = page.getByLabel("Indicativo")
    await expect(nationality).toHaveValue("CO")
    await expect(code).toHaveValue("CO")
    await expect(code.locator("option:checked")).toHaveText("+57 Colombia")

    await nationality.selectOption("VE")
    await expect(code).toHaveValue("VE")

    await code.selectOption("US")
    await nationality.selectOption("PE")
    await expect(code).toHaveValue("US")
  })

  test("the wallet step rejects addresses off the test network", async ({ page, user }) => {
    await seedProfile(user)
    await signIn(page, user)
    // A pasted full address still works, and is checked by the API.
    await page.getByLabel("Usuario de tu billetera").fill("$wallet.example.com/ana")
    await page.getByRole("button", { name: "Continuar a mi billetera" }).click()
    await expect(page.getByText("Esa billetera no está en la red de prueba de Interledger.")).toBeVisible()
  })

  test("a test-network wallet sends the user to that wallet's real consent screen", async ({ page, user }) => {
    await seedProfile(user)
    await signIn(page, user)
    // Just the username: the field adds $ilp.interledger-test.dev/.
    await expect(page.getByText("$ilp.interledger-test.dev/")).toBeVisible()
    await page.getByLabel("Usuario de tu billetera").fill("opencircle")
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
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fonboarding$/)
  })

  test("signed in, /login follows an in-app return path and ignores anything else", async ({ page, user }) => {
    await seedProfile(user, { wallet: true })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/login?next=/es/circles/new")
    await expect(page).toHaveURL(/\/es\/circles\/new$/)
    for (const next of ["//evil.example", "https://evil.example", "/es/circles?x=1"]) {
      await page.goto(`/es/login?next=${encodeURIComponent(next)}`)
      await expect(page, next).toHaveURL(/^http:\/\/localhost:3001\/es\/circles$/)
    }
  })
})
