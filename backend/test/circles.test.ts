import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { majorityOutcome } from "../src/services/circles/application.service";

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
