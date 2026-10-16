import "server-only"

import { z } from "zod"
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/identity"
import { createClient } from "@/lib/supabase/server"
import { apiCircleSchema, testClockSchema, type ApiCircle, type NewCircle, type TestClock } from "@/lib/api/test-clocks"

/**
 * Server-only client for the Express API. Forwards the signed-in user's
 * Supabase access token as `Authorization: Bearer`; the API verifies it
 * against the project's JWKS. Call from Server Components, Server Actions
 * or Route Handlers — the token and the API URL never reach the browser.
 */

const backendUrl = z.url()

const errorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

/** The API can't be reached (not configured, down, timing out): show "try again shortly". */
export const BACKEND_UNAVAILABLE = "BACKEND_UNAVAILABLE"

export const isBackendUnavailable = (err: unknown): boolean => err instanceof BackendError && err.code === BACKEND_UNAVAILABLE

const unavailable = (why: string) => new BackendError(503, BACKEND_UNAVAILABLE, why)

export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "BackendError"
  }
}

const profileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z.string(),
  nationality: z.string(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  dob: z.string().nullable(),
  walletAddress: z.string().nullable(),
})

export type Profile = z.infer<typeof profileSchema>

/** Everything POST /users/me needs; the email comes from the Supabase token. */
export interface NewProfile {
  fullName: string
  /** E.164, e.g. +573001234567 */
  phone: string
  /** YYYY-MM-DD */
  dob: string
  /** ISO 3166-1 alpha-2, e.g. CO */
  nationality: string
  documentType: DocumentType
  documentNumber: string
}

/** Identity fields (document, email) are fixed once the profile exists. */
export type ProfilePatch = Partial<Pick<NewProfile, "fullName" | "phone" | "dob" | "nationality">>

async function backendFetch<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const supabase = await createClient()
  // getSession() reads the cookie without re-verifying it; that's fine here
  // because the API verifies the token itself before trusting it.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new BackendError(401, "UNAUTHORIZED", "Not signed in")

  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${session.access_token}`)
  if (init.body !== undefined) headers.set("content-type", "application/json")

  const base = backendUrl.safeParse(process.env.BACKEND_API_URL)
  if (!base.success) throw unavailable("BACKEND_API_URL is not configured")

  let res: Response
  try {
    res = await fetch(new URL(`/api${path}`, base.data), {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Connection refused, DNS failure or timeout.
    throw unavailable("Backend request failed to connect")
  }
  const body: unknown = await res.json().catch(() => null)

  // A gateway answering for a backend that is down or deploying.
  if ([502, 503, 504].includes(res.status) && !errorBodySchema.safeParse(body).success) {
    throw unavailable(`Backend answered ${res.status}`)
  }
  if (!res.ok) {
    const parsed = errorBodySchema.safeParse(body)
    throw parsed.success
      ? new BackendError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new BackendError(res.status, "BACKEND_ERROR", "Backend request failed")
  }
  return schema.parse(body)
}

/** The caller's profile, or null if they haven't created one yet. */
export async function getMyProfile(): Promise<Profile | null> {
  try {
    return await backendFetch("/users/me", profileSchema)
  } catch (err) {
    if (err instanceof BackendError && err.code === "PROFILE_NOT_FOUND") return null
    throw err
  }
}

export function createMyProfile(profile: NewProfile): Promise<Profile> {
  return backendFetch("/users/me", profileSchema, { method: "POST", body: JSON.stringify(profile) })
}

export function updateMyProfile(patch: ProfilePatch): Promise<Profile> {
  return backendFetch("/users/me", profileSchema, { method: "PATCH", body: JSON.stringify(patch) })
}

const redirectSchema = z.object({ redirectUrl: z.url() })

/**
 * Starts Open Payments consent for a wallet address (`$ilp…` or https). Send the
 * user to `redirectUrl`: their wallet's consent screen.
 */
export function startWalletConsent(walletAddress: string): Promise<{ redirectUrl: string }> {
  return backendFetch("/users/me/wallet/consent", redirectSchema, {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  })
}

/** Finishes consent with the values the wallet put on the callback URL; links the wallet. */
export function completeWalletConsent(input: { state: string; interactRef: string; hash: string }): Promise<Profile> {
  return backendFetch("/users/me/wallet/consent/complete", profileSchema, { method: "POST", body: JSON.stringify(input) })
}

const kycSchema = z.object({ status: z.string().nullable(), approved: z.boolean() })

export type Kyc = z.infer<typeof kycSchema>

/** Identity verification status; the API refreshes pending sessions from Didit. */
export function getMyKyc(): Promise<Kyc> {
  return backendFetch("/users/me/kyc", kycSchema)
}

/** Starts (or resumes) Didit verification; send the user to `url`. */
export function startKyc(input: { locale: "en" | "es"; returnPath: string }): Promise<{ url: string }> {
  return backendFetch("/users/me/kyc/session", z.object({ url: z.url() }), { method: "POST", body: JSON.stringify(input) })
}

// ── Dev only: test clocks (backend TEST_CLOCKS_ENABLED) ─────────────────────

export function createTestClock(input: { name: string; frozenTime: string }): Promise<TestClock> {
  return backendFetch("/test-clocks", testClockSchema, { method: "POST", body: JSON.stringify(input) })
}

export function getTestClock(id: string): Promise<TestClock> {
  return backendFetch(`/test-clocks/${encodeURIComponent(id)}`, testClockSchema)
}

/** Moves the clock to `to` (ISO); the current frozen time only re-reads payments. */
export function advanceTestClock(id: string, to: string): Promise<TestClock> {
  return backendFetch(`/test-clocks/${encodeURIComponent(id)}/advance`, testClockSchema, { method: "POST", body: JSON.stringify({ to }) })
}

export function createCircle(input: NewCircle): Promise<ApiCircle> {
  return backendFetch("/circles", apiCircleSchema, { method: "POST", body: JSON.stringify(input) })
}

export function getApiCircle(id: string): Promise<ApiCircle> {
  return backendFetch(`/circles/${encodeURIComponent(id)}`, apiCircleSchema)
}

export function joinCircle(id: string, payoutRound: number): Promise<ApiCircle> {
  return backendFetch(`/circles/${encodeURIComponent(id)}/join`, apiCircleSchema, { method: "POST", body: JSON.stringify({ payoutRound }) })
}
