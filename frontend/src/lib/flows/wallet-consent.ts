import type { ProfileErrorKey } from "./profile-form"

/** Shown in front of the wallet field: users only type the username they remember. */
export const TESTNET_WALLET_PREFIX = "$ilp.interledger-test.dev/"

/**
 * What the user typed → a wallet address for the API. Usually just a username ("ana" →
 * "$ilp.interledger-test.dev/ana"); a pasted full address ($… or https://…) is kept as is
 * and the API normalizes and checks it. Null when it can't be an address.
 */
export function walletAddressFromInput(value: string): string | null {
  const input = value.trim()
  if (/^(\$|https:\/\/)\S+$/.test(input)) return input
  const username = input.replace(/^ilp\.interledger-test\.dev\//i, "")
  return /^[\w.-]+$/.test(username) ? `${TESTNET_WALLET_PREFIX}${username}` : null
}

const startErrors: Record<string, ProfileErrorKey> = {
  BACKEND_UNAVAILABLE: "unavailable",
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

/**
 * Where a failed consent lands: back on the account page when linking started there (the
 * saved return path), otherwise onboarding's wallet step. Both show the reason.
 */
export function consentFailurePath(returnPath: unknown, locale: string, reason: ConsentReason): string {
  if (returnPath === `/${locale}/account`) return `/${locale}/account?consent=${reason}`
  return `/${locale}/onboarding?source=wallet&consent=${reason}`
}
