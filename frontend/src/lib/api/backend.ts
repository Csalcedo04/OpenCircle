import "server-only"

import { z } from "zod"
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/identity"
import { createClient } from "@/lib/supabase/server"
import type { CircleVisibility } from "@/lib/flows/circle-invite"
import { apiCircleSchema, testClockSchema, type ApiCircle, type NewCircle, type TestClock } from "@/lib/api/test-clocks"

export type { ApiCircle, NewCircle, TestClock }

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

export interface BackendFetchOptions extends RequestInit {
  /** `optional`: send the token when signed in, but don't fail when signed out. */
  auth?: "required" | "optional"
}

export async function backendFetch<T>(path: string, schema: z.ZodType<T>, options: BackendFetchOptions = {}): Promise<T> {
  const { auth = "required", ...init } = options
  const supabase = await createClient()
  // getSession() reads the cookie without re-verifying it; that's fine here
  // because the API verifies the token itself before trusting it.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (auth === "required" && !session) throw new BackendError(401, "UNAUTHORIZED", "Not signed in")

  const headers = new Headers(init.headers)
  if (session) headers.set("authorization", `Bearer ${session.access_token}`)
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

/** `invite`: the code from a private circle's link. */
export function getApiCircle(id: string, invite?: string): Promise<ApiCircle> {
  const query = invite ? `?invite=${encodeURIComponent(invite)}` : ""
  return backendFetch(`/circles/${encodeURIComponent(id)}${query}`, apiCircleSchema)
}


// ── Circles and members ─────────────────────────────────────────────────────

const amountSchema = z.object({ value: z.string().regex(/^\d+$/), assetCode: z.string(), assetScale: z.number().int() })
const cadenceSchema = z.enum(["WEEKLY", "MONTHLY"])
const circleStatusSchema = z.enum(["OPEN", "ACTIVE", "COMPLETED"])

const recordSchema = z.object({
  payments: z.object({ onTime: z.number().int(), late: z.number().int(), missed: z.number().int() }),
  ratings: z.object({ count: z.number().int(), tenths: z.number().int() }),
  circlesCompleted: z.number().int(),
  memberSince: z.string().nullable(),
})

const reviewSchema = z.object({
  id: z.uuid(),
  authorId: z.uuid(),
  authorName: z.string(),
  subjectId: z.uuid(),
  circleId: z.uuid(),
  circleName: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string(),
})

const circleSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string().nullable(),
  status: circleStatusSchema,
  contribution: amountSchema,
  size: z.number().int(),
  seatsTaken: z.number().int(),
  cadence: cadenceSchema,
  createdAt: z.string(),
})

const circleSchema = circleSummarySchema.extend({
  feeBps: z.number().int(),
  threshold: amountSchema,
  grantWeightBps: z.number().int(),
  poolWalletAddress: z.string(),
  startedAt: z.string().nullable(),
  currentRound: z.number().int().nullable(),
  seats: z.array(
    z.object({
      memberId: z.uuid(),
      userId: z.uuid(),
      displayName: z.string(),
      payoutRound: z.number().int(),
      collateral: amountSchema,
      grantMode: z.enum(["RECURRING", "PER_ROUND"]).nullable(),
      record: recordSchema,
    }),
  ),
  rounds: z.array(
    z.object({
      number: z.number().int(),
      state: z.enum(["UPCOMING", "COLLECTING", "FUNDED", "RISK_CHECK", "BLOCKED", "PAYING_OUT", "PAID_OUT", "REFUNDED"]),
      beneficiaryMemberId: z.uuid(),
      startsAt: z.string(),
      deadline: z.string(),
      contributions: z.array(z.object({ memberId: z.uuid(), status: z.string() })),
    }),
  ),
  reviews: z.array(reviewSchema),
  visibility: z.enum(["PRIVATE", "PUBLIC"]),
  /** Only for the circle's creator; null otherwise. */
  inviteUrl: z.string().nullable(),
})

const memberSchema = recordSchema.extend({
  id: z.uuid(),
  displayName: z.string(),
  walletAddress: z.string().nullable(),
  reviews: z.array(reviewSchema),
  circles: z.array(circleSummarySchema),
})

export type CircleSummaryDto = z.infer<typeof circleSummarySchema>
export type CircleDto = z.infer<typeof circleSchema>
export type MemberDto = z.infer<typeof memberSchema>
export type ReviewDto = z.infer<typeof reviewSchema>
export type Cadence = z.infer<typeof cadenceSchema>

/** `?invite=` for circles shared by link (private circles). */
const inviteQuery = (invite: string | undefined) => (invite ? `?invite=${encodeURIComponent(invite)}` : "")

export function fetchCircles(): Promise<CircleSummaryDto[]> {
  return backendFetch("/circles", z.array(circleSummarySchema))
}

/** A circle, or null if it doesn't exist (or isn't visible to the caller). */
export async function fetchCircle(id: string, invite?: string): Promise<CircleDto | null> {
  try {
    return await backendFetch(`/circles/${encodeURIComponent(id)}${inviteQuery(invite)}`, circleSchema)
  } catch (err) {
    if (err instanceof BackendError && err.code === "CIRCLE_NOT_FOUND") return null
    throw err
  }
}

/** A member's profile, or null if they don't exist. */
export async function fetchMember(id: string): Promise<MemberDto | null> {
  try {
    return await backendFetch(`/members/${encodeURIComponent(id)}`, memberSchema)
  } catch (err) {
    if (err instanceof BackendError && err.code === "MEMBER_NOT_FOUND") return null
    throw err
  }
}

export interface SeatRequest {
  payoutRound: number
  /** Minor units, integer string. */
  collateralValue?: string
  grantMode?: "RECURRING" | "PER_ROUND" | null
}

export interface NewCircleRequest extends SeatRequest {
  name: string
  /** Optional; the create form doesn't ask for it (the dev form still does). */
  city?: string
  /** Minor units, integer string. */
  contributionValue: string
  size: number
  cadence: Cadence
  /** Private (invite link only) unless set to PUBLIC; the API defaults to PRIVATE. */
  visibility?: CircleVisibility | undefined
  /** Dev only (TEST_CLOCKS_ENABLED): run the circle on this test clock. */
  testClockId?: string | undefined
}

export function createCircle(input: NewCircleRequest): Promise<CircleDto> {
  return backendFetch("/circles", circleSchema, { method: "POST", body: JSON.stringify(input) })
}

export function joinCircle(id: string, seat: SeatRequest, invite?: string): Promise<CircleDto> {
  return backendFetch(`/circles/${encodeURIComponent(id)}/join`, circleSchema, {
    method: "POST",
    body: JSON.stringify(invite ? { ...seat, invite } : seat),
  })
}

// ── The signed-in user's savings and circles ───────────────────────────────

const savingsSchema = z.object({
  walletAddress: z.string(),
  balance: amountSchema,
  ics: z.number().nullable(),
})

export type Savings = z.infer<typeof savingsSchema>

/** Wallet balance and Interledger credit score, or null without a profile yet. */
export async function getMySavings(): Promise<Savings | null> {
  try {
    return await backendFetch("/users/me/savings", savingsSchema)
  } catch (err) {
    if (err instanceof BackendError && err.code === "PROFILE_NOT_FOUND") return null
    throw err
  }
}

/** Circles the caller has a seat in, private ones included. */
export function getMyCircles(): Promise<CircleSummaryDto[]> {
  return backendFetch("/users/me/circles", z.array(circleSummarySchema))
}
