/**
 * Per-round credit score (0–100) from a member's payment behavior.
 * Scores are not money, so `number` is fine here; amounts never pass through this module.
 */

export interface RoundPaymentSummary {
  expectedPayments: number;
  paidOnTime: number;
  paidLate: number;
  missedPayments: number;
}

export type ScoreStatus = "excellent" | "good" | "fair" | "poor";

export interface ScoreConfig {
  initialScore: number;
  perfectRoundBonus: number;
  baseFailurePenalty: number;
  missedPaymentPenalty: number;
  latePaymentPenalty: number;
  minScore: number;
  maxScore: number;
  /** Lowest score for each status; anything below `fair` is `poor`. */
  statusThresholds: { excellent: number; good: number; fair: number };
}

/** The slice of the config other modules need to read a score. */
export type ScoreBounds = Pick<ScoreConfig, "minScore" | "maxScore">;
export type ScoreStatusConfig = Pick<ScoreConfig, "statusThresholds">;

export interface ScoreResult {
  previousScore: number;
  newScore: number;
  change: number;
  paymentRate: number;
  status: ScoreStatus;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  initialScore: 50,
  perfectRoundBonus: 5,
  baseFailurePenalty: 3,
  missedPaymentPenalty: 12,
  latePaymentPenalty: 1,
  minScore: 0,
  maxScore: 100,
  statusThresholds: { excellent: 80, good: 65, fair: 40 },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function assertValidScore(score: number, config: ScoreBounds = DEFAULT_SCORE_CONFIG): void {
  if (!Number.isFinite(score) || score < config.minScore || score > config.maxScore) {
    throw new RangeError(`Score must be a number between ${config.minScore} and ${config.maxScore}`);
  }
}

/** Converts the stored 0..1 fraction (`credit_profiles.internal_credit_score`) to the 0..100 score (ICS). */
export function scoreFromFraction(fraction: number, config: ScoreBounds = DEFAULT_SCORE_CONFIG): number {
  const score = round2(config.minScore + fraction * (config.maxScore - config.minScore));
  assertValidScore(score, config);
  return score;
}

/** ICS for API responses: null while the user has no stored score yet. */
export const icsFromStored = (fraction: number | null): number | null =>
  fraction === null ? null : scoreFromFraction(fraction);

export function scoreStatus(score: number, config: ScoreStatusConfig = DEFAULT_SCORE_CONFIG): ScoreStatus {
  const { excellent, good, fair } = config.statusThresholds;
  if (score >= excellent) return "excellent";
  if (score >= good) return "good";
  if (score >= fair) return "fair";
  return "poor";
}

/** Converts a 0..100 score back to the stored 0..1 fraction (4 decimals). */
export function fractionFromScore(score: number, config: ScoreBounds = DEFAULT_SCORE_CONFIG): number {
  assertValidScore(score, config);
  return Math.round(((score - config.minScore) / (config.maxScore - config.minScore)) * 10_000) / 10_000;
}

/** Keeps a score within bounds, rounded to 2 decimals. */
export const clampScore = (score: number, config: ScoreBounds = DEFAULT_SCORE_CONFIG): number =>
  round2(Math.min(config.maxScore, Math.max(config.minScore, score)));

/** How much one round's payments move the score, before clamping. */
export function roundScoreChange(payments: RoundPaymentSummary, config: ScoreConfig = DEFAULT_SCORE_CONFIG): number {
  const { expectedPayments, paidOnTime, paidLate, missedPayments } = payments;

  const counts = [paidOnTime, paidLate, missedPayments];
  if (!Number.isInteger(expectedPayments) || expectedPayments <= 0 || counts.some((c) => !Number.isInteger(c) || c < 0)) {
    throw new RangeError("Invalid payment summary");
  }

  if (paidOnTime + paidLate + missedPayments !== expectedPayments) {
    throw new RangeError("Payment counts must equal expected payments");
  }

  // Missed payments cost a share of the missed penalty proportional to the round.
  // Late payments cost a flat amount each, capped so that paying late never
  // costs more than not paying at all for the same number of payments.
  const missedPenalty = config.missedPaymentPenalty * (missedPayments / expectedPayments);
  const latePenalty = Math.min(config.latePaymentPenalty * paidLate, config.missedPaymentPenalty * (paidLate / expectedPayments));
  return paidOnTime === expectedPayments ? config.perfectRoundBonus : -config.baseFailurePenalty - missedPenalty - latePenalty;
}

export function calculateCreditScore(
  currentScore: number,
  payments: RoundPaymentSummary,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreResult {
  const { expectedPayments, paidOnTime, paidLate } = payments;

  assertValidScore(currentScore, config);
  const newScore = clampScore(currentScore + roundScoreChange(payments, config), config);

  return {
    previousScore: currentScore,
    newScore,
    change: round2(newScore - currentScore),
    paymentRate: Math.round(((paidOnTime + paidLate) / expectedPayments) * 100),
    status: scoreStatus(newScore, config),
  };
}
