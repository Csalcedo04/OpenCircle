import type { PAYOUT_MODES } from "../../db/schema";
import { AppError } from "../../errors/app-error";

export type PayoutMode = (typeof PAYOUT_MODES)[number];

// One row per round is created at start, so the number of rounds stays bounded (5 years monthly).
export const MAX_ROUNDS = 60;

/**
 * How an END circle (a pot held until its goal) is set up: the goal plus either what each
 * member pays per round or how many rounds it takes. Amounts in minor units.
 */
export type GoalTerms = { goalValue: bigint; size: number } & ({ contributionValue: bigint } | { roundsTotal: number });

export interface GoalPlan {
  contributionValue: bigint;
  roundsTotal: number;
}

// The goal must split exactly into rounds × members contributions; offer the nearest goals that do.
function notDivisible(goalValue: bigint, step: bigint, message: string): AppError {
  const lower = (goalValue / step) * step;
  const upper = lower + step;
  return new AppError(422, "GOAL_NOT_DIVISIBLE", message, {
    validGoals: [...(lower > 0n ? [lower] : []), upper].map(String),
  });
}

function checkRounds(rounds: bigint): number {
  if (rounds < 1n || rounds > BigInt(MAX_ROUNDS)) {
    throw new AppError(422, "TOO_MANY_ROUNDS", `A circle runs between 1 and ${MAX_ROUNDS} rounds`, { maxRounds: MAX_ROUNDS });
  }
  return Number(rounds);
}

/** Contribution and rounds of an END circle, or 422 when the goal doesn't split exactly. */
export function planGoal(terms: GoalTerms): GoalPlan {
  const size = BigInt(terms.size);
  if ("roundsTotal" in terms) {
    const rounds = checkRounds(BigInt(terms.roundsTotal));
    const step = size * BigInt(rounds);
    if (terms.goalValue % step !== 0n) {
      throw notDivisible(terms.goalValue, step, "The goal must split exactly into members × rounds contributions");
    }
    return { contributionValue: terms.goalValue / step, roundsTotal: rounds };
  }
  const step = terms.contributionValue * size;
  // Paying more than goal / members would overshoot the goal in the first round.
  if (step > terms.goalValue) {
    throw new AppError(422, "CONTRIBUTION_TOO_HIGH", "The contribution can't exceed the goal divided by the members", {
      maxContribution: String(terms.goalValue / size),
    });
  }
  if (terms.goalValue % step !== 0n) {
    throw notDivisible(terms.goalValue, step, "The goal must be a whole number of rounds of contributions");
  }
  return { contributionValue: terms.contributionValue, roundsTotal: checkRounds(terms.goalValue / step) };
}

/** A stored circle's terms: what each round collects and how long it runs. */
export interface CircleTerms {
  payoutMode: PayoutMode;
  goalValue: bigint | null;
  contributionValue: bigint;
  size: number;
}

/** PER_ROUND: one round per member. END: as many as the goal needs (the DB keeps it exact). */
export function roundsTotal(c: CircleTerms): number {
  if (c.payoutMode === "PER_ROUND" || c.goalValue === null) return c.size;
  return Number(c.goalValue / (c.contributionValue * BigInt(c.size)));
}

/** Everything the circle collects if everyone pays: the END goal, or every round's pot. */
export function circleGoal(c: CircleTerms): bigint {
  return c.goalValue ?? c.contributionValue * BigInt(c.size) * BigInt(roundsTotal(c));
}
