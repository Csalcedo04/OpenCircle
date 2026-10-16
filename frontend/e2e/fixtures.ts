import { test as base } from "@playwright/test"
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/users"

// Load frontend/.env.local for the admin helpers (Node 22+ built-in; no dotenv dependency).
try {
  process.loadEnvFile(".env.local")
} catch {
  // Missing file: the helpers throw a clear error when they need the variables.
}

/** `user`: a fresh Supabase user for this test, deleted with everything it created afterwards. */
export const test = base.extend<{ user: TestUser }>({
  // `provide` is Playwright's fixture callback (named so React's hook lint rule leaves it alone).
  user: async ({}, provide) => {
    const user = await createTestUser()
    try {
      await provide(user)
    } finally {
      await deleteTestUser(user)
    }
  },
})

export { expect } from "@playwright/test"
