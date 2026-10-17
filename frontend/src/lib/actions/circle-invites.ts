"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError, rotateCircleInviteCode } from "@/lib/api/backend"
import { createCircleInvites, revokeCircleInvite, type InviteDto } from "@/lib/api/invites"
import { inviteErrorKey, parseCodeInviteForm, parseDirectInviteForm, type InviteErrorKey, type InviteFieldErrors } from "@/lib/flows/invites"

export type InviteFormState = {
  /** A problem with the whole request (the API refused it). */
  error: InviteErrorKey | null
  errors: InviteFieldErrors
  /** What the last submit made, shown right away (the page also revalidates). */
  created: InviteDto[] | null
}

export type RevokeState = { error: InviteErrorKey | null; done: boolean }

export type RotateStandingLinkState = {
  error: InviteErrorKey | null
  inviteUrl: string | null
  rotated: boolean
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "")

const failed = (what: string, err: unknown): InviteErrorKey => {
  const code = err instanceof BackendError ? err.code : "unknown"
  console.error(what, code)
  return inviteErrorKey(code)
}

/**
 * One action for both invite forms, chosen by the hidden `intent` field:
 *   intent=code   with expiry, maxUses                  → a shareable code
 *   intent=direct with expiry, userIds (friends), emails → one invite per person, emailed by the API
 */
export async function createInviteAction(locale: string, circleId: string, _prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  if (!hasLocale(locale)) return { error: "generic", errors: {}, created: null }
  const intent = formData.get("intent")
  const parsed =
    intent === "code"
      ? parseCodeInviteForm({ expiry: text(formData.get("expiry")), maxUses: text(formData.get("maxUses")) })
      : parseDirectInviteForm({
          expiry: text(formData.get("expiry")),
          userIds: formData.getAll("userIds").map(text),
          emails: text(formData.get("emails")),
        })
  if (!parsed.ok) return { error: null, errors: parsed.errors, created: null }

  let created: InviteDto[]
  try {
    created = await createCircleInvites(circleId, parsed.request)
  } catch (err) {
    return { error: failed("Circle invite create failed", err), errors: {}, created: null }
  }
  revalidatePath(`/${locale}/circles/${circleId}`)
  return { error: null, errors: {}, created }
}

// Bound per row: React's previous state and form data aren't needed.
export async function revokeInviteAction(locale: string, circleId: string, inviteId: string): Promise<RevokeState> {
  if (!hasLocale(locale)) return { error: "generic", done: false }
  try {
    await revokeCircleInvite(circleId, inviteId)
  } catch (err) {
    return { error: failed("Circle invite revoke failed", err), done: false }
  }
  revalidatePath(`/${locale}/circles/${circleId}`)
  return { error: null, done: true }
}

/** Rotates the circle's permanent standing invite link and revokes the previous one. */
export async function rotateInviteCodeAction(
  locale: string,
  circleId: string,
  prev: RotateStandingLinkState,
): Promise<RotateStandingLinkState> {
  if (!hasLocale(locale)) return { error: "generic", inviteUrl: prev.inviteUrl, rotated: false }
  try {
    const updated = await rotateCircleInviteCode(circleId)
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { error: null, inviteUrl: updated.inviteUrl, rotated: true }
  } catch (err) {
    return { error: failed("Circle standing invite rotate failed", err), inviteUrl: prev.inviteUrl, rotated: false }
  }
}
