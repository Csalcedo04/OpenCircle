import "server-only"

import { fetchCircle, fetchCircleApplications, fetchCircles, fetchMember, getMyCircles, type CircleSummaryDto } from "@/lib/api/backend"
import { CADENCE_DAYS, membersOf, toCircle, toCircleApplication, toMember, toReview } from "@/lib/circles/from-api"
import type { ApprovalMode, Circle, CircleApplication, CircleVisibility, Member, Review } from "@/lib/domain/types"

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
  access: { visibility: CircleVisibility; approvalMode: ApprovalMode; inviteUrl: string | null; isCreator: boolean }
}

/** A member with the reviews they received and the circles they're in. */
export interface MemberView {
  member: Member
  reviews: Review[]
  circles: CircleView[]
}

function fromSummary(s: CircleSummaryDto): CircleView {
  return {
    circle: {
      id: s.id,
      name: s.name,
      city: s.city,
      status: s.status,
      contribution: s.contribution,
      feeBps: 200,
      thresholdValue: s.contribution.value,
      grantWeightBps: 5000,
      roundLengthDays: CADENCE_DAYS[s.cadence],
      poolWalletAddress: "",
      size: s.size,
      seats: [],
      rounds: [],
      currentRound: 0,
      visibility: s.visibility,
      approvalMode: "DELEGATES",
      cadence: s.cadence,
    },
    members: [],
    reviews: [],
    access: {
      visibility: s.visibility,
      approvalMode: "DELEGATES",
      inviteUrl: null,
      isCreator: false,
    },
  }
}

export async function getCircleView(id: string, invite?: string): Promise<CircleView | undefined> {
  try {
    const dto = await fetchCircle(id, invite)
    if (!dto) return undefined
    return {
      circle: toCircle(dto),
      members: membersOf(dto),
      reviews: dto.reviews.map(toReview),
      access: {
        visibility: dto.visibility,
        approvalMode: dto.approvalMode,
        inviteUrl: dto.inviteUrl,
        isCreator: dto.inviteUrl !== null,
      },
    }
  } catch {
    return undefined
  }
}

export async function getCircleApplications(id: string): Promise<CircleApplication[]> {
  try {
    const dtos = await fetchCircleApplications(id)
    return dtos.map(toCircleApplication)
  } catch {
    return []
  }
}

/** Every listed circle with its details (the list page shows trust and the current round). */
export async function listCircleViews(): Promise<CircleView[]> {
  try {
    const summaries = await fetchCircles()
    const views = await Promise.all(
      summaries.map(async (s) => {
        try {
          const detailedView = await getCircleView(s.id)
          return detailedView ?? fromSummary(s)
        } catch {
          return fromSummary(s)
        }
      }),
    )
    return views
  } catch {
    return []
  }
}

/** The circles the signed-in user has a seat in, private ones included. */
export async function listMyCircleViews(): Promise<CircleView[]> {
  try {
    const summaries = await getMyCircles()
    const views = await Promise.all(
      summaries.map(async (s) => {
        try {
          const detailedView = await getCircleView(s.id)
          return detailedView ?? fromSummary(s)
        } catch {
          return fromSummary(s)
        }
      }),
    )
    return views
  } catch {
    return []
  }
}

export async function getMemberView(id: string): Promise<MemberView | undefined> {
  try {
    const dto = await fetchMember(id)
    if (!dto) return undefined
    return { member: toMember(dto), reviews: dto.reviews.map(toReview), circles: await detailed(dto.circles.map((c) => c.id)) }
  } catch {
    return undefined
  }
}

// The list endpoints return summaries; pages need seats and rounds too.
async function detailed(ids: readonly string[]): Promise<CircleView[]> {
  const views = await Promise.all(ids.map((id) => getCircleView(id)))
  return views.filter((v): v is CircleView => v !== undefined)
}
