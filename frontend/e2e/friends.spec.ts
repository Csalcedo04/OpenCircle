import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { seedProfile, signIn, type TestUser } from "./helpers/users"

// Friends end to end: a request by email, accepting it, both lists, and removal.

async function onboarded(user: TestUser, page: Page) {
  await seedProfile(user, { wallet: true, kyc: "Approved" })
  await signIn(page, user, { lands: "circles" })
}

test.describe("friends", () => {
  test("a request by email is accepted; both see each other; removing works for either", async ({ page, user, newUser, browser }) => {
    await onboarded(user, page)
    const friend = await newUser()
    await seedProfile(friend, { wallet: true, kyc: "Approved" })

    await page.goto("/es/friends")
    await page.getByLabel("Correo").fill(friend.email)
    await page.getByRole("button", { name: "Enviar solicitud" }).click()
    await expect(page.getByText(`Solicitud enviada a ${friend.email}.`)).toBeVisible()
    await page.getByRole("button", { name: /Solicitudes enviadas/ }).click()
    await expect(page.getByText("Enviada el")).toBeVisible()

    const context = await browser.newContext({ locale: "es-CO" })
    const friendPage = await context.newPage()
    await signIn(friendPage, friend, { lands: "circles" })
    await friendPage.goto("/es/friends")
    // Requests waiting for them open first.
    await expect(friendPage.getByText("Recibida el")).toBeVisible()
    await friendPage.getByRole("button", { name: "Aceptar" }).click()
    await friendPage.getByRole("button", { name: /^Amigos/ }).click()
    await expect(friendPage.getByText("Amigos desde el")).toBeVisible()

    await page.reload()
    await expect(page.getByText("Amigos desde el")).toBeVisible()

    // Two-step removal from the friend's side.
    await friendPage.getByRole("button", { name: "Eliminar" }).click()
    await friendPage.getByRole("button", { name: "Confirmar" }).click()
    await expect(friendPage.getByText("Aún no tienes amigos")).toBeVisible()
    await context.close()

    await page.reload()
    await expect(page.getByText("Aún no tienes amigos")).toBeVisible()
  })

  test("an invalid email and an unknown one are explained", async ({ page, user }) => {
    await onboarded(user, page)
    await page.goto("/es/friends")
    await page.getByLabel("Correo").fill("nope")
    await page.getByRole("button", { name: "Enviar solicitud" }).click()
    await expect(page.getByText("Escribe un correo válido.")).toBeVisible()
    await page.getByLabel("Correo").fill(`nobody-${Date.now()}@example.test`)
    await page.getByRole("button", { name: "Enviar solicitud" }).click()
    await expect(page.getByText(/Ninguna cuenta de OpenCircle usa ese correo/)).toBeVisible()
  })
})
