import { expect, test } from "./fixtures"
import { seedProfile, signIn, storedInternalAccount } from "./helpers/users"

// Onboarding with an OpenCircle account needs no external wallet, so this suite runs anywhere
// the backend runs. The balance shown depends on the backend's DEMO_SEED_VALUE.
test.describe("OpenCircle internal account", () => {
  test("one click opens the account and finishes onboarding", async ({ page, user }) => {
    await seedProfile(user)
    await signIn(page, user)
    await expect(page.getByText("Paso 2 de 2")).toBeVisible()
    await page.getByRole("button", { name: "Abrir mi cuenta OpenCircle" }).click()
    await expect(page).toHaveURL(/\/es\/circles$/)

    const account = await storedInternalAccount(user)
    expect(account).toMatchObject({ kind: "USER", owner_user_id: user.id })
  })

  test("the account page shows the balance, the movements and a way to link a wallet", async ({ page, user }) => {
    await seedProfile(user, { internalAccount: { balance: "5000000" } })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/account")
    const card = page.locator("#internal-account")
    await expect(card.getByText("Saldo disponible")).toBeVisible()
    await expect(card.getByText("50.000")).toBeVisible()
    await expect(card.getByText("Todavía no hay movimientos.")).toBeVisible()
    // No external wallet yet: the wallet card offers to link one right here.
    await expect(page.locator("#wallet").getByLabel("Usuario de tu billetera")).toBeVisible()
  })

  test("a wallet-only user can open an account from the account page", async ({ page, user }) => {
    await seedProfile(user, { wallet: true })
    await signIn(page, user, { lands: "circles" })
    await page.goto("/es/account")
    await expect(page.getByText("Aún no tienes cuenta OpenCircle")).toBeVisible()
    await page.getByRole("button", { name: "Abrir mi cuenta OpenCircle" }).click()
    await expect(page).toHaveURL(/\/es\/account$/)
    await expect(page.locator("#internal-account").getByText("Saldo disponible")).toBeVisible()
    expect(await storedInternalAccount(user)).not.toBeNull()
  })

  test("opening the account returns to where sign-in started", async ({ page, user }) => {
    await seedProfile(user)
    await page.goto("/es/login?next=/es/circles/new")
    await signIn(page, user)
    await page.getByRole("button", { name: "Abrir mi cuenta OpenCircle" }).click()
    await expect(page).toHaveURL(/\/es\/circles\/new$/)
  })
})
