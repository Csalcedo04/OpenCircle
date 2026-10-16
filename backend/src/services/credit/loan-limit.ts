import {
  assertValidScore,
  DEFAULT_SCORE_CONFIG,
  scoreStatus,
  type ScoreBounds,
  type ScoreStatus,
  type ScoreStatusConfig,
} from "./credit-score";

/**
 * Micro-loan limit. Everyone starts at the same base limit; it grows with
 * months of membership, completed circles and reviews, is scaled by the credit
 * score status (poor freezes it), and is capped. What a member can actually
 * borrow is that limit minus the circle debt not covered by collateral or a
 * recurring approval (the same coverage rule the Safe Round Engine applies).
 *
 * Money is integer-only: `bigint` in the asset's minor unit, always paired
 * with `assetCode` and `assetScale`. Never `number`. Over the wire `value`
 * travels as a decimal string (see `toLoanLimitDto`).
 */

export interface Money {
  value: bigint;
  assetCode: string;
  assetScale: number;
}

/** JSON shape of `Money`: same tuple, `value` as a decimal string. */
export interface MoneyDto {
  value: string;
  assetCode: string;
  assetScale: number;
}

export interface LoanLimitConfig {
  baseLimit: Money;
  maxLimit: Money;
  /** Growth per completed circle, in basis points of the base limit. */
  perCircleBps: number;
  maxCountedCircles: number;
  /** Growth per full month of membership, in basis points of the base limit. */
  perMonthBps: number;
  maxCountedMonths: number;
  /** Growth at a 5.0 average rating; scales linearly from 0 at `reviewFloorTenths` (0–49). */
  maxReviewBps: number;
  reviewFloorTenths: number;
  minReviews: number;
  /** Multiplier applied to the grown limit, by score status. */
  statusMultiplierBps: Record<ScoreStatus, number>;
  /** Weight of an active recurring approval as coverage of circle debt. */
  grantWeightBps: number;
  /** Only what this module reads from the score config. */
  score: ScoreBounds & ScoreStatusConfig;
}

/** Colombian pesos (scale 2) from a whole-peso amount. */
export const cop = (whole: bigint): Money => ({ value: whole * 100n, assetCode: "COP", assetScale: 2 });

/** Placeholder values until the team sets real policy. */
export const DEFAULT_LOAN_LIMIT_CONFIG: LoanLimitConfig = {
  baseLimit: cop(50_000n),
  maxLimit: cop(500_000n),
  perCircleBps: 2_500,
  maxCountedCircles: 8,
  perMonthBps: 500,
  maxCountedMonths: 12,
  maxReviewBps: 5_000,
  reviewFloorTenths: 30,
  minReviews: 3,
  statusMultiplierBps: { excellent: 12_000, good: 11_000, fair: 10_000, poor: 0 },
  grantWeightBps: 5_000,
  score: DEFAULT_SCORE_CONFIG,
};

export interface MemberCreditProfile {
  score: number;
  memberSince: Date;
  circlesCompleted: number;
  /** Star ratings (1–5) received from other members. */
  ratings: readonly number[];
  /** Future contributions owed in circles where the member already received the pot. */
  outstandingObligations: Money;
  collateral: Money;
  hasRecurringGrant: boolean;
}

export type LimitReason = "poor_score" | "debt_exceeds_limit";

export interface LoanLimitBreakdown {
  base: Money;
  circlesBonus: Money;
  tenureBonus: Money;
  reviewsBonus: Money;
  countedCircles: number;
  countedMonths: number;
  averageRatingTenths: number | null;
  statusMultiplierBps: number;
  capped: boolean;
}

export interface LoanLimitResult {
  status: ScoreStatus;
  /** True exactly when `reasons` is empty. */
  eligible: boolean;
  reasons: LimitReason[];
  /** Limit after growth, score multiplier and cap. */
  limit: Money;
  /** Circle debt not covered by collateral or a recurring approval. */
  uncoveredDebt: Money;
  /** What the member can borrow now: limit − uncovered debt, never negative. */
  available: Money;
  breakdown: LoanLimitBreakdown;
}

/** `LoanLimitResult` with every `Money` as `MoneyDto`, safe for `res.json`. */
export interface LoanLimitDto extends Omit<LoanLimitResult, "limit" | "uncoveredDebt" | "available" | "breakdown"> {
  limit: MoneyDto;
  uncoveredDebt: MoneyDto;
  available: MoneyDto;
  breakdown: Omit<LoanLimitBreakdown, "base" | "circlesBonus" | "tenureBonus" | "reviewsBonus"> & {
    base: MoneyDto;
    circlesBonus: MoneyDto;
    tenureBonus: MoneyDto;
    reviewsBonus: MoneyDto;
  };
}

const bps = (value: bigint, points: number): bigint => (value * BigInt(points)) / 10_000n;
const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
const MS_PER_DAY = 86_400_000;
const daysInMonthOf = (d: Date): number => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

/**
 * Whole calendar months between two instants, in UTC. When `from` falls on a
 * day the target month does not have (the 31st → February), the last day of
 * that month counts as the anniversary, so joining at month-end is not penalized.
 */
export function fullMonthsBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const anniversaryDay = Math.min(from.getUTCDate(), daysInMonthOf(to));
  const dayOrTimeNotReached =
    to.getUTCDate() < anniversaryDay ||
    (to.getUTCDate() === anniversaryDay && to.getTime() % MS_PER_DAY < from.getTime() % MS_PER_DAY);
  if (dayOrTimeNotReached) months -= 1;
  return Math.max(0, months);
}

/** Average rating ×10 as an integer (46 = 4.6 stars), rounded down; null without enough reviews. */
export function averageRatingTenths(ratings: readonly number[], minReviews: number): number | null {
  if (ratings.some((r) => !Number.isInteger(r) || r < 1 || r > 5)) throw new RangeError("Ratings must be integers from 1 to 5");
  if (ratings.length < minReviews || ratings.length === 0) return null;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  return Math.floor((sum * 10) / ratings.length);
}

export const toMoneyDto = (m: Money): MoneyDto => ({ value: m.value.toString(), assetCode: m.assetCode, assetScale: m.assetScale });

export function toLoanLimitDto(r: LoanLimitResult): LoanLimitDto {
  return {
    ...r,
    limit: toMoneyDto(r.limit),
    uncoveredDebt: toMoneyDto(r.uncoveredDebt),
    available: toMoneyDto(r.available),
    breakdown: {
      ...r.breakdown,
      base: toMoneyDto(r.breakdown.base),
      circlesBonus: toMoneyDto(r.breakdown.circlesBonus),
      tenureBonus: toMoneyDto(r.breakdown.tenureBonus),
      reviewsBonus: toMoneyDto(r.breakdown.reviewsBonus),
    },
  };
}

function assertSameAsset(money: Money, like: Money, label: string): void {
  if (money.assetCode !== like.assetCode || money.assetScale !== like.assetScale) {
    throw new RangeError(`${label} must be in ${like.assetCode} (scale ${like.assetScale})`);
  }
  if (money.value < 0n) throw new RangeError(`${label} cannot be negative`);
}

function assertValidConfig(config: LoanLimitConfig): void {
  assertSameAsset(config.maxLimit, config.baseLimit, "maxLimit");
  const floor = config.reviewFloorTenths;
  if (!Number.isInteger(floor) || floor < 0 || floor >= 50) {
    throw new RangeError("reviewFloorTenths must be an integer from 0 to 49");
  }
}

export function calculateLoanLimit(
  profile: MemberCreditProfile,
  asOf: Date,
  config: LoanLimitConfig = DEFAULT_LOAN_LIMIT_CONFIG,
): LoanLimitResult {
  assertValidConfig(config);
  const base = config.baseLimit;
  assertSameAsset(profile.outstandingObligations, base, "outstandingObligations");
  assertSameAsset(profile.collateral, base, "collateral");
  assertValidScore(profile.score, config.score);
  if (!Number.isInteger(profile.circlesCompleted) || profile.circlesCompleted < 0) {
    throw new RangeError("circlesCompleted must be a non-negative integer");
  }
  if (Number.isNaN(profile.memberSince.getTime()) || Number.isNaN(asOf.getTime())) throw new RangeError("Invalid date");

  const money = (value: bigint): Money => ({ value, assetCode: base.assetCode, assetScale: base.assetScale });
  const status = scoreStatus(profile.score, config.score);

  const countedCircles = Math.min(profile.circlesCompleted, config.maxCountedCircles);
  const countedMonths = Math.min(fullMonthsBetween(profile.memberSince, asOf), config.maxCountedMonths);
  const avgTenths = averageRatingTenths(profile.ratings, config.minReviews);
  const reviewSpan = 50 - config.reviewFloorTenths;
  const reviewBps =
    avgTenths === null ? 0 : Math.floor((Math.min(reviewSpan, Math.max(0, avgTenths - config.reviewFloorTenths)) * config.maxReviewBps) / reviewSpan);

  const circlesBonus = bps(base.value, countedCircles * config.perCircleBps);
  const tenureBonus = bps(base.value, countedMonths * config.perMonthBps);
  const reviewsBonus = bps(base.value, reviewBps);
  const grown = base.value + circlesBonus + tenureBonus + reviewsBonus;

  const multiplierBps = config.statusMultiplierBps[status];
  const scaled = bps(grown, multiplierBps);
  const limit = minBig(scaled, config.maxLimit.value);

  const owed = profile.outstandingObligations.value;
  const grantCoverage = profile.hasRecurringGrant ? bps(owed, config.grantWeightBps) : 0n;
  const uncoveredDebt = maxBig(0n, owed - profile.collateral.value - grantCoverage);
  const available = maxBig(0n, limit - uncoveredDebt);

  const reasons: LimitReason[] = [];
  if (status === "poor") reasons.push("poor_score");
  else if (available === 0n) reasons.push("debt_exceeds_limit");

  return {
    status,
    eligible: reasons.length === 0,
    reasons,
    limit: money(limit),
    uncoveredDebt: money(uncoveredDebt),
    available: money(available),
    breakdown: {
      base: money(base.value),
      circlesBonus: money(circlesBonus),
      tenureBonus: money(tenureBonus),
      reviewsBonus: money(reviewsBonus),
      countedCircles,
      countedMonths,
      averageRatingTenths: avgTenths,
      statusMultiplierBps: multiplierBps,
      capped: scaled > config.maxLimit.value,
    },
  };
}
