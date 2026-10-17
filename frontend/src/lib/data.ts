import "server-only"

import { fetchCircle, fetchCircles, fetchMember, getMyCircles } from "@/lib/api/backend"
import { membersOf, toCircle, toMember, toReview } from "@/lib/circles/from-api"
import type { Circle, Member, Review } from "@/lib/domain/types"
import type { CircleVisibility } from "@/lib/flows/circle-invite"

/**
 * Read API for pages, backed by the OpenCircle API (signed-in requests). Pages get the
 * UI's domain types; the API shapes are translated in lib/circles/from-api.
 */

/** A circle with its members (from its seats) and the reviews left in it. */
export interface CircleView {
  circle: Circle
  members: Member[]
  reviews: Review[]
  /** Who can find and join it; `inviteUrl` is set only when the viewer created the circle. */
  access: { visibility: CircleVisibility; inviteUrl: string | null }
}

/** A member with the reviews they received and the circles they're in. */
export interface MemberView {
  member: Member
  reviews: Review[]
  circles: CircleView[]
}

export async function getCircleView(id: string, invite?: string): Promise<CircleView | undefined> {
  const dto = await fetchCircle(id, invite)
  if (!dto) return undefined
  return {
    circle: toCircle(dto),
    members: membersOf(dto),
    reviews: dto.reviews.map(toReview),
    access: { visibility: dto.visibility, inviteUrl: dto.inviteUrl },
  }
}

/** Every listed circle with its details (the list page shows trust and the current round). */
export async function listCircleViews(): Promise<CircleView[]> {
  return detailed((await fetchCircles()).map((c) => c.id))
}

/** The circles the signed-in user has a seat in, private ones included. */
export async function listMyCircleViews(): Promise<CircleView[]> {
  return detailed((await getMyCircles()).map((c) => c.id))
}

export async function getMemberView(id: string): Promise<MemberView | undefined> {
  const dto = await fetchMember(id)
  if (!dto) return undefined
  return { member: toMember(dto), reviews: dto.reviews.map(toReview), circles: await detailed(dto.circles.map((c) => c.id)) }
}

// The list endpoints return summaries; pages need seats and rounds too. Fine at demo scale
// (the API lists at most 100 circles); a circles-with-details endpoint would replace this.
async function detailed(ids: readonly string[]): Promise<CircleView[]> {
  const views = await Promise.all(ids.map((id) => getCircleView(id)))
  return views.filter((v) => v !== undefined)
}
