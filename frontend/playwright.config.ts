import { defineConfig, devices } from "@playwright/test"

/**
 * Browser end-to-end tests. Starts the real backend (backend/.env) and the Next dev server
 * (frontend/.env.local), unless they're already running. Test users are created and removed
 * through the Supabase admin API (needs SUPABASE_SECRET_KEY in .env.local).
 *
 *   pnpm test:e2e              # everything except real Didit sessions
 *   E2E_DIDIT=1 pnpm test:e2e  # also creates a real Didit session
 */
export default defineConfig({
  testDir: "./e2e",
  // Tests share one database and real external services: run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3001",
    locale: "es-CO",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm dev -p 3001",
      url: "http://localhost:3001/es",
      reuseExistingServer: true,
      timeout: 120_000,
      // Set for the test run only; real runs read it from .env.local.
      env: { BACKEND_API_URL: "http://localhost:3000" },
    },
  ],
})
