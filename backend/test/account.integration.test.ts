import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, circleMembers, circles, contributions, rounds, users, walletGrants, wallets } from "../src/db/schema";
import { createAccountService, expectedPayoutValue } from "../src/services/account.service";

// Runs against DATABASE_URL like the other integration suites. Rows use the "[account] " name prefix
// and wallets under https://account.test/, and are deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "[account] ";
const HOST = "account.test";
const DAY = 86_400_000;

let db: Db;

async function deleteTestData(): Promise<void> {
  const userIds = (await db.select({ id: users.id }).from(users).where(like(users.fullName, `${PREFIX}%`))).map((u) => u.id);
  const circleIds = (
    await db
      .select({ id: circles.id })
      .from(circles)
      .where(or(like(circles.name, `${PREFIX}%`), userIds.length > 0 ? inArray(circles.createdBy, userIds) : undefined))
  ).map((c) => c.id);
  if (circleIds.length > 0) {
    const roundIds = (await db.select({ id: rounds.id }).from(rounds).where(inArray(rounds.circleId, circleIds))).map((r) => r.id);
    if (roundIds.length > 0) await db.delete(contributions).where(inArray(contributions.roundId, roundIds));
    await db.delete(rounds).where(inArray(rounds.circleId, circleIds));
    await db.delete(circleMembers).where(inArray(circleMembers.circleId, circleIds));
    await db.delete(circles).where(inArray(circles.id, circleIds));
  }
  const walletIds = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `https://${HOST}/%`))).map((w) => w.id);
  if (walletIds.length > 0) {
    await db.delete(walletGrants).where(inArray(walletGrants.walletId, walletIds));
    await db.delete(auditEvents).where(inArray(auditEvents.walletId, walletIds));
  }
  if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
  if (walletIds.length > 0) await db.delete(wallets).where(inArray(wallets.id, walletIds));
}

async function wallet(assetCode = "USD"): Promise<{ id: string; url: string }> {
  const url = `https://${HOST}/${randomUUID()}`;
  const [row] = await db.insert(wallets).values({ addressUrl: url, assetCode, assetScale: 2 }).returning({ id: wallets.id });
  if (!row) throw new Error("wallet insert");
  return { id: row.id, url };
}

async function user(name: string): Promise<{ id: string; walletId: string; walletUrl: string }> {
  const id = randomUUID();
  const w = await wallet();
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    documentType: "cc",
    documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
    nationality: "CO",
    fullName: `${PREFIX}${name}`,
    opWallet: w.id,
  });
  return { id, walletId: w.id, walletUrl: w.url };
}

// An ACTIVE two-seat circle: `other` receives round 1 (collecting), `me` round 2 (upcoming).
async function circle(me: string, other: string, pool: string, assetCode: string, now: Date) {
  const [c] = await db
    .insert(circles)
    .values({
      name: `${PREFIX}${assetCode} circle`,
      status: "ACTIVE",
      contributionValue: 5000n,
      assetCode,
      assetScale: 2,
      feeBps: 200,
      roundLengthDays: 7,
      cadence: "WEEKLY",
      size: 2,
      inviteCode: randomUUID(),
      poolWalletId: pool,
      createdBy: me,
      startedAt: now,
    })
    .returning({ id: circles.id });
  if (!c) throw new Error("circle insert");
  const seats = await db
    .insert(circleMembers)
    .values([
      { circleId: c.id, userId: other, payoutRound: 1 },
      { circleId: c.id, userId: me, payoutRound: 2 },
    ])
    .returning({ id: circleMembers.id, userId: circleMembers.userId });
  const mySeat = seats.find((s) => s.userId === me)?.id ?? "";
  const otherSeat = seats.find((s) => s.userId === other)?.id ?? "";
  const [r1] = await db
    .insert(rounds)
    .values([
      { circleId: c.id, number: 1, beneficiaryMemberId: otherSeat, state: "COLLECTING", startsAt: now, deadline: new Date(now.getTime() + 7 * DAY) },
      { circleId: c.id, number: 2, beneficiaryMemberId: mySeat, state: "UPCOMING", startsAt: new Date(now.getTime() + 7 * DAY), deadline: new Date(now.getTime() + 14 * DAY) },
    ])
    .returning({ id: rounds.id });
  if (!r1) throw new Error("round insert");
  return { id: c.id, round1: r1.id, mySeat, otherSeat };
}

describe("account dashboard against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    db = createDb(databaseUrl ?? "");
    await deleteTestData();
  });

  after(async () => {
    await deleteTestData();
    await db.$client.end();
  });

  test("totals count only verified contributions, per asset; rounds, payout and activity come from the records", async () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const me = await user("Ana Gómez");
    const other = await user("Luis Pérez");
    const pool = await wallet();
    const service = createAccountService({ db, now: () => now });

    const usd = await circle(me.id, other.id, pool.id, "USD", now);
    const eur = await circle(me.id, other.id, pool.id, "EUR", now);
    const base = (c: typeof usd, memberId: string, assetCode: string) => ({
      roundId: c.round1,
      memberId,
      value: 5000n,
      assetCode,
      assetScale: 2,
      idempotencyKey: `contribution:${c.round1}:${memberId}`,
    });
    await db.insert(contributions).values([
      { ...base(usd, usd.mySeat, "USD"), status: "COMPLETED", requestedAt: now, completedAt: now, outgoingPaymentUrl: `https://${HOST}/op/1` },
      { ...base(usd, usd.otherSeat, "USD"), status: "PROCESSING", requestedAt: now },
      { ...base(eur, eur.mySeat, "EUR"), status: "FAILED", failureCode: "NO_GRANT", requestedAt: now },
    ]);

    const dash = await service.getDashboard(me.id);

    // The FAILED EUR payment and the other member's PROCESSING one never count.
    assert.deepEqual(dash.contributed, [{ value: "5000", assetCode: "USD", assetScale: 2 }]);
    assert.equal(dash.wallet?.address, me.walletUrl);
    assert.deepEqual(dash.wallet?.authorization, { status: "NONE", since: null });
    assert.equal(dash.record.payments.onTime, 1);
    assert.equal(dash.record.payments.missed, 1);

    const usdView = dash.circles.find((c) => c.id === usd.id);
    assert.ok(usdView);
    assert.equal(usdView.myPayoutRound, 2);
    assert.equal(usdView.currentRound, 1);
    assert.equal(usdView.now, now.toISOString());
    assert.deepEqual(usdView.expectedPayout, { value: "9800", assetCode: "USD", assetScale: 2 });
    assert.deepEqual(
      usdView.rounds.map((r) => [r.number, r.state, r.mine, r.verified, r.myStatus]),
      [
        [1, "COLLECTING", false, 1, "COMPLETED"],
        [2, "UPCOMING", true, 0, null],
      ],
    );
    assert.equal(dash.circles.find((c) => c.id === eur.id)?.rounds[0]?.myFailureCode, "NO_GRANT");

    assert.equal(dash.activity.length, 2);
    const paid = dash.activity.find((a) => a.status === "COMPLETED");
    assert.equal(paid?.fromWallet, me.walletUrl);
    assert.equal(paid?.toWallet, pool.url);
    assert.equal(paid?.completedAt, now.toISOString());
    assert.equal(paid?.outgoingPaymentUrl, `https://${HOST}/op/1`);
  });

  test("the newest grant is the wallet's authorization status", async () => {
    const me = await user("Marta Ruiz");
    const service = createAccountService({ db });
    const grant = { userId: me.id, walletId: me.walletId, accessTokenCiphertext: "x", manageUri: `https://${HOST}/m`, continueUri: `https://${HOST}/c` };
    await db.insert(walletGrants).values({ ...grant, status: "REVOKED", createdAt: new Date("2026-10-01T00:00:00Z") });
    assert.equal((await service.getDashboard(me.id)).wallet?.authorization.status, "REVOKED");

    await db.insert(walletGrants).values({ ...grant, createdAt: new Date("2026-10-02T00:00:00Z") });
    const dash = await service.getDashboard(me.id);
    assert.deepEqual(dash.wallet?.authorization, { status: "ACTIVE", since: "2026-10-02T00:00:00.000Z" });
    // No secrets in the read model.
    assert.doesNotMatch(JSON.stringify(dash), /accessToken|manageUri|continueUri|Ciphertext/i);
  });
});

test("expected payout is the pot less the fee, rounded down", () => {
  assert.equal(expectedPayoutValue(5000n, 5, 200), 24_500n);
  assert.equal(expectedPayoutValue(333n, 3, 150), 985n);
  assert.equal(expectedPayoutValue(100n, 2, 0), 200n);
});
