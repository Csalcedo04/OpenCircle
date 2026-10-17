import { randomBytes, randomInt, randomUUID } from "node:crypto"
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
  kyc?: "Approved" | "In Progress" | "In Review" | "Declined" | "Not Started"
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

const E2E_POOL_PREFIX = "https://ilp.interledger-test.dev/oc-e2e-pool-"

// Invite tokens as the API makes them: 32 random bytes, base64url.
const newToken = () => randomBytes(32).toString("base64url")

/**
 * A PUBLIC, OPEN circle created directly in the database, owned by `owner` (who takes round 1),
 * with its standing invite code. Its own throwaway pot wallet keeps it apart from real circles.
 * Deleted with its owner.
 */
export async function seedCircle(owner: TestUser, options: { size?: number; name?: string } = {}): Promise<{ id: string; inviteCode: string }> {
  const db = admin()
  const pool = must(
    await db
      .from("wallets")
      .insert({ address_url: `${E2E_POOL_PREFIX}${randomUUID()}`, asset_code: "COP", asset_scale: 2 })
      .select("id")
      .single(),
    "insert pool wallet",
  )
  if (!pool) throw new Error("insert pool wallet: no row returned")
  const circle = must(
    await db
      .from("circles")
      .insert({
        name: options.name ?? `${E2E_PREFIX}Natillera`,
        city: "Medellín",
        contribution_value: "2000000",
        asset_code: "COP",
        asset_scale: 2,
        threshold_value: "2000000",
        round_length_days: 7,
        cadence: "WEEKLY",
        visibility: "PUBLIC",
        size: options.size ?? 3,
        pool_wallet_id: pool.id,
        created_by: owner.id,
      })
      .select("id")
      .single(),
    "insert circle",
  )
  if (!circle) throw new Error("insert circle: no row returned")
  must(await db.from("circle_members").insert({ circle_id: circle.id, user_id: owner.id, payout_round: 1, is_approver: true }), "seat owner")
  const inviteCode = await seedCodeInvite(circle.id, owner)
  return { id: circle.id, inviteCode }
}

/** A CODE invite made directly; unlimited and without expiry unless told otherwise. Returns its token. */
export async function seedCodeInvite(circleId: string, creator: TestUser, options: { maxUses?: number; expiresAt?: string } = {}): Promise<string> {
  const token = newToken()
  must(
    await admin()
      .from("circle_invites")
      .insert({ circle_id: circleId, kind: "CODE", token, created_by: creator.id, max_uses: options.maxUses ?? null, expires_at: options.expiresAt ?? null }),
    "insert code invite",
  )
  return token
}

/** Lets a seated member accept applicants and invite people. */
export async function seedApprover(circleId: string, user: TestUser): Promise<void> {
  must(await admin().from("circle_members").update({ is_approver: true }).eq("circle_id", circleId).eq("user_id", user.id), "make approver")
}

/** Seats a user in a circle directly, skipping the join flow. */
export async function seatMember(circleId: string, user: TestUser, payoutRound: number) {
  must(await admin().from("circle_members").insert({ circle_id: circleId, user_id: user.id, payout_round: payoutRound }), "seat member")
}

/** The circle's standing invite code (what the managers' invite link carries): newest active, unlimited CODE. */
export async function inviteCodeOf(circleId: string): Promise<string> {
  const row = must(
    await admin()
      .from("circle_invites")
      .select("token")
      .eq("circle_id", circleId)
      .eq("kind", "CODE")
      .eq("status", "ACTIVE")
      .is("max_uses", null)
      .is("expires_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    "read invite code",
  )
  return (row as { token: string }).token
}

/** An invite row, for assertions. */
export async function storedInvite(inviteId: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin().from("circle_invites").select("*").eq("id", inviteId).maybeSingle()
  return data as Record<string, unknown> | null
}

/** The circle's invites, newest first. */
export async function invitesOf(circleId: string): Promise<Record<string, unknown>[]> {
  const rows = must(await admin().from("circle_invites").select("*").eq("circle_id", circleId).order("created_at", { ascending: false }), "read invites")
  return rows as Record<string, unknown>[]
}

/** Deletes circles with everything that hangs off them; never OpenCircle's real pot wallet. */
async function deleteCircles(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = admin()
  const circles = must(await db.from("circles").select("id, pool_wallet_id").in("id", ids), "read circles") as { id: string; pool_wallet_id: string }[]
  const rounds = (must(await db.from("rounds").select("id").in("circle_id", ids), "read rounds") as { id: string }[]).map((r) => r.id)
  if (rounds.length > 0) must(await db.from("contributions").delete().in("round_id", rounds), "delete contributions")
  must(await db.from("rounds").delete().in("circle_id", ids), "delete rounds")
  must(await db.from("reviews").delete().in("circle_id", ids), "delete reviews")
  must(await db.from("audit_events").delete().in("external_id", ids.map((id) => `circle.started:${id}`)), "delete circle audit")
  // Invites reference seats (accepted_member_id), so they go before the seats.
  must(await db.from("circle_invites").delete().in("circle_id", ids), "delete invites")
  must(await db.from("circle_members").delete().in("circle_id", ids), "delete seats")
  must(await db.from("circles").delete().in("id", ids), "delete circles")
  const pools = circles.map((c) => c.pool_wallet_id)
  const own = (must(await db.from("wallets").select("id, address_url").in("id", pools), "read pools") as { id: string; address_url: string }[])
    .filter((w) => w.address_url.startsWith(E2E_POOL_PREFIX))
    .map((w) => w.id)
  if (own.length > 0) {
    must(await db.from("audit_events").delete().in("wallet_id", own), "delete pool audit")
    must(await db.from("wallets").delete().in("id", own), "delete pool wallets")
  }
}

/** Removes everything a test user may have created, then the auth user. */
export async function deleteTestUser(user: TestUser): Promise<void> {
  const db = admin()
  // Circles they created or sit in go first: seats and circles reference users.
  const created = (must(await db.from("circles").select("id").eq("created_by", user.id), "read created circles") as { id: string }[]).map((c) => c.id)
  const joined = (must(await db.from("circle_members").select("circle_id").eq("user_id", user.id), "read seats") as { circle_id: string }[]).map((m) => m.circle_id)
  await deleteCircles([...new Set([...created, ...joined])])
  // Invites they made in other people's circles, and their friendships, reference the user.
  must(await db.from("circle_invites").delete().eq("created_by", user.id), "delete invites made")
  must(await db.from("friendships").delete().or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`), "delete friendships")
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
