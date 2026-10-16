import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateCreditScore, DEFAULT_SCORE_CONFIG, scoreFromFraction } from "../src/services/credit/credit-score";
import {
  averageRatingTenths,
  calculateLoanLimit,
  cop,
  DEFAULT_LOAN_LIMIT_CONFIG,
  fullMonthsBetween,
  toLoanLimitDto,
  type MemberCreditProfile,
  type Money,
} from "../src/services/credit/loan-limit";

const whole = (m: Money) => m.value / 100n;
const NOW = new Date("2026-10-16T12:00:00Z");

const newMember: MemberCreditProfile = {
  score: DEFAULT_SCORE_CONFIG.initialScore,
  memberSince: NOW,
  circlesCompleted: 0,
  ratings: [],
  outstandingObligations: cop(0n),
  collateral: cop(0n),
  hasRecurringGrant: false,
};

describe("calculateCreditScore", () => {
  test("a perfect round adds the bonus", () => {
    const r = calculateCreditScore(50, { expectedPayments: 1, paidOnTime: 1, paidLate: 0, missedPayments: 0 });
    assert.equal(r.newScore, 55);
    assert.equal(r.change, 5);
    assert.equal(r.status, "fair");
    assert.equal(r.paymentRate, 100);
  });

  test("a missed payment costs the base and the proportional missed penalty", () => {
    const r = calculateCreditScore(70, { expectedPayments: 1, paidOnTime: 0, paidLate: 0, missedPayments: 1 });
    assert.equal(r.newScore, 55);
    assert.equal(r.paymentRate, 0);
  });

  test("a late payment costs the base and the late penalty", () => {
    const r = calculateCreditScore(80, { expectedPayments: 2, paidOnTime: 1, paidLate: 1, missedPayments: 0 });
    assert.equal(r.newScore, 76);
    assert.equal(r.status, "good");
  });

  test("paying late never costs more than not paying, however many payments the round has", () => {
    const allLate = calculateCreditScore(50, { expectedPayments: 13, paidOnTime: 0, paidLate: 13, missedPayments: 0 });
    const allMissed = calculateCreditScore(50, { expectedPayments: 13, paidOnTime: 0, paidLate: 0, missedPayments: 13 });
    assert.ok(allLate.newScore >= allMissed.newScore);
    assert.equal(allMissed.newScore, 35);
  });

  test("clamps to 0–100", () => {
    assert.equal(calculateCreditScore(98, { expectedPayments: 1, paidOnTime: 1, paidLate: 0, missedPayments: 0 }).newScore, 100);
    assert.equal(calculateCreditScore(5, { expectedPayments: 1, paidOnTime: 0, paidLate: 0, missedPayments: 1 }).newScore, 0);
  });

  test("rejects inconsistent or invalid input", () => {
    assert.throws(() => calculateCreditScore(101, { expectedPayments: 1, paidOnTime: 1, paidLate: 0, missedPayments: 0 }), RangeError);
    assert.throws(() => calculateCreditScore(50, { expectedPayments: 2, paidOnTime: 1, paidLate: 0, missedPayments: 0 }), RangeError);
    assert.throws(() => calculateCreditScore(50, { expectedPayments: 1, paidOnTime: 0.5, paidLate: 0.5, missedPayments: 0 }), RangeError);
  });
});

describe("scoreFromFraction", () => {
  test("maps the stored 0..1 fraction to the 0..100 score", () => {
    assert.equal(scoreFromFraction(0.8734), 87.34);
    assert.equal(scoreFromFraction(0.0001), 0.01);
    assert.equal(scoreFromFraction(0.5), 50);
    assert.equal(scoreFromFraction(0), 0);
    assert.equal(scoreFromFraction(1), 100);
  });

  test("rejects out-of-range or non-finite values", () => {
    assert.throws(() => scoreFromFraction(1.0001), RangeError);
    assert.throws(() => scoreFromFraction(-0.1), RangeError);
    assert.throws(() => scoreFromFraction(Number.NaN), RangeError);
  });
});

describe("calculateLoanLimit", () => {
  test("a new member starts at the base limit", () => {
    const r = calculateLoanLimit(newMember, NOW);
    assert.equal(r.status, "fair");
    assert.equal(whole(r.limit), 50_000n);
    assert.equal(whole(r.available), 50_000n);
    assert.equal(r.eligible, true);
    assert.deepEqual(r.reasons, []);
  });

  test("grows with circles, months and reviews, then scales by status", () => {
    const r = calculateLoanLimit(
      {
        ...newMember,
        score: 72, // good: ×1.1
        memberSince: new Date("2026-04-10T00:00:00Z"), // 6 full months: +30%
        circlesCompleted: 4, // +100%
        ratings: [5, 5, 4, 5, 4], // 4.6 stars: (46−30)/20 × 50% = +40%
      },
      NOW,
    );
    assert.equal(whole(r.breakdown.circlesBonus), 50_000n);
    assert.equal(whole(r.breakdown.tenureBonus), 15_000n);
    assert.equal(whole(r.breakdown.reviewsBonus), 20_000n);
    assert.equal(r.breakdown.averageRatingTenths, 46);
    // (50,000 + 85,000) × 1.1
    assert.equal(whole(r.limit), 148_500n);
  });

  test("counts circles and months only up to their maximums, and caps the limit", () => {
    const r = calculateLoanLimit(
      { ...newMember, score: 95, memberSince: new Date("2020-01-01T00:00:00Z"), circlesCompleted: 40, ratings: [5, 5, 5] },
      NOW,
    );
    assert.equal(r.breakdown.countedCircles, 8);
    assert.equal(r.breakdown.countedMonths, 12);
    // (50,000 × (1 + 2 + 0.6 + 0.5)) × 1.2 = 246,000: under the 500,000 cap
    assert.equal(whole(r.limit), 246_000n);
    assert.equal(r.breakdown.capped, false);

    const tight = calculateLoanLimit({ ...newMember, score: 95, circlesCompleted: 8 }, NOW, {
      ...DEFAULT_LOAN_LIMIT_CONFIG,
      maxLimit: cop(100_000n),
    });
    assert.equal(whole(tight.limit), 100_000n);
    assert.equal(tight.breakdown.capped, true);
  });

  test("ignores reviews until there are enough, and low ratings add nothing", () => {
    assert.equal(calculateLoanLimit({ ...newMember, ratings: [5, 5] }, NOW).breakdown.reviewsBonus.value, 0n);
    assert.equal(calculateLoanLimit({ ...newMember, ratings: [2, 3, 3] }, NOW).breakdown.reviewsBonus.value, 0n);
  });

  test("a poor score freezes the limit", () => {
    const r = calculateLoanLimit({ ...newMember, score: 30, circlesCompleted: 5 }, NOW);
    assert.equal(r.status, "poor");
    assert.equal(r.limit.value, 0n);
    assert.equal(r.eligible, false);
    assert.deepEqual(r.reasons, ["poor_score"]);
  });

  test("subtracts circle debt not covered by collateral or a recurring approval", () => {
    const owes = { ...newMember, outstandingObligations: cop(60_000n), collateral: cop(20_000n) };
    const noGrant = calculateLoanLimit(owes, NOW);
    assert.equal(whole(noGrant.uncoveredDebt), 40_000n);
    assert.equal(whole(noGrant.available), 10_000n);

    const withGrant = calculateLoanLimit({ ...owes, hasRecurringGrant: true }, NOW);
    assert.equal(whole(withGrant.uncoveredDebt), 10_000n);
    assert.equal(whole(withGrant.available), 40_000n);
  });

  test("never goes negative when debt exceeds the limit", () => {
    const r = calculateLoanLimit({ ...newMember, outstandingObligations: cop(80_000n) }, NOW);
    assert.equal(r.available.value, 0n);
    assert.equal(r.eligible, false);
    assert.deepEqual(r.reasons, ["debt_exceeds_limit"]);
  });

  test("stays exact beyond Number.MAX_SAFE_INTEGER", () => {
    const huge: Money = { value: 9_007_199_254_740_993n, assetCode: "COP", assetScale: 2 };
    const r = calculateLoanLimit(newMember, NOW, { ...DEFAULT_LOAN_LIMIT_CONFIG, baseLimit: huge, maxLimit: huge });
    assert.equal(r.limit.value, 9_007_199_254_740_993n);
  });

  test("rejects an out-of-range or non-finite score", () => {
    for (const score of [150, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => calculateLoanLimit({ ...newMember, score }, NOW), RangeError);
    }
  });

  test("rejects a review floor that leaves no room up to 5.0", () => {
    for (const reviewFloorTenths of [50, 55, -1, 30.5]) {
      assert.throws(() => calculateLoanLimit(newMember, NOW, { ...DEFAULT_LOAN_LIMIT_CONFIG, reviewFloorTenths }), RangeError);
    }
  });

  test("does not alias the config into the result", () => {
    const r = calculateLoanLimit(newMember, NOW);
    assert.notEqual(r.breakdown.base, DEFAULT_LOAN_LIMIT_CONFIG.baseLimit);
    assert.deepEqual(r.breakdown.base, DEFAULT_LOAN_LIMIT_CONFIG.baseLimit);
  });

  test("toLoanLimitDto is JSON-serializable with string amounts", () => {
    const dto = toLoanLimitDto(calculateLoanLimit(newMember, NOW));
    assert.equal(dto.limit.value, "5000000");
    assert.equal(dto.breakdown.base.assetScale, 2);
    assert.equal(dto.eligible, dto.reasons.length === 0);
    assert.equal(JSON.parse(JSON.stringify(dto)).available.value, "5000000");
  });

  test("rejects money in a different asset", () => {
    assert.throws(
      () => calculateLoanLimit({ ...newMember, collateral: { value: 100n, assetCode: "USD", assetScale: 2 } }, NOW),
      RangeError,
    );
  });
});

describe("helpers", () => {
  test("fullMonthsBetween counts only completed months", () => {
    assert.equal(fullMonthsBetween(new Date("2026-01-31T00:00:00Z"), new Date("2026-02-27T00:00:00Z")), 0);
    assert.equal(fullMonthsBetween(new Date("2026-01-15T00:00:00Z"), new Date("2026-03-15T00:00:00Z")), 2);
    assert.equal(fullMonthsBetween(new Date("2026-01-15T12:00:00Z"), new Date("2026-03-15T11:00:00Z")), 1);
    assert.equal(fullMonthsBetween(NOW, new Date("2025-01-01T00:00:00Z")), 0);
  });

  test("fullMonthsBetween treats the last day of a shorter month as the anniversary", () => {
    assert.equal(fullMonthsBetween(new Date("2026-01-31T00:00:00Z"), new Date("2026-02-28T00:00:00Z")), 1);
    assert.equal(fullMonthsBetween(new Date("2026-01-31T00:00:00Z"), new Date("2026-04-30T00:00:00Z")), 3);
    assert.equal(fullMonthsBetween(new Date("2026-01-30T00:00:00Z"), new Date("2026-04-30T00:00:00Z")), 3);
    assert.equal(fullMonthsBetween(new Date("2026-01-31T00:00:00Z"), new Date("2026-04-29T00:00:00Z")), 2);
  });

  test("averageRatingTenths rounds down and validates ratings", () => {
    assert.equal(averageRatingTenths([5, 4, 4], 3), 43);
    assert.equal(averageRatingTenths([5, 4], 3), null);
    assert.throws(() => averageRatingTenths([6], 1), RangeError);
  });
});
