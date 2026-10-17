import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AppError } from "../src/errors/app-error";
import { createCircleSchema, planCircleSchema } from "../src/routes/circles";
import { circleGoal, MAX_ROUNDS, planGoal, roundsTotal } from "../src/services/circles/circle-plan";

// 500.000,00 COP in minor units (scale 2).
const GOAL = 50_000_000n;

function appError(fn: () => unknown, code: string): AppError {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof AppError, "not an AppError");
    assert.equal(err.status, 422);
    assert.equal(err.code, code);
    return err;
  }
  assert.fail(`expected ${code}`);
}

describe("planGoal", () => {
  test("by rounds: 500k, 5 members, 5 rounds → 20k each round; 1 round → 100k", () => {
    assert.deepEqual(planGoal({ goalValue: GOAL, size: 5, roundsTotal: 5 }), { contributionValue: 2_000_000n, roundsTotal: 5 });
    assert.deepEqual(planGoal({ goalValue: GOAL, size: 5, roundsTotal: 1 }), { contributionValue: 10_000_000n, roundsTotal: 1 });
  });

  test("by contribution: 500k, 5 members, 50k → 2 rounds", () => {
    assert.deepEqual(planGoal({ goalValue: GOAL, size: 5, contributionValue: 5_000_000n }), { contributionValue: 5_000_000n, roundsTotal: 2 });
  });

  test("a contribution above goal / members → 422 CONTRIBUTION_TOO_HIGH with the maximum", () => {
    const err = appError(() => planGoal({ goalValue: GOAL, size: 5, contributionValue: 30_000_000n }), "CONTRIBUTION_TOO_HIGH");
    assert.deepEqual(err.details, { maxContribution: "10000000" });
  });

  test("a goal that doesn't split exactly → 422 GOAL_NOT_DIVISIBLE with the nearest valid goals", () => {
    const byRounds = appError(() => planGoal({ goalValue: GOAL + 1n, size: 3, roundsTotal: 4 }), "GOAL_NOT_DIVISIBLE");
    // Multiples of 3 × 4 = 12 around 50.000.001.
    assert.deepEqual(byRounds.details, { validGoals: ["49999992", "50000004"] });

    const byContribution = appError(() => planGoal({ goalValue: GOAL, size: 3, contributionValue: 3_000_000n }), "GOAL_NOT_DIVISIBLE");
    // Multiples of 9.000.000 around 50.000.000.
    assert.deepEqual(byContribution.details, { validGoals: ["45000000", "54000000"] });
  });

  test("a goal smaller than one round offers only the next valid goal", () => {
    const err = appError(() => planGoal({ goalValue: 5n, size: 2, roundsTotal: 3 }), "GOAL_NOT_DIVISIBLE");
    assert.deepEqual(err.details, { validGoals: ["6"] });
  });

  test(`more than ${MAX_ROUNDS} rounds → 422 TOO_MANY_ROUNDS`, () => {
    assert.equal(planGoal({ goalValue: BigInt(2 * MAX_ROUNDS), size: 2, contributionValue: 1n }).roundsTotal, MAX_ROUNDS);
    appError(() => planGoal({ goalValue: BigInt(2 * (MAX_ROUNDS + 1)), size: 2, contributionValue: 1n }), "TOO_MANY_ROUNDS");
    appError(() => planGoal({ goalValue: 1_000_000n, size: 2, roundsTotal: MAX_ROUNDS + 1 }), "TOO_MANY_ROUNDS");
  });

  test("bigint amounts beyond Number.MAX_SAFE_INTEGER stay exact", () => {
    const goal = 900_000_000_000_000_000n;
    assert.ok(goal > BigInt(Number.MAX_SAFE_INTEGER));
    assert.deepEqual(planGoal({ goalValue: goal, size: 3, roundsTotal: 4 }), { contributionValue: 75_000_000_000_000_000n, roundsTotal: 4 });
  });
});

describe("roundsTotal and circleGoal", () => {
  test("PER_ROUND: one round per member; the goal is every round's pot", () => {
    const c = { payoutMode: "PER_ROUND" as const, goalValue: null, contributionValue: 2_000_000n, size: 3 };
    assert.equal(roundsTotal(c), 3);
    assert.equal(circleGoal(c), 18_000_000n);
  });

  test("END: rounds derived from the goal; the goal as stored", () => {
    const c = { payoutMode: "END" as const, goalValue: GOAL, contributionValue: 2_000_000n, size: 5 };
    assert.equal(roundsTotal(c), 5);
    assert.equal(circleGoal(c), GOAL);
  });
});

describe("createCircleSchema payout terms", () => {
  const base = { name: "Natillera", city: "Medellín", size: 5, cadence: "MONTHLY" };
  const parse = (body: Record<string, unknown>) => createCircleSchema.safeParse({ ...base, ...body });

  test("PER_ROUND is the default and needs only the contribution", () => {
    const r = parse({ contributionValue: "2000000" });
    assert.ok(r.success);
    assert.equal(r.data.payoutMode ?? "PER_ROUND", "PER_ROUND");
    assert.ok("contributionValue" in r.data && r.data.contributionValue === 2_000_000n);
    assert.ok(!("goalValue" in r.data));
  });

  test("END takes the goal plus either the contribution or the rounds", () => {
    const byRounds = parse({ payoutMode: "END", goalValue: "50000000", roundsTotal: 5 });
    assert.ok(byRounds.success);
    assert.deepEqual(
      { mode: byRounds.data.payoutMode, goal: "goalValue" in byRounds.data && byRounds.data.goalValue, rounds: "roundsTotal" in byRounds.data && byRounds.data.roundsTotal },
      { mode: "END", goal: 50_000_000n, rounds: 5 },
    );
    const byContribution = parse({ payoutMode: "END", goalValue: "50000000", contributionValue: "2000000" });
    assert.ok(byContribution.success);
    assert.ok("contributionValue" in byContribution.data && byContribution.data.contributionValue === 2_000_000n);
  });

  test("invalid combinations → issues on the right field", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{}, "contributionValue"],
      [{ contributionValue: "2000000", goalValue: "50000000" }, "goalValue"],
      [{ contributionValue: "2000000", roundsTotal: 5 }, "roundsTotal"],
      [{ payoutMode: "END", roundsTotal: 5 }, "goalValue"],
      [{ payoutMode: "END", goalValue: "50000000" }, "contributionValue"],
      [{ payoutMode: "END", goalValue: "50000000", contributionValue: "2000000", roundsTotal: 5 }, "contributionValue"],
      [{ payoutMode: "END", goalValue: "50000000", roundsTotal: MAX_ROUNDS + 1 }, "roundsTotal"],
      [{ payoutMode: "END", goalValue: "0", roundsTotal: 5 }, "goalValue"],
      [{ payoutMode: "END", goalValue: 50000000, roundsTotal: 5 }, "goalValue"],
      [{ payoutMode: "LATER", contributionValue: "2000000" }, "payoutMode"],
    ];
    for (const [body, path] of cases) {
      const r = parse(body);
      assert.equal(r.success, false, JSON.stringify(body));
      assert.ok(r.error?.issues.some((i) => i.path.join(".") === path), `${JSON.stringify(body)} → ${JSON.stringify(r.error?.issues)}`);
    }
  });
});

describe("planCircleSchema", () => {
  test("the funding terms and the size, validated like creating", () => {
    const r = planCircleSchema.safeParse({ payoutMode: "END", goalValue: "50000000", roundsTotal: 5, size: 5 });
    assert.ok(r.success);
    assert.deepEqual(r.data, { size: 5, payoutMode: "END", goalValue: 50_000_000n, roundsTotal: 5 });
    const perRound = planCircleSchema.safeParse({ contributionValue: "2000000", size: 3 });
    assert.ok(perRound.success);
    assert.deepEqual(perRound.data, { size: 3, payoutMode: "PER_ROUND", contributionValue: 2_000_000n });
  });

  test("anything else, or a wrong combination, is rejected", () => {
    for (const body of [
      { contributionValue: "2000000", size: 3, name: "Natillera" },
      { contributionValue: "2000000" },
      { payoutMode: "END", goalValue: "50000000", size: 5 },
      { contributionValue: "2000000", goalValue: "50000000", size: 5 },
    ]) {
      assert.equal(planCircleSchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });
});
