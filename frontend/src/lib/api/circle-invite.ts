import "server-only"

import { z } from "zod"
import { backendFetch } from "@/lib/api/backend"
import { CIRCLE_VISIBILITIES, type CircleVisibility } from "@/lib/flows/circle-invite"

// The part of the circle response these calls need; the API returns the whole circle.
const inviteStateSchema = z.object({
  visibility: z.enum(CIRCLE_VISIBILITIES),
  inviteUrl: z.url().nullable(),
})

export type InviteState = z.infer<typeof inviteStateSchema>

/** Creator only, while the circle is OPEN. */
export function setCircleVisibility(circleId: string, visibility: CircleVisibility): Promise<InviteState> {
  return backendFetch(`/circles/${encodeURIComponent(circleId)}/visibility`, inviteStateSchema, {
    method: "PATCH",
    body: JSON.stringify({ visibility }),
  })
}

/** New invite code: links with the old one stop working. Creator only, while OPEN. */
export function rotateCircleInvite(circleId: string): Promise<InviteState> {
  return backendFetch(`/circles/${encodeURIComponent(circleId)}/invite-code`, inviteStateSchema, { method: "POST" })
}
