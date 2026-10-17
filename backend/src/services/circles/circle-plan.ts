import { AppError } from "../../errors/app-error";

/**
 * Pool model: every member pays the same contribution each round into one common pot
 * until it reaches the goal. All amounts are bigint in the asset's minor unit.
 *
 *   goal = contribution × size × rounds
 */

export const MAX_ROUNDS = 120;

export type CirclePlanInput =
  | { goal: bigint; size: number; roundsTotal: number }
  | { goal: bigint; size: number; contribution: bigint };

export interface CirclePlan {
  contribution: bigint;
  roundsTotal: number;
}

// The closest goals that divide exactly by `step`, as integer strings for the response.
function nearestGoals(goal: bigint, step: bigint): { lower: string | null; upper: string } {
  const lower = goal - (goal % step);
  return { lower: lower > 0n ? lower.toString() : null, upper: (lower + step).toString() };
}

const notDivisible = (goal: bigint, step: bigint) =>
  new AppError(422, "GOAL_NOT_DIVISIBLE", "The goal must split into equal whole contributions", {
    suggestedGoals: nearestGoals(goal, step),
  });

/** Derives the per-round contribution from the number of rounds, or the number of rounds from the contribution. */
export function planCircle(input: CirclePlanInput): CirclePlan {
  const size = BigInt(input.size);
  if (input.goal <= 0n || size < 1n) throw new RangeError("Goal and size must be positive");

  if ("roundsTotal" in input) {
    const step = size * BigInt(input.roundsTotal);
    if (input.goal % step !== 0n) throw notDivisible(input.goal, step);
    return { contribution: input.goal / step, roundsTotal: input.roundsTotal };
  }

  if (input.contribution <= 0n) throw new RangeError("Contribution must be positive");
  // One round already collects contribution × size; it can't exceed the goal.
  const perRound = input.contribution * size;
  if (perRound > input.goal) {
    throw new AppError(422, "CONTRIBUTION_TOO_HIGH", "One round would already exceed the goal", {
      maxContribution: (input.goal / size).toString(),
    });
  }
  if (input.goal % perRound !== 0n) throw notDivisible(input.goal, perRound);
  const roundsTotal = input.goal / perRound;
  if (roundsTotal > BigInt(MAX_ROUNDS)) {
    throw new AppError(422, "TOO_MANY_ROUNDS", `The contribution would take more than ${MAX_ROUNDS} rounds`);
  }
  return { contribution: input.contribution, roundsTotal: Number(roundsTotal) };
}

/** Rounds of a stored circle: goal ÷ (contribution × size). The DB check keeps this exact. */
export const roundsTotal = (c: { goalValue: bigint; contributionValue: bigint; size: number }): number =>
  Number(c.goalValue / (c.contributionValue * BigInt(c.size)));
