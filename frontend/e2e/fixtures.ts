import { test as base } from "@playwright/test"
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/users"

// Load frontend/.env.local for the admin helpers (Node 22+ built-in; no dotenv dependency).
try {
  process.loadEnvFile(".env.local")
} catch {
  // Missing file: the helpers throw a clear error when they need the variables.
}

/**
 * `user`: a fresh Supabase user for this test. `newUser()`: more users when a test needs several.
 * All are deleted with everything they created afterwards.
 */
export const test = base.extend<{ user: TestUser; newUser: () => Promise<TestUser> }>({
  // `provide` is Playwright's fixture callback (named so React's hook lint rule leaves it alone).
  user: async ({}, provide) => {
    const user = await createTestUser()
    try {
      await provide(user)
    } finally {
      await deleteTestUser(user)
    }
  },
  newUser: async ({}, provide) => {
    const extra: TestUser[] = []
    try {
      await provide(async () => {
        const u = await createTestUser()
        extra.push(u)
        return u
      })
    } finally {
      for (const u of extra) await deleteTestUser(u)
    }
  },
})

export { expect } from "@playwright/test"
