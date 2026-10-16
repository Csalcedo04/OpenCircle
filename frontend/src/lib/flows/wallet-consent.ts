import type { ProfileErrorKey } from "./profile-form"

/** A payment pointer (`$host/path`) or an https wallet address; the API normalizes and checks it. */
export const isWalletInput = (value: string): boolean => /^(\$|https:\/\/)\S+$/.test(value)

const startErrors: Record<string, ProfileErrorKey> = {
  VALIDATION_ERROR: "wallet",
  WALLET_NOT_ALLOWED: "walletNotAllowed",
  OPEN_PAYMENTS_ERROR: "walletUnreachable",
}

/** API error code from starting consent → message key. */
export const walletErrorKey = (code: string): ProfileErrorKey => startErrors[code] ?? "generic"

export const CONSENT_REASONS = ["rejected", "expired", "invalid", "taken", "error"] as const
export type ConsentReason = (typeof CONSENT_REASONS)[number]

const completeReasons: Record<string, ConsentReason> = {
  CONSENT_NOT_FOUND: "expired",
  CONSENT_INVALID: "invalid",
  VALIDATION_ERROR: "invalid",
  WALLET_ALREADY_LINKED: "taken",
  WALLET_IN_USE: "taken",
}

/** API error code from completing consent → the `?consent=` reason shown on onboarding. */
export const consentFailureReason = (code: string): ConsentReason => completeReasons[code] ?? "error"

const reasonMessages: Record<ConsentReason, ProfileErrorKey> = {
  rejected: "consentRejected",
  expired: "consentExpired",
  invalid: "consentInvalid",
  taken: "walletTaken",
  error: "generic",
}

/** `?consent=` query value → message key; anything unknown shows nothing. */
export function consentMessageKey(param: unknown): ProfileErrorKey | null {
  return typeof param === "string" && (CONSENT_REASONS as readonly string[]).includes(param)
    ? reasonMessages[param as ConsentReason]
    : null
}
