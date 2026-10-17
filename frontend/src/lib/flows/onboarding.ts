/**
 * Onboarding state, derived from the profile. A user is onboarded once they have a way to
 * pay contributions: an OpenCircle internal account, their own Open Payments wallet, or both.
 * Pure: no server imports, so pages, the KYC gate and the sign-in landing share one rule.
 */

export const FUNDING_SOURCES = ["INTERNAL_ACCOUNT", "EXTERNAL_WALLET"] as const
export type FundingSource = (typeof FUNDING_SOURCES)[number]

export interface FundingProfile {
  walletAddress: string | null
  internalAccount: { id: string } | null
}

export function isOnboarded(profile: FundingProfile | null | undefined): boolean {
  return fundingSources(profile).length > 0
}

/** Internal account first: it is the default way to pay when both exist. */
export function fundingSources(profile: FundingProfile | null | undefined): FundingSource[] {
  if (!profile) return []
  const sources: FundingSource[] = []
  if (profile.internalAccount) sources.push("INTERNAL_ACCOUNT")
  if (profile.walletAddress) sources.push("EXTERNAL_WALLET")
  return sources
}

/** Step 1 asks for the profile; step 2 for a funding source. `edit=profile` reopens step 1. */
export function onboardingStep(profile: FundingProfile | null | undefined, edit: unknown): 1 | 2 {
  return profile && edit !== "profile" ? 2 : 1
}

export const ACCOUNT_ERROR_KEYS = ["unavailable", "generic"] as const
export type AccountErrorKey = (typeof ACCOUNT_ERROR_KEYS)[number]

/** API error code → message key for the create-account form. */
export const accountErrorKey = (code: string): AccountErrorKey => (code === "BACKEND_UNAVAILABLE" ? "unavailable" : "generic")
