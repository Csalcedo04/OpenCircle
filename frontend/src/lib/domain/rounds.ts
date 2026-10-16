import { applyBps, sum, toBig } from "./money"
import type { Circle, Round, Seat } from "./types"

/** Pot for one round: every member's fixed contribution. */
export function potFor(circle: Circle): bigint {
  return toBig(circle.contribution) * BigInt(circle.size)
}

export function feeFor(circle: Circle): bigint {
  return applyBps(potFor(circle), circle.feeBps)
}

export function payoutFor(circle: Circle): bigint {
  return potFor(circle) - feeFor(circle)
}

export function currentRound(circle: Circle): Round | undefined {
  return circle.rounds.find((r) => r.number === circle.currentRound)
}

export function verifiedCount(round: Round): number {
  return round.contributions.filter((c) => c.status === "VERIFIED").length
}

export function collectedFor(circle: Circle, round: Round): bigint {
  return toBig(circle.contribution) * BigInt(verifiedCount(round))
}

export function collateralHeld(circle: Circle): bigint {
  return sum(circle.seats.map((s) => BigInt(s.collateralValue)))
}

/** Fees retained in the pool from rounds already paid out. */
export function feesRetained(circle: Circle): bigint {
  const paid = circle.rounds.filter((r) => r.status === "PAID_OUT").length
  return feeFor(circle) * BigInt(paid)
}

/**
 * Pool balance as members see it: the current round's verified contributions
 * (not yet paid out) + collateral + fees retained as OpenCircle revenue.
 */
export function poolBalance(circle: Circle): { total: bigint; round: bigint; collateral: bigint; fees: bigint } {
  const round = currentRound(circle)
  const inRound =
    round && !["PAID_OUT", "REFUNDED", "UPCOMING"].includes(round.status) ? collectedFor(circle, round) : 0n
  const collateral = collateralHeld(circle)
  const fees = feesRetained(circle)
  return { total: inRound + collateral + fees, round: inRound, collateral, fees }
}

export type CoverageDecision = {
  owes: bigint
  collateral: bigint
  grantCoverage: bigint
  uncovered: bigint
  threshold: bigint
  eligible: boolean
}

/**
 * Safe Round Engine: a beneficiary is released the pot only when their
 * uncovered future obligations are at or below the circle's threshold.
 * Collateral counts 100%; an active recurring grant counts grantWeightBps.
 */
export function evaluateCoverage(circle: Circle, seat: Pick<Seat, "payoutRound" | "collateralValue" | "grant">): CoverageDecision {
  const remainingRounds = BigInt(Math.max(0, circle.size - seat.payoutRound))
  const owes = toBig(circle.contribution) * remainingRounds
  const collateral = BigInt(seat.collateralValue)
  const grantCoverage = seat.grant === "RECURRING" ? applyBps(owes, circle.grantWeightBps) : 0n
  const gap = owes - collateral - grantCoverage
  const uncovered = gap > 0n ? gap : 0n
  const threshold = BigInt(circle.thresholdValue)
  return { owes, collateral, grantCoverage, uncovered, threshold, eligible: uncovered <= threshold }
}

export function seatFor(circle: Circle, memberId: string): Seat | undefined {
  return circle.seats.find((s) => s.memberId === memberId)
}
