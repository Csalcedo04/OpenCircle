import "server-only"

import { z } from "zod"
import { backendFetch, circleSummarySchema } from "@/lib/api/backend"
import { INVITE_KINDS, INVITE_STATUSES } from "@/lib/flows/invites"

// Circle invitations (see backend routes/circles.ts): a shareable CODE with optional expiry and
// use limit, or DIRECT invites for named people. Managed by the creator and approvers.

const inviteBase = {
  id: z.uuid(),
  circleId: z.uuid(),
  status: z.enum(INVITE_STATUSES),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  createdByName: z.string(),
}

const inviteSchema = z.discriminatedUnion("kind", [
  z.object({ ...inviteBase, kind: z.literal("CODE"), inviteUrl: z.url(), uses: z.number().int(), maxUses: z.number().int().nullable() }),
  z.object({
    ...inviteBase,
    kind: z.literal("DIRECT"),
    invitee: z.object({ userId: z.uuid().nullable(), displayName: z.string().nullable(), email: z.string().nullable() }),
  }),
])

const myInvitationSchema = z.object({
  id: z.uuid(),
  circle: circleSummarySchema,
  invitedByName: z.string(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  inviteUrl: z.url(),
})

export type InviteDto = z.infer<typeof inviteSchema>
export type CodeInviteDto = Extract<InviteDto, { kind: "CODE" }>
export type DirectInviteDto = Extract<InviteDto, { kind: "DIRECT" }>
export type MyInvitationDto = z.infer<typeof myInvitationSchema>
export type InviteKind = (typeof INVITE_KINDS)[number]

export type InviteTarget = { userId: string } | { email: string }

/** What the API takes; the server computes the dates from these. */
export type CreateInviteRequest =
  | { kind: "CODE"; expiresInHours: number | null; maxUses: number | null }
  | { kind: "DIRECT"; targets: InviteTarget[]; expiresInDays: number }

const circlePath = (circleId: string) => `/circles/${encodeURIComponent(circleId)}/invites`

/** The circle's invites, newest first. Creator or approver only. */
export function getCircleInvites(circleId: string): Promise<InviteDto[]> {
  return backendFetch(circlePath(circleId), z.array(inviteSchema))
}

/** Makes a code, or one direct invite per person; direct ones are emailed by the API. */
export function createCircleInvites(circleId: string, body: CreateInviteRequest): Promise<InviteDto[]> {
  return backendFetch(circlePath(circleId), z.array(inviteSchema), { method: "POST", body: JSON.stringify(body) })
}

export function revokeCircleInvite(circleId: string, inviteId: string): Promise<InviteDto> {
  return backendFetch(`${circlePath(circleId)}/${encodeURIComponent(inviteId)}`, inviteSchema, { method: "DELETE" })
}

/** Direct invites addressed to the signed-in user (by id, or by the email on their profile). */
export function getMyInvitations(): Promise<MyInvitationDto[]> {
  return backendFetch("/users/me/invitations", z.array(myInvitationSchema))
}
