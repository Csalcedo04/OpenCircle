import { z } from "zod"

// The friends page's forms: pure, so they're unit-tested.

/** Message keys (dictionary section `friends.errors`). */
export const FRIEND_ERROR_KEYS = ["email", "userNotFound", "alreadyFriends", "requestPending", "self", "notFound", "rateLimited", "unavailable", "generic"] as const
export type FriendErrorKey = (typeof FRIEND_ERROR_KEYS)[number]

export function parseFriendRequestForm(f: { email: string }): { ok: true; email: string } | { ok: false; error: FriendErrorKey } {
  const email = f.email.trim().toLowerCase()
  if (!z.email().safeParse(email).success) return { ok: false, error: "email" }
  return { ok: true, email }
}

const apiErrors: Record<string, FriendErrorKey> = {
  PROFILE_NOT_FOUND: "userNotFound",
  ALREADY_FRIENDS: "alreadyFriends",
  FRIEND_REQUEST_PENDING: "requestPending",
  CANNOT_FRIEND_SELF: "self",
  FRIEND_REQUEST_NOT_FOUND: "notFound",
  FRIEND_NOT_FOUND: "notFound",
  RATE_LIMITED: "rateLimited",
  BACKEND_UNAVAILABLE: "unavailable",
}

/** API error code from the friends routes → message key. */
export const friendErrorKey = (code: string): FriendErrorKey => apiErrors[code] ?? "generic"
