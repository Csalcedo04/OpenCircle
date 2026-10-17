import type { Locale } from "@/i18n/config"

export const CIRCLE_VISIBILITIES = ["PRIVATE", "PUBLIC"] as const
export type CircleVisibility = (typeof CIRCLE_VISIBILITIES)[number]

/**
 * The API builds invite links on the default locale (/es/…). Show the creator the link in
 * the language they're using; the code and the circle stay the same.
 */
export function localizedInviteUrl(url: string, locale: Locale): string {
  const parsed = new URL(url)
  parsed.pathname = parsed.pathname.replace(/^\/(es|en)(?=\/)/, `/${locale}`)
  return parsed.toString()
}

export const INVITE_ERROR_KEYS = ["generic", "notOpen", "unavailable"] as const
export type InviteErrorKey = (typeof INVITE_ERROR_KEYS)[number]

const errorKeys: Record<string, InviteErrorKey> = {
  CIRCLE_NOT_OPEN: "notOpen",
  BACKEND_UNAVAILABLE: "unavailable",
}

/** API error code → message key. */
export const inviteErrorKey = (code: string): InviteErrorKey => errorKeys[code] ?? "generic"
