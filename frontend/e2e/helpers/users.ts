import { randomInt, randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import type { Page } from "@playwright/test"

// Secrets come from frontend/.env.local, loaded by the e2e fixtures; nothing is hard-coded.
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("e2e needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const must = <T,>(result: { data: T; error: { message: string } | null }, what: string): T => {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  return result.data
}

export const E2E_PREFIX = "[e2e] "

export interface TestUser {
  id: string
  email: string
}

/** A confirmed Supabase Auth user with no profile yet. */
export async function createTestUser(): Promise<TestUser> {
  const email = `e2e-${randomUUID()}@example.test`
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true })
  if (error || !data.user) throw new Error(`create auth user: ${error?.message ?? "no user returned"}`)
  return { id: data.user.id, email }
}

/**
 * Signs the browser in like a magic link would, without an inbox: the admin API issues the
 * link's token and the page opens our own /auth/confirm route with it.
 *
 * Waits until the user has landed: onboarding, or circles for users who finished it (that
 * redirect happens client-side from a streamed page, so navigating earlier would abort it).
 */
export async function signIn(
  page: Page,
  user: TestUser,
  options: { lands?: "onboarding" | "circles"; locale?: "es" | "en" } = {},
): Promise<void> {
  const { lands = "onboarding", locale = "es" } = options
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email: user.email })
  if (error || !data.properties) throw new Error(`generate link: ${error?.message ?? "no link returned"}`)
  await page.goto(`/${locale}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`)
  await page.waitForURL(new RegExp(`/${locale}/${lands}(\\?.*)?$`))
}

export interface SeedOptions {
  /** Link a test wallet, as completed wallet consent would. */
  wallet?: boolean
  /** Didit status of the user's latest KYC session. */
  kyc?: "Approved" | "In Review" | "Declined" | "Not Started"
}

/** Creates the profile (and optionally wallet and KYC state) directly, skipping the UI. */
export async function seedProfile(user: TestUser, options: SeedOptions = {}): Promise<void> {
  const db = admin()
  must(
    await db.from("users").insert({
      id: user.id,
      email: user.email,
      document_type: "cc",
      document_number: String(randomInt(1_000_000_000, 9_999_999_999)),
      nationality: "CO",
      full_name: `${E2E_PREFIX}Ana Gómez`,
      phone: "+573001234567",
      dob: "1995-04-12",
    }),
    "insert profile",
  )
  if (options.wallet) {
    const wallet = must(
      await db
        .from("wallets")
        .insert({ address_url: `https://ilp.interledger-test.dev/oc-e2e-${randomUUID()}`, asset_code: "COP", asset_scale: 2 })
        .select("id")
        .single(),
      "insert wallet",
    )
    if (!wallet) throw new Error("insert wallet: no row returned")
    must(await db.from("users").update({ op_wallet: wallet.id }).eq("id", user.id), "link wallet")
  }
  if (options.kyc) {
    must(await db.from("kyc_verifications").insert({ user_id: user.id, session_id: randomUUID(), status: options.kyc }), "insert kyc")
  }
}

/** Removes everything a test user may have created, then the auth user. */
export async function deleteTestUser(user: TestUser): Promise<void> {
  const db = admin()
  const profile = await db.from("users").select("op_wallet").eq("id", user.id).maybeSingle()
  const walletId = (profile.data as { op_wallet: string | null } | null)?.op_wallet ?? null
  for (const table of ["kyc_verifications", "consent_challenges", "wallet_grants"]) {
    must(await db.from(table).delete().eq("user_id", user.id), `delete ${table}`)
  }
  if (walletId) must(await db.from("audit_events").delete().eq("wallet_id", walletId), "delete audit events")
  must(await db.from("users").delete().eq("id", user.id), "delete profile")
  if (walletId) must(await db.from("wallets").delete().eq("id", walletId), "delete wallet")
  const { error } = await db.auth.admin.deleteUser(user.id)
  if (error) throw new Error(`delete auth user: ${error.message}`)
}

/** The profile as stored, for assertions. */
export async function storedProfile(user: TestUser): Promise<Record<string, unknown> | null> {
  const { data } = await admin().from("users").select("*").eq("id", user.id).maybeSingle()
  return data as Record<string, unknown> | null
}
