import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { afterFee, planFinalPayouts, planRoundPayouts, type PlanContribution, type PlanRound } from "../src/services/circles/payout-plan";

// 20.000,00 COP per contribution, 5 members: a full round collects 100.000,00.
const C = 2_000_000n;
const MEMBERS = ["ana", "bob", "cata", "dani", "eva"];

let ids = 0;
const contributions = (statuses: Record<string, PlanContribution["status"]> = {}, value = C): PlanContribution[] =>
  MEMBERS.map((memberId) => ({ id: `c${++ids}-${memberId}`, memberId, value, status: statuses[memberId] ?? "COMPLETED" }));

const round = (number: number, beneficiaryMemberId: string | null, statuses: Record<string, PlanContribution["status"]> = {}): PlanRound => ({
  id: `r${number}`,
  number,
  beneficiaryMemberId,
  contributions: contributions(statuses),
});

const amounts = (planned: { kind: string; memberId: string; value: bigint }[]) => planned.map((p) => [p.kind, p.memberId, p.value]);

describe("afterFee", () => {
  test("rounds the fee down; the residue stays with the payout", () => {
    assert.deepEqual(afterFee(10_000_000n, 200), { net: 9_800_000n, fee: 200_000n });
    assert.deepEqual(afterFee(99n, 200), { net: 98n, fee: 1n });
    assert.deepEqual(afterFee(49n, 200), { net: 49n, fee: 0n });
    assert.deepEqual(afterFee(10_000_000n, 0), { net: 10_000_000n, fee: 0n });
  });

  test("bigint amounts beyond Number.MAX_SAFE_INTEGER stay exact", () => {
    assert.deepEqual(afterFee(900_000_000_000_000_001n, 200), { net: 882_000_000_000_000_001n, fee: 18_000_000_000_000_000n });
  });
});

describe("planRoundPayouts (PER_ROUND)", () => {
  test("a full round: the whole pot to its beneficiary, with a deterministic key", () => {
    const r1 = round(1, "ana");
    const planned = planRoundPayouts(r1, [], 0);
    assert.deepEqual(planned, [{ key: "payout:round:r1", kind: "ROUND", roundId: "r1", memberId: "ana", value: 10_000_000n, fee: 0n }]);
  });

  test("the fee is taken from the payout and reported", () => {
    const [p] = planRoundPayouts(round(1, "ana"), [], 200);
    assert.equal(p?.value, 9_800_000n);
    assert.equal(p?.fee, 200_000n);
  });

  test("a short round pays what it collected (bob missed: ana gets 80k)", () => {
    assert.deepEqual(amounts(planRoundPayouts(round(1, "ana", { bob: "FAILED" }), [], 0)), [["ROUND", "ana", 8_000_000n]]);
  });

  test("the defaulter's own round nets their debt and compensates who received less", () => {
    const r1 = round(1, "ana", { bob: "FAILED" });
    const r2 = round(2, "bob");
    const planned = planRoundPayouts(r2, [r1], 0);
    assert.deepEqual(amounts(planned), [
      ["ROUND", "bob", 8_000_000n],
      ["COMPENSATION", "ana", 2_000_000n],
    ]);
    const compensation = planned.find((p) => p.kind === "COMPENSATION");
    assert.equal(compensation?.roundId, "r1");
    assert.equal(compensation?.key, `payout:compensation:${r1.contributions.find((c) => c.memberId === "bob")?.id}`);
  });

  test("several debts are compensated oldest first", () => {
    const r1 = round(1, "ana", { cata: "FAILED" });
    const r2 = round(2, "bob", { cata: "FAILED" });
    assert.deepEqual(amounts(planRoundPayouts(round(3, "cata"), [r2, r1], 0)), [
      ["ROUND", "cata", 6_000_000n],
      ["COMPENSATION", "ana", 2_000_000n],
      ["COMPENSATION", "bob", 2_000_000n],
    ]);
  });

  test("when the pot can't cover the debts, compensation goes as far as it reaches", () => {
    // Everyone but eva missed round 3 (eva's): it collected only 20k; eva owes 2 × 20k.
    const r1 = round(1, "ana", { eva: "FAILED" });
    const r2 = round(2, "bob", { eva: "FAILED" });
    const r3 = round(3, "eva", { ana: "FAILED", bob: "FAILED", cata: "FAILED", dani: "FAILED" });
    assert.deepEqual(amounts(planRoundPayouts(r3, [r1, r2], 0)), [["COMPENSATION", "ana", 2_000_000n]]);
  });

  test("a miss in their own round, or in a later one, is not netted", () => {
    const r1 = round(1, "ana", { ana: "FAILED" });
    assert.deepEqual(amounts(planRoundPayouts(r1, [], 0)), [["ROUND", "ana", 8_000_000n]]);
    const later = round(3, "cata", { ana: "FAILED" });
    assert.deepEqual(amounts(planRoundPayouts(round(2, "ana"), [r1, later], 0)), [["ROUND", "ana", 10_000_000n]]);
  });

  test("nothing collected → no payout rows", () => {
    const empty = round(1, "ana", Object.fromEntries(MEMBERS.map((m) => [m, "FAILED" as const])));
    assert.deepEqual(planRoundPayouts(empty, [], 200), []);
  });

  test("END rounds (no beneficiary) plan nothing per round", () => {
    assert.deepEqual(planRoundPayouts(round(1, null), [], 0), []);
  });
});

describe("planFinalPayouts (END)", () => {
  test("each member gets back what they paid in (500k goal: 100k each), after the fee", () => {
    const rounds = [1, 2, 3, 4, 5].map((n) => round(n, null));
    const planned = planFinalPayouts("circle", MEMBERS, rounds, 200);
    assert.equal(planned.length, 5);
    assert.ok(planned.every((p) => p.kind === "FINAL" && p.roundId === null && p.value === 9_800_000n && p.fee === 200_000n));
    assert.deepEqual(
      planned.map((p) => p.key),
      MEMBERS.map((m) => `payout:final:circle:${m}`),
    );
  });

  test("a member who missed rounds gets only what they paid; nobody gets someone else's money", () => {
    const rounds = [round(1, null, { bob: "FAILED" }), round(2, null, { bob: "FAILED", cata: "FAILED" })];
    assert.deepEqual(amounts(planFinalPayouts("c", ["ana", "bob", "cata"], rounds, 0)), [
      ["FINAL", "ana", 4_000_000n],
      ["FINAL", "cata", 2_000_000n],
    ]);
  });
});
