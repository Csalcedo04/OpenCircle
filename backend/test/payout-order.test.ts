import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { payoutSequence, type RankedSeat } from "../src/services/circles/payout-order";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 12, minute));
const seats: RankedSeat[] = [
  { id: "low", score: 0.3, joinedAt: at(0) },
  { id: "new", score: null, joinedAt: at(1) },
  { id: "high", score: 0.9, joinedAt: at(2) },
  { id: "mid", score: 0.5, joinedAt: at(3) },
];

describe("payout order", () => {
  test("best score first puts the most reliable member in round 1", () => {
    assert.deepEqual(payoutSequence(seats, "BEST_SCORE_FIRST"), ["high", "new", "mid", "low"]);
  });

  test("best score last reverses the ranking", () => {
    assert.deepEqual(payoutSequence(seats, "BEST_SCORE_LAST"), ["low", "new", "mid", "high"]);
  });

  test("a member without a score ranks as the initial score; ties keep join order", () => {
    // "new" (null → 0.5) joined before "mid" (0.5), so it goes first either way.
    assert.deepEqual(payoutSequence([seats[3]!, seats[1]!], "BEST_SCORE_FIRST"), ["new", "mid"]);
    assert.deepEqual(payoutSequence([seats[3]!, seats[1]!], "BEST_SCORE_LAST"), ["new", "mid"]);
  });
});
