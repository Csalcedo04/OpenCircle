import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { envSchema } from "../src/config/env-schema";
import { decidersOf } from "../src/services/circles/application-notices";
import { createCircleCycle } from "../src/services/circles/circle-cycle";
import { reminderKind } from "../src/services/circles/reminders.service";
import { outcomeChange, penaltyAt, scoreAction, type PaymentOutcome, type ScoredContribution } from "../src/services/circles/scoring.service";
import { clampScore, fractionFromScore, roundScoreChange, scoreFromFraction } from "../src/services/credit/credit-score";
import { createLogSender } from "../src/services/notifications/sender";
import { sameSecret } from "../src/services/secret-compare";

const DAY = 86_400_000;
const at = (base: Date, days: number) => new Date(base.getTime() + days * DAY);
const deadline = new Date("2026-03-01T00:00:00Z");

describe("score changes per contribution", () => {
  test("on time +5, late −4, missed −15 with the default config", () => {
    assert.equal(outcomeChange("ON_TIME"), 5);
    assert.equal(outcomeChange("LATE"), -4);
    assert.equal(outcomeChange("MISSED"), -15);
  });

  test("roundScoreChange validates the summary", () => {
    assert.throws(() => roundScoreChange({ expectedPayments: 0, paidOnTime: 0, paidLate: 0, missedPayments: 0 }), RangeError);
    assert.throws(() => roundScoreChange({ expectedPayments: 2, paidOnTime: 1, paidLate: 0, missedPayments: 0 }), RangeError);
  });

  test("fractionFromScore is the inverse of scoreFromFraction and validates its range", () => {
    for (const score of [0, 0.01, 35, 50, 87.34, 100]) assert.equal(scoreFromFraction(fractionFromScore(score)), score);
    assert.equal(fractionFromScore(87.34), 0.8734);
    assert.throws(() => fractionFromScore(100.01), RangeError);
    assert.throws(() => fractionFromScore(Number.NaN), RangeError);
  });

  test("clampScore keeps 0..100 with 2 decimals", () => {
    assert.equal(clampScore(105), 100);
    assert.equal(clampScore(-3), 0);
    assert.equal(clampScore(12.346), 12.35);
  });
});

describe("penaltyAt", () => {
  test("14 days after the deadline when the next cycle is far away (monthly)", () => {
    assert.equal(penaltyAt(deadline, at(deadline, 31)).getTime(), at(deadline, 14).getTime());
  });

  test("5 days before the next cycle when that comes first (weekly)", () => {
    assert.equal(penaltyAt(deadline, at(deadline, 7)).getTime(), at(deadline, 2).getTime());
  });

  test("never before the deadline, even if the next cycle is under 5 days away", () => {
    assert.equal(penaltyAt(deadline, at(deadline, 3)).getTime(), deadline.getTime());
  });

  test("the last round gets the 14 days", () => {
    assert.equal(penaltyAt(deadline, null).getTime(), at(deadline, 14).getTime());
  });
});

describe("scoreAction", () => {
  const penalty = at(deadline, 2);
  const base: ScoredContribution = { status: "PENDING", completedAt: null, deadline, penaltyAt: penalty };
  const none = new Set<PaymentOutcome>();

  test("a payment completed by the deadline is on time; after it, late", () => {
    assert.deepEqual(scoreAction({ ...base, status: "COMPLETED", completedAt: at(deadline, -1) }, none, at(deadline, 5)), {
      outcome: "ON_TIME",
      change: 5,
    });
    assert.deepEqual(scoreAction({ ...base, status: "COMPLETED", completedAt: deadline }, none, deadline)?.outcome, "ON_TIME");
    assert.deepEqual(scoreAction({ ...base, status: "COMPLETED", completedAt: at(deadline, 1) }, none, at(deadline, 1)), {
      outcome: "LATE",
      change: -4,
    });
  });

  test("unpaid counts as missed only from the penalty time on, whatever the engine status", () => {
    assert.equal(scoreAction(base, none, at(deadline, 1)), null);
    assert.deepEqual(scoreAction(base, none, penalty), { outcome: "MISSED", change: -15 });
    assert.deepEqual(scoreAction({ ...base, status: "FAILED" }, none, at(deadline, 3))?.outcome, "MISSED");
    assert.deepEqual(scoreAction({ ...base, status: "PROCESSING" }, none, at(deadline, 3))?.outcome, "MISSED");
  });

  test("paid after being scored as missed: re-scored as late, undoing the miss (+11)", () => {
    const missed = new Set<PaymentOutcome>(["MISSED"]);
    assert.deepEqual(scoreAction({ ...base, status: "COMPLETED", completedAt: at(deadline, 4) }, missed, at(deadline, 4)), {
      outcome: "LATE",
      change: 11,
    });
  });

  test("nothing more once scored, and nothing for cancelled contributions", () => {
    const completed = { ...base, status: "COMPLETED" as const, completedAt: at(deadline, -1) };
    assert.equal(scoreAction(completed, new Set(["ON_TIME"]), at(deadline, 9)), null);
    assert.equal(scoreAction({ ...completed, completedAt: at(deadline, 1) }, new Set(["LATE"]), at(deadline, 9)), null);
    assert.equal(scoreAction({ ...completed, completedAt: at(deadline, 3) }, new Set(["MISSED", "LATE"]), at(deadline, 9)), null);
    assert.equal(scoreAction(base, new Set(["MISSED"]), at(deadline, 9)), null);
    assert.equal(scoreAction({ ...base, status: "CANCELLED" }, none, at(deadline, 9)), null);
  });
});

describe("reminderKind", () => {
  const penalty = at(deadline, 2);

  test("nothing until 3 days before; then due soon; due today in the last 24 hours", () => {
    assert.equal(reminderKind("PENDING", deadline, penalty, at(deadline, -4)), null);
    assert.equal(reminderKind("PENDING", deadline, penalty, at(deadline, -3)), "DUE_SOON");
    assert.equal(reminderKind("PROCESSING", deadline, penalty, at(deadline, -1.5)), "DUE_SOON");
    assert.equal(reminderKind("PENDING", deadline, penalty, at(deadline, -1)), "DUE_TODAY");
    assert.equal(reminderKind("PENDING", deadline, penalty, at(deadline, -0.1)), "DUE_TODAY");
  });

  test("late from the deadline until the penalty, then nothing", () => {
    assert.equal(reminderKind("FAILED", deadline, penalty, deadline), "LATE");
    assert.equal(reminderKind("PENDING", deadline, penalty, at(deadline, 1)), "LATE");
    assert.equal(reminderKind("FAILED", deadline, penalty, penalty), null);
  });

  test("paid or cancelled contributions need no reminder", () => {
    assert.equal(reminderKind("COMPLETED", deadline, penalty, at(deadline, -1)), null);
    assert.equal(reminderKind("CANCELLED", deadline, penalty, at(deadline, 1)), null);
  });
});

describe("createLogSender", () => {
  test("logs kind, channel and contribution, never the contact or the amount", async () => {
    const lines: string[] = [];
    const sender = createLogSender((message, data) => lines.push(`${message} ${JSON.stringify(data)}`));
    await sender.send({
      channel: "WHATSAPP",
      to: "+573001112233",
      kind: "LATE",
      circleName: "Natillera",
      deadline,
      amount: { value: "2000000", assetCode: "COP", assetScale: 2 },
      contributionId: "c-1",
    });
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? "", /LATE/);
    assert.match(lines[0] ?? "", /WHATSAPP/);
    assert.match(lines[0] ?? "", /c-1/);
    assert.ok(!(lines[0] ?? "").includes("+57"), "phone logged");
    assert.ok(!(lines[0] ?? "").includes("2000000"), "amount logged");
  });

  test("application emails log the application, never the address or the names", async () => {
    const lines: string[] = [];
    const sender = createLogSender((message, data) => lines.push(`${message} ${JSON.stringify(data)}`));
    await sender.send({
      channel: "EMAIL",
      to: "ana@example.test",
      kind: "APPLICATION_ACCEPTED",
      circleName: "Natillera",
      circleId: "c-1",
      applicationId: "a-1",
      applicantName: "Bob R.",
      acceptedByName: "Ana G.",
    });
    const line = lines[0] ?? "";
    assert.match(line, /APPLICATION_ACCEPTED/);
    assert.match(line, /a-1/);
    for (const leaked of ["ana@example.test", "Bob R.", "Ana G."]) assert.ok(!line.includes(leaked), `${leaked} logged`);
  });
});

describe("decidersOf", () => {
  const members = [
    { memberId: "creator", userId: "u1", isApprover: true },
    { memberId: "delegate", userId: "u2", isApprover: true },
    { memberId: "plain", userId: "u3", isApprover: false },
  ];

  test("DELEGATES: the creator and the delegates; MAJORITY: every member", () => {
    assert.deepEqual(
      decidersOf("DELEGATES", members).map((m) => m.memberId),
      ["creator", "delegate"],
    );
    assert.deepEqual(
      decidersOf("MAJORITY", members).map((m) => m.memberId),
      ["creator", "delegate", "plain"],
    );
  });

  test("leaves out the excluded members (e.g. who just accepted)", () => {
    assert.deepEqual(
      decidersOf("DELEGATES", members, ["delegate"]).map((m) => m.memberId),
      ["creator"],
    );
    assert.deepEqual(
      decidersOf("MAJORITY", members, ["creator", "plain"]).map((m) => m.memberId),
      ["delegate"],
    );
  });
});

describe("createCircleCycle", () => {
  test("runs the period engine, then payouts, then scoring, then reminders, at the same time", async () => {
    const calls: string[] = [];
    const now = new Date("2026-04-01T00:00:00Z");
    const cycle = createCircleCycle({
      engine: { advanceCircle: async (id, t) => void calls.push(`engine ${id} ${t.toISOString()}`) },
      payouts: { payCircle: async (id, t) => void calls.push(`payout ${id} ${t.toISOString()}`) },
      scoring: { scoreCircle: async (id, t) => (calls.push(`score ${id} ${t.toISOString()}`), 0) },
      reminders: { remindCircle: async (id, t) => (calls.push(`remind ${id} ${t.toISOString()}`), 0) },
    });
    await cycle.advanceCircle("c1", now);
    const iso = now.toISOString();
    assert.deepEqual(calls, [`engine c1 ${iso}`, `payout c1 ${iso}`, `score c1 ${iso}`, `remind c1 ${iso}`]);
  });
});

describe("sameSecret", () => {
  test("matches only the exact secret", () => {
    assert.equal(sameSecret("a".repeat(32), "a".repeat(32)), true);
    assert.equal(sameSecret("a".repeat(31), "a".repeat(32)), false);
    assert.equal(sameSecret("b".repeat(32), "a".repeat(32)), false);
    assert.equal(sameSecret(undefined, "a".repeat(32)), false);
  });
});

describe("CRON_SECRET", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    SUPABASE_URL: "https://example.supabase.co",
    FRONTEND_URL: "http://localhost:3001",
    OP_CLIENT_WALLET_ADDRESS: "https://wallet.example/pool",
    OP_KEY_ID: "key",
    OP_PRIVATE_KEY: "key",
    GRANT_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64"),
    DIDIT_API_KEY: "key",
    DIDIT_WORKFLOW_ID: "11111111-1111-4111-8111-111111111111",
  };

  test("is optional, and when set must be at least 32 characters", () => {
    assert.equal(envSchema.safeParse(base).success, true);
    assert.equal(envSchema.safeParse({ ...base, CRON_SECRET: "x".repeat(32) }).success, true);
    assert.equal(envSchema.safeParse({ ...base, CRON_SECRET: "short" }).success, false);
  });
});
