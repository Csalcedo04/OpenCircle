import { applyBps } from "./money"

export const CALC_LIMITS = {
  minParticipants: 2,
  maxParticipants: 20,
  minContribution: 1_000n,
  maxContribution: 10_000_000n,
  maxFeeBps: 1_000,
} as const

export type CircleEstimate = {
  /** Collected into the pool each round: participants × contribution. */
  total: bigint
  /** Illustrative platform fee on the round's pot, rounded down. */
  fee: bigint
  /** What the round's beneficiary receives: total − fee. */
  payout: bigint
}

/**
 * Savings-circle estimate in whole currency units (pesos). Integer math only:
 * no floats ever touch an amount.
 */
export function estimateCircle(participants: number, contribution: bigint, feeBps: number): CircleEstimate {
  if (!Number.isInteger(participants) || participants < 0) throw new RangeError("participants must be a non-negative integer")
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new RangeError("feeBps must be an integer between 0 and 10000")
  if (contribution < 0n) throw new RangeError("contribution must be non-negative")
  const total = contribution * BigInt(participants)
  const fee = applyBps(total, feeBps)
  return { total, fee, payout: total - fee }
}

export function clampParticipants(n: number): number {
  if (!Number.isFinite(n)) return CALC_LIMITS.minParticipants
  return Math.min(CALC_LIMITS.maxParticipants, Math.max(CALC_LIMITS.minParticipants, Math.round(n)))
}

/** Whole pesos from free-form input ("20.000", "20,000", "$ 20000"); null if invalid or out of range. */
export function parseContribution(input: string): bigint | null {
  const digits = input.replace(/[\s.,$]/g, "").replace(/cop/i, "")
  if (!/^\d{1,9}$/.test(digits)) return null
  const value = BigInt(digits)
  if (value < CALC_LIMITS.minContribution || value > CALC_LIMITS.maxContribution) return null
  return value
}
