import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { periodEnd, periodStart } from "../src/services/circles/period-schedule";

const iso = (d: Date) => d.toISOString();

describe("period schedule", () => {
  test("weekly periods are 7 days and keep the time of day", () => {
    const start = new Date("2026-03-02T15:00:00Z");
    assert.equal(iso(periodStart(start, "WEEKLY", 1)), "2026-03-02T15:00:00.000Z");
    assert.equal(iso(periodEnd(start, "WEEKLY", 1)), "2026-03-09T15:00:00.000Z");
    assert.equal(iso(periodEnd(start, "WEEKLY", 2)), "2026-03-16T15:00:00.000Z");
  });

  test("biweekly periods are 14 days", () => {
    const start = new Date("2026-03-02T15:00:00Z");
    assert.equal(iso(periodEnd(start, "BIWEEKLY", 1)), "2026-03-16T15:00:00.000Z");
    assert.equal(iso(periodStart(start, "BIWEEKLY", 3)), "2026-03-30T15:00:00.000Z");
  });

  test("monthly from a month end clamps to each month's last day without drifting", () => {
    const start = new Date("2026-01-31T12:00:00Z");
    assert.deepEqual(
      [1, 2, 3, 4].map((n) => iso(periodEnd(start, "MONTHLY", n))),
      ["2026-02-28T12:00:00.000Z", "2026-03-31T12:00:00.000Z", "2026-04-30T12:00:00.000Z", "2026-05-31T12:00:00.000Z"],
    );
  });

  test("leap years get Feb 29", () => {
    assert.equal(iso(periodEnd(new Date("2028-01-30T08:00:00Z"), "MONTHLY", 1)), "2028-02-29T08:00:00.000Z");
  });

  test("a period starts where the previous one ends, across years", () => {
    const start = new Date("2026-11-15T00:00:00Z");
    for (let n = 2; n <= 50; n++) {
      assert.equal(iso(periodStart(start, "MONTHLY", n)), iso(periodEnd(start, "MONTHLY", n - 1)));
    }
    assert.equal(iso(periodEnd(start, "MONTHLY", 50)), "2031-01-15T00:00:00.000Z");
  });
});
