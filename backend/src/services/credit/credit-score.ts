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

export function scoreStatus(score: number, config: ScoreConfig = DEFAULT_SCORE_CONFIG): ScoreStatus {
  const { excellent, good, fair } = config.statusThresholds;
  if (score >= excellent) return "excellent";
  if (score >= good) return "good";
  if (score >= fair) return "fair";
  return "poor";
}

export function calculateCreditScore(
  currentScore: number,
  payments: RoundPaymentSummary,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreResult {
  const { expectedPayments, paidOnTime, paidLate, missedPayments } = payments;

  if (!Number.isFinite(currentScore) || currentScore < config.minScore || currentScore > config.maxScore) {
    throw new RangeError("Invalid current score");
  }

  const counts = [paidOnTime, paidLate, missedPayments];
  if (!Number.isInteger(expectedPayments) || expectedPayments <= 0 || counts.some((c) => !Number.isInteger(c) || c < 0)) {
    throw new RangeError("Invalid payment summary");
  }

  if (paidOnTime + paidLate + missedPayments !== expectedPayments) {
    throw new RangeError("Payment counts must equal expected payments");
  }

  const change =
    paidOnTime === expectedPayments
      ? config.perfectRoundBonus
      : -config.baseFailurePenalty -
        config.missedPaymentPenalty * (missedPayments / expectedPayments) -
        config.latePaymentPenalty * paidLate;

  const newScore = round2(Math.min(config.maxScore, Math.max(config.minScore, currentScore + change)));

  return {
    previousScore: currentScore,
    newScore,
    change: round2(newScore - currentScore),
    paymentRate: Math.round(((paidOnTime + paidLate) / expectedPayments) * 100),
    status: scoreStatus(newScore, config),
  };
}
