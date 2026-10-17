"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError } from "@/lib/api/backend"
import { acceptFriendRequest, cancelFriendRequest, removeFriend, sendFriendRequest } from "@/lib/api/friends"
import { friendErrorKey, parseFriendRequestForm, type FriendErrorKey } from "@/lib/flows/friends"

export type FriendFormState = { error: FriendErrorKey | null; sentTo: string | null }
export type FriendRowState = { error: FriendErrorKey | null; done: boolean }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "")

const failed = (what: string, err: unknown): FriendErrorKey => {
  const code = err instanceof BackendError ? err.code : "unknown"
  console.error(what, code)
  return friendErrorKey(code)
}

/** The "add by email" form. */
export async function sendFriendRequestAction(locale: string, _prev: FriendFormState, formData: FormData): Promise<FriendFormState> {
  if (!hasLocale(locale)) return { error: "generic", sentTo: null }
  const parsed = parseFriendRequestForm({ email: text(formData.get("email")) })
  if (!parsed.ok) return { error: parsed.error, sentTo: null }
  try {
    await sendFriendRequest({ email: parsed.email })
  } catch (err) {
    return { error: failed("Friend request failed", err), sentTo: null }
  }
  revalidatePath(`/${locale}/friends`)
  return { error: null, sentTo: parsed.email }
}

/** The "add friend" button on a member's profile. */
// Bound actions: React passes the previous state and the form data, which these don't need.
export async function requestFriendByIdAction(locale: string, userId: string): Promise<FriendRowState> {
  if (!hasLocale(locale)) return { error: "generic", done: false }
  try {
    await sendFriendRequest({ userId })
  } catch (err) {
    return { error: failed("Friend request failed", err), done: false }
  }
  revalidatePath(`/${locale}/friends`)
  return { error: null, done: true }
}

/** Accept (addressee), or reject / withdraw (either side): one action, chosen by `decision`. */
export async function respondFriendRequestAction(
  locale: string,
  requestId: string,
  decision: "accept" | "cancel",
): Promise<FriendRowState> {
  if (!hasLocale(locale)) return { error: "generic", done: false }
  try {
    if (decision === "accept") await acceptFriendRequest(requestId)
    else await cancelFriendRequest(requestId)
  } catch (err) {
    return { error: failed("Friend request update failed", err), done: false }
  }
  revalidatePath(`/${locale}/friends`)
  return { error: null, done: true }
}

export async function removeFriendAction(locale: string, userId: string): Promise<FriendRowState> {
  if (!hasLocale(locale)) return { error: "generic", done: false }
  try {
    await removeFriend(userId)
  } catch (err) {
    return { error: failed("Friend removal failed", err), done: false }
  }
  revalidatePath(`/${locale}/friends`)
  return { error: null, done: true }
}
