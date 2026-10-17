import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AppError } from "../src/errors/app-error";
import { collectedValue, expectedPerRound } from "../src/services/circle.service";
import { majorityOutcome } from "../src/services/circles/application.service";
import { MAX_ROUNDS, planCircle, roundsTotal } from "../src/services/circles/circle-plan";
import { DAY_MS, penaltyAt, roundDeadline } from "../src/services/circles/schedule";

const COP = (pesos: number) => BigInt(pesos) * 100n; // COP, scale 2

const rejectsWith = (fn: () => unknown, code: string, details?: Record<string, unknown>) =>
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.status, 422);
    assert.equal(err.code, code);
    if (details) assert.deepEqual(err.details, details);
    return true;
  });

describe("planCircle", () => {
  test("by rounds: contribution = goal ÷ (members × rounds)", () => {
    assert.deepEqual(planCircle({ goal: COP(500_000), size: 5, roundsTotal: 1 }), { contribution: COP(100_000), roundsTotal: 1 });
    assert.deepEqual(planCircle({ goal: COP(500_000), size: 5, roundsTotal: 5 }), { contribution: COP(20_000), roundsTotal: 5 });
  });

  test("by contribution: rounds = goal ÷ (contribution × members)", () => {
    assert.deepEqual(planCircle({ goal: COP(500_000), size: 5, contribution: COP(50_000) }), {
      contribution: COP(50_000),
      roundsTotal: 2,
    });
    assert.deepEqual(planCircle({ goal: COP(500_000), size: 5, contribution: COP(100_000) }), {
      contribution: COP(100_000),
      roundsTotal: 1,
    });
  });

  test("a contribution above goal ÷ members is impossible (one round would exceed the goal)", () => {
    rejectsWith(() => planCircle({ goal: COP(500_000), size: 5, contribution: COP(300_000) }), "CONTRIBUTION_TOO_HIGH", {
      maxContribution: COP(100_000).toString(),
    });
  });

  test("a goal that doesn't split exactly is refused with the nearest valid goals", () => {
    rejectsWith(() => planCircle({ goal: 50_000_000n, size: 3, roundsTotal: 1 }), "GOAL_NOT_DIVISIBLE", {
      suggestedGoals: { lower: "49999998", upper: "50000001" },
    });
    rejectsWith(() => planCircle({ goal: COP(500_000), size: 5, contribution: COP(30_000) }), "GOAL_NOT_DIVISIBLE", {
      suggestedGoals: { lower: COP(450_000).toString(), upper: COP(600_000).toString() },
    });
    // Below one step there is no lower goal.
    rejectsWith(() => planCircle({ goal: 2n, size: 3, roundsTotal: 1 }), "GOAL_NOT_DIVISIBLE", {
      suggestedGoals: { lower: null, upper: "3" },
    });
  });

  test("more than MAX_ROUNDS rounds is refused", () => {
    rejectsWith(() => planCircle({ goal: BigInt(2 * (MAX_ROUNDS + 1)), size: 2, contribution: 1n }), "TOO_MANY_ROUNDS");
    assert.equal(planCircle({ goal: BigInt(2 * MAX_ROUNDS), size: 2, contribution: 1n }).roundsTotal, MAX_ROUNDS);
  });

  test("stays exact beyond Number.MAX_SAFE_INTEGER", () => {
    const contribution = BigInt(Number.MAX_SAFE_INTEGER) * 10n + 7n;
    const plan = planCircle({ goal: contribution * 4n * 3n, size: 4, roundsTotal: 3 });
    assert.equal(plan.contribution, contribution);
  });

  test("rejects non-positive goals and contributions as programming errors", () => {
    assert.throws(() => planCircle({ goal: 0n, size: 3, roundsTotal: 1 }), RangeError);
    assert.throws(() => planCircle({ goal: 10n, size: 2, contribution: 0n }), RangeError);
  });

  test("roundsTotal of a stored circle", () => {
    assert.equal(roundsTotal({ goalValue: COP(500_000), contributionValue: COP(20_000), size: 5 }), 5);
    assert.equal(roundsTotal({ goalValue: 18n, contributionValue: 2n, size: 3 }), 3);
  });
});

describe("round amounts", () => {
  test("collectedValue sums only completed contributions", () => {
    const rows = [
      { status: "COMPLETED", value: 100n },
      { status: "PENDING", value: 100n },
      { status: "COMPLETED", value: 250n },
      { status: "FAILED", value: 100n },
    ];
    assert.equal(collectedValue(rows), 350n);
    assert.equal(collectedValue([]), 0n);
  });

  test("expectedPerRound is contribution × members", () => {
    assert.equal(expectedPerRound({ contributionValue: COP(20_000), size: 5 }), COP(100_000));
  });
});

describe("schedule", () => {
  const start = new Date("2026-01-01T00:00:00Z");

  test("roundDeadline: one round length per round after the start", () => {
    assert.equal(roundDeadline(start, 30, 1).getTime() - start.getTime(), 30 * DAY_MS);
    assert.equal(roundDeadline(start, 7, 3).getTime() - start.getTime(), 21 * DAY_MS);
  });

  test("penaltyAt: 14 days after the deadline when the next cycle is far away", () => {
    const deadline = roundDeadline(start, 30, 1);
    const next = roundDeadline(start, 30, 2);
    assert.equal(penaltyAt(deadline, next).getTime() - deadline.getTime(), 14 * DAY_MS);
  });

  test("penaltyAt: 5 days before the next cycle when that comes first", () => {
    const deadline = roundDeadline(start, 7, 1);
    const next = roundDeadline(start, 7, 2);
    assert.equal(next.getTime() - penaltyAt(deadline, next).getTime(), 5 * DAY_MS);
  });

  test("penaltyAt: never before the deadline, even with rounds shorter than 5 days", () => {
    const deadline = roundDeadline(start, 3, 1);
    const next = roundDeadline(start, 3, 2);
    assert.equal(penaltyAt(deadline, next).getTime(), deadline.getTime());
  });

  test("penaltyAt: the last round gets the 14 days", () => {
    const deadline = roundDeadline(start, 7, 4);
    assert.equal(penaltyAt(deadline, null).getTime() - deadline.getTime(), 14 * DAY_MS);
  });
});

describe("majorityOutcome", () => {
  test("accepts with more than half of the members", () => {
    assert.equal(majorityOutcome({ accept: 1, reject: 0 }, 1), "ACCEPT");
    assert.equal(majorityOutcome({ accept: 2, reject: 0 }, 3), "ACCEPT");
    assert.equal(majorityOutcome({ accept: 3, reject: 1 }, 4), "ACCEPT");
  });

  test("rejects once acceptance can no longer happen", () => {
    assert.equal(majorityOutcome({ accept: 0, reject: 1 }, 2), "REJECT");
    assert.equal(majorityOutcome({ accept: 1, reject: 2 }, 3), "REJECT");
    assert.equal(majorityOutcome({ accept: 0, reject: 2 }, 4), "REJECT");
  });

  test("stays open while either outcome is still possible", () => {
    assert.equal(majorityOutcome({ accept: 0, reject: 0 }, 1), null);
    assert.equal(majorityOutcome({ accept: 1, reject: 0 }, 2), null);
    assert.equal(majorityOutcome({ accept: 1, reject: 1 }, 3), null);
    assert.equal(majorityOutcome({ accept: 2, reject: 1 }, 4), null);
  });
});
