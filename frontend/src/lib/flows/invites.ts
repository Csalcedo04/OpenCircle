import { z } from "zod"
import type { CreateInviteRequest } from "@/lib/api/invites"

// Invite forms (the circle page's invite manager): pure, so they're unit-tested. The API computes
// expiry dates from hours or days; the forms never send a timestamp.

export const INVITE_KINDS = ["CODE", "DIRECT"] as const
export const INVITE_STATUSES = ["ACTIVE", "ACCEPTED", "REVOKED", "EXPIRED"] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

/** How long a code stays valid. */
export const CODE_EXPIRIES = ["24h", "7d", "30d", "never"] as const
export type CodeExpiry = (typeof CODE_EXPIRIES)[number]
/** How long a direct invitation stays valid: an email shouldn't open a circle forever. */
export const DIRECT_EXPIRIES = ["24h", "7d", "30d"] as const
export type DirectExpiry = (typeof DIRECT_EXPIRIES)[number]
export const DEFAULT_DIRECT_EXPIRY: DirectExpiry = "7d"

const HOURS: Record<Exclude<CodeExpiry, "never">, number> = { "24h": 24, "7d": 168, "30d": 720 }
const DAYS: Record<DirectExpiry, number> = { "24h": 1, "7d": 7, "30d": 30 }

export const MAX_USES = 1000
export const MAX_DIRECT_TARGETS = 20

/** Message keys for the invite manager (dictionary section `invites.errors`). */
export const INVITE_ERROR_KEYS = [
  "expiry",
  "maxUses",
  "targets",
  "email",
  "notOpen",
  "notManager",
  "alreadyMember",
  "alreadyInvited",
  "userNotFound",
  "notFound",
  "notActive",
  "unavailable",
  "generic",
] as const
export type InviteErrorKey = (typeof INVITE_ERROR_KEYS)[number]

export type InviteField = "expiry" | "maxUses" | "targets"
export type InviteFieldErrors = Partial<Record<InviteField, InviteErrorKey>>

type Parsed = { ok: true; request: CreateInviteRequest } | { ok: false; errors: InviteFieldErrors }

export function parseCodeInviteForm(f: { expiry: string; maxUses: string }): Parsed {
  const errors: InviteFieldErrors = {}
  const expiry = CODE_EXPIRIES.find((e) => e === f.expiry)
  if (!expiry) errors.expiry = "expiry"
  const raw = f.maxUses.trim()
  const maxUses = raw === "" ? null : Number(raw)
  if (maxUses !== null && (!/^\d+$/.test(raw) || maxUses < 1 || maxUses > MAX_USES)) errors.maxUses = "maxUses"
  if (!expiry || Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, request: { kind: "CODE", expiresInHours: expiry === "never" ? null : HOURS[expiry], maxUses } }
}

/** Emails typed by hand: one per line, or separated by commas, semicolons or spaces. */
export function splitEmails(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e !== ""))]
}

export function parseDirectInviteForm(f: { expiry: string; userIds: readonly string[]; emails: string }): Parsed {
  const errors: InviteFieldErrors = {}
  const expiry = DIRECT_EXPIRIES.find((e) => e === f.expiry)
  if (!expiry) errors.expiry = "expiry"
  const userIds = [...new Set(f.userIds.filter((id) => z.uuid().safeParse(id).success))]
  const emails = splitEmails(f.emails)
  if (emails.some((e) => !z.email().safeParse(e).success)) errors.targets = "email"
  const targets = [...userIds.map((userId) => ({ userId })), ...emails.map((email) => ({ email }))]
  if (targets.length === 0 || targets.length > MAX_DIRECT_TARGETS) errors.targets ??= "targets"
  if (!expiry || Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, request: { kind: "DIRECT", targets, expiresInDays: DAYS[expiry] } }
}

const apiErrors: Record<string, InviteErrorKey> = {
  CIRCLE_NOT_OPEN: "notOpen",
  NOT_APPROVER: "notManager",
  ALREADY_MEMBER: "alreadyMember",
  INVITE_PENDING: "alreadyInvited",
  PROFILE_NOT_FOUND: "userNotFound",
  INVITE_NOT_FOUND: "notFound",
  INVITE_NOT_ACTIVE: "notActive",
  VALIDATION_ERROR: "targets",
  BACKEND_UNAVAILABLE: "unavailable",
}

/** API error code from managing invites → message key. */
export const inviteErrorKey = (code: string): InviteErrorKey => apiErrors[code] ?? "generic"

/** Who a direct invite is for, as the manager sees it: a name, or the email they typed. */
export function inviteeLabel(invitee: { displayName: string | null; email: string | null }): string {
  return invitee.displayName ?? invitee.email ?? "—"
}
