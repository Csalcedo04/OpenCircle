import type { CircleDto, MemberDto, ReviewDto } from "@/lib/api/backend"
import type { Circle, ContributionStatus, Member, Review } from "@/lib/domain/types"

// API data → the UI's domain types. Pure functions, so pages stay unchanged and this is easy to test.

/** Days per round shown in the UI ("7d por turno"); the API speaks in cadences. */
export const CADENCE_DAYS = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30 } as const

/** The API's payment states → what members see on a round. */
export function contributionStatus(status: string): ContributionStatus {
  switch (status) {
    case "COMPLETED":
      return "VERIFIED"
    case "FAILED":
      return "MISSING"
    case "CANCELLED":
      return "REFUNDED"
    default:
      // PENDING and PROCESSING: not confirmed yet.
      return "PENDING"
  }
}

/**
 * The UI keys seats, beneficiaries and contributions by member (person). The API keys them by
 * seat id, so seat ids are translated to the seat's user id.
 */
export function toCircle(dto: CircleDto): Circle {
  const userBySeat = new Map(dto.seats.map((s) => [s.memberId, s.userId]))
  const user = (seatId: string) => userBySeat.get(seatId) ?? seatId
  return {
    id: dto.id,
    name: dto.name,
    city: dto.city,
    status: dto.status,
    contribution: dto.contribution,
    feeBps: dto.feeBps,
    thresholdValue: dto.threshold.value,
    grantWeightBps: dto.grantWeightBps,
    roundLengthDays: CADENCE_DAYS[dto.cadence],
    poolWalletAddress: dto.poolWalletAddress,
    size: dto.size,
    seats: dto.seats.map((s, idx) => ({
      memberId: s.userId,
      seatId: s.memberId,
      displayName: s.displayName,
      payoutRound: s.payoutRound ?? idx + 1,
      collateralValue: s.collateral.value,
      grant: s.grantMode,
      fundingSource: s.fundingSource,
      isApprover: s.isApprover,
    })),
    rounds: dto.rounds.map((r) => {
      const fallbackUser = dto.seats.find((s) => s.payoutRound === r.number)?.userId ?? ""
      return {
        number: r.number,
        beneficiaryId: r.beneficiaryMemberId ? user(r.beneficiaryMemberId) : fallbackUser,
        status: r.state,
        deadline: r.deadline,
        contributions: r.contributions.map((c) => ({ memberId: user(c.memberId), status: contributionStatus(c.status) })),
      }
    }),
    // The UI's "no current round" is 0.
    currentRound: dto.currentRound ?? 0,
    visibility: dto.visibility,
    cadence: dto.cadence,
    approvalMode: dto.approvalMode,
    payoutOrder: dto.payoutOrder,
  }
}

/** The circle's members, from its seats (name is "Ana G."; seats don't carry wallets). */
export function membersOf(dto: CircleDto): Member[] {
  return dto.seats.map((s) => ({
    id: s.userId,
    name: s.displayName,
    walletAddress: null,
    memberSince: s.record.memberSince,
    payments: s.record.payments,
    ratings: s.record.ratings,
    circlesCompleted: s.record.circlesCompleted,
  }))
}

export function toMember(dto: MemberDto): Member {
  return {
    id: dto.id,
    name: dto.displayName,
    walletAddress: dto.walletAddress,
    memberSince: dto.memberSince,
    payments: dto.payments,
    ratings: dto.ratings,
    circlesCompleted: dto.circlesCompleted,
  }
}

export function toReview(dto: ReviewDto): Review {
  return {
    id: dto.id,
    authorId: dto.authorId,
    authorName: dto.authorName,
    subjectId: dto.subjectId,
    circleId: dto.circleId,
    circleName: dto.circleName,
    // The API checks 1–5 (database constraint + schema).
    rating: dto.rating as Review["rating"],
    comment: dto.comment ?? "",
    date: dto.createdAt,
  }
}
