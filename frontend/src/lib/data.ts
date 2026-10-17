import "server-only"

import { circles, members, reviews } from "@/lib/mock/data"
import type { Circle, CircleStatus, ContributionStatus, GrantMode, Member, Review, RoundStatus } from "@/lib/domain/types"
import { getCircleDetails, listApiCircles, getMyCircles, getApiMember, type ApiCircleSummary, type FullCircleDto } from "@/lib/api/backend"

function dtoToCircle(dto: FullCircleDto): Circle {
  return {
    id: dto.id,
    name: dto.name,
    city: dto.city,
    status: dto.status,
    contribution: {
      value: dto.contribution.value,
      assetCode: dto.contribution.assetCode,
      assetScale: dto.contribution.assetScale,
    },
    feeBps: dto.feeBps,
    thresholdValue: dto.threshold.value,
    grantWeightBps: dto.grantWeightBps,
    roundLengthDays: dto.cadence === "WEEKLY" ? 7 : 30,
    poolWalletAddress: dto.poolWalletAddress,
    size: dto.size,
    seats: dto.seats.map((s) => ({
      memberId: s.memberId,
      displayName: s.displayName,
      payoutRound: s.payoutRound,
      collateralValue: s.collateral.value,
      grant: s.grantMode as GrantMode | null,
    })),
    rounds: dto.rounds.map((r) => ({
      number: r.number,
      beneficiaryId: r.beneficiaryMemberId,
      status: r.state as RoundStatus,
      deadline: r.deadline,
      contributions: r.contributions.map((c) => ({
        memberId: c.memberId,
        status: (c.status.toUpperCase() as ContributionStatus) || "PENDING",
      })),
    })),
    currentRound: dto.currentRound ?? 1,
    visibility: dto.visibility,
    cadence: dto.cadence,
    ...(dto.inviteUrl ? { inviteUrl: dto.inviteUrl } : {}),
  }
}

export function summaryToCircle(s: ApiCircleSummary): Circle {
  return {
    id: s.id,
    name: s.name,
    city: s.city,
    status: (s.status as CircleStatus) || "OPEN",
    contribution: {
      value: s.contribution.value,
      assetCode: s.contribution.assetCode,
      assetScale: s.contribution.assetScale,
    },
    feeBps: 200,
    thresholdValue: s.contribution.value,
    grantWeightBps: 5000,
    roundLengthDays: s.cadence === "WEEKLY" ? 7 : 30,
    poolWalletAddress: "$ilp.rafiki.money/pool-" + s.id.slice(0, 8),
    size: s.size,
    seats: Array.from({ length: s.seatsTaken }, (_, i) => ({
      memberId: `seat-${i + 1}`,
      payoutRound: i + 1,
      collateralValue: "0",
      grant: null,
    })),
    rounds: [],
    currentRound: 1,
    visibility: s.visibility,
    cadence: s.cadence,
  }
}

export async function listCircles(): Promise<Circle[]> {
  try {
    const apiCircles = await listApiCircles()
    if (apiCircles && apiCircles.length > 0) {
      const live = apiCircles.map(summaryToCircle)
      const liveIds = new Set(live.map((c) => c.id))
      return [...live, ...circles.filter((c) => !liveIds.has(c.id))]
    }
  } catch {
    // If backend is unreachable or offline, fallback to mock data
  }
  return circles
}

export async function listMyCircles(): Promise<Circle[]> {
  try {
    const apiCircles = await getMyCircles()
    if (apiCircles && apiCircles.length > 0) {
      return apiCircles.map(summaryToCircle)
    }
  } catch {
    // If backend is unreachable or offline
  }
  return []
}

export async function getCircle(id: string, options?: { invite?: string }): Promise<Circle | undefined> {
  try {
    const dto = await getCircleDetails(id, options?.invite)
    if (dto) return dtoToCircle(dto)
  } catch {
    // Fallback to mock data if it matches a mock id or if backend is offline
  }
  return circles.find((c) => c.id === id)
}

export async function listMembers(): Promise<Member[]> {
  return members
}

export async function getMember(id: string): Promise<Member | undefined> {
  const mock = members.find((m) => m.id === id)
  if (mock) return mock

  try {
    const api = await getApiMember(id)
    if (api) {
      return {
        id: api.id,
        name: api.displayName,
        walletAddress: api.walletAddress ?? "$ilp.rafiki.money/" + api.displayName.toLowerCase().replace(/\s+/g, ""),
        memberSince: api.memberSince ?? new Date().toISOString(),
        payments: api.payments,
        circlesCompleted: api.circlesCompleted,
      }
    }
  } catch {
    //
  }
  return undefined
}

export interface MemberFullProfile {
  member: Member
  reviews: Review[]
  circles: Circle[]
}

export async function getMemberFull(id: string): Promise<MemberFullProfile | null> {
  const mock = members.find((m) => m.id === id)
  if (mock) {
    const memberCircles = (await listCircles()).filter((c) => c.seats.some((s) => s.memberId === id))
    const memberReviews = reviews.filter((r) => r.subjectId === id)
    return { member: mock, reviews: memberReviews, circles: memberCircles }
  }

  try {
    const api = await getApiMember(id)
    if (api) {
      const member: Member = {
        id: api.id,
        name: api.displayName,
        walletAddress: api.walletAddress ?? "$ilp.rafiki.money/" + api.displayName.toLowerCase().replace(/\s+/g, ""),
        memberSince: api.memberSince ?? new Date().toISOString(),
        payments: api.payments,
        circlesCompleted: api.circlesCompleted,
      }
      const memberReviews: Review[] = api.reviews.map((r) => ({
        id: r.id,
        authorId: r.authorId,
        subjectId: r.subjectId,
        circleId: r.circleId,
        rating: (Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5),
        comment: r.comment ?? "",
        date: r.createdAt,
      }))
      const memberCircles = api.circles.map(summaryToCircle)
      return { member, reviews: memberReviews, circles: memberCircles }
    }
  } catch {
    //
  }
  return null
}

export async function listReviews(): Promise<Review[]> {
  return reviews
}

export async function circlesForMember(id: string): Promise<Circle[]> {
  const all = await listCircles()
  return all.filter((c) => c.seats.some((s) => s.memberId === id))
}
