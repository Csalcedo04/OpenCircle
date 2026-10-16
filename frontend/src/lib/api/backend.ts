import "server-only"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

/**
 * Server-only client for the Express API. Forwards the signed-in user's
 * Supabase access token as `Authorization: Bearer`; the API verifies it
 * against the project's JWKS. Call from Server Components, Server Actions
 * or Route Handlers — the token and the API URL never reach the browser.
 */

const backendUrl = z.url()

const errorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

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
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  dob: z.string().nullable(),
  wallet: z
    .object({ addressUrl: z.string(), assetCode: z.string(), assetScale: z.number().int() })
    .nullable(),
})

export type Profile = z.infer<typeof profileSchema>

export interface ProfilePatch {
  fullName?: string
  phone?: string
  /** YYYY-MM-DD */
  dob?: string
}

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

  const res = await fetch(new URL(`/api${path}`, backendUrl.parse(process.env.BACKEND_API_URL)), {
    ...init,
    headers,
    cache: "no-store",
  })
  const body: unknown = await res.json().catch(() => null)

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
    if (err instanceof BackendError && err.code === "USER_NOT_FOUND") return null
    throw err
  }
}

export function updateMyProfile(patch: ProfilePatch): Promise<Profile> {
  return backendFetch("/users/me", profileSchema, { method: "PATCH", body: JSON.stringify(patch) })
}

const consentStartSchema = z.object({ redirectUrl: z.url() })

/**
 * Starts Open Payments consent for a wallet address (`$ilp…` or https). Send the
 * user to `redirectUrl`: their wallet's consent screen.
 */
export function startWalletConsent(url: string): Promise<{ redirectUrl: string }> {
  return backendFetch("/users/me/wallet/consent", consentStartSchema, { method: "POST", body: JSON.stringify({ url }) })
}

/** Finishes consent with the values the wallet put on the callback URL; links the wallet. */
export function completeWalletConsent(input: { state: string; interactRef: string; hash: string }): Promise<Profile> {
  return backendFetch("/users/me/wallet/consent/complete", profileSchema, { method: "POST", body: JSON.stringify(input) })
}
