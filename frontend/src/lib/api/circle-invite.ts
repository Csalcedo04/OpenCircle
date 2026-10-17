import "server-only"

import { z } from "zod"
import { backendFetch } from "@/lib/api/backend"
import { CIRCLE_VISIBILITIES, type CircleVisibility } from "@/lib/flows/circle-invite"

// The part of the circle response this call needs; the API returns the whole circle.
const visibilityStateSchema = z.object({ visibility: z.enum(CIRCLE_VISIBILITIES) })

export type VisibilityState = z.infer<typeof visibilityStateSchema>

/** Creator only, while the circle is OPEN. */
export function setCircleVisibility(circleId: string, visibility: CircleVisibility): Promise<VisibilityState> {
  return backendFetch(`/circles/${encodeURIComponent(circleId)}/visibility`, visibilityStateSchema, {
    method: "PATCH",
    body: JSON.stringify({ visibility }),
  })
}
