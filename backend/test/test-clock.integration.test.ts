import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import {
  auditEvents,
  circleMembers,
  circles,
  contributions,
  rounds,
  testClocks,
  users,
  walletGrants,
  wallets,
} from "../src/db/schema";
import type { Services } from "../src/routes";
import { createCircleService, displayName, type CircleDto } from "../src/services/circle.service";
import { createMemberAccess } from "../src/services/circles/member-access";
import { createPeriodEngine } from "../src/services/circles/period-engine";
import type { ContributionPayments } from "../src/services/open-payments/payments";
import { createTokenCipher } from "../src/services/open-payments/token-cipher";
import { createTestClockService, type TestClockDto } from "../src/services/test-clock.service";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakePayments, fakeServices, TEST_WALLET_HOST, type FakePayments } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

// Runs against DATABASE_URL like the other integration suites. Rows use the "[test-clock] " name
// prefix and wallets under https://clock.test/, and are deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "[test-clock] ";
const HOST = "clock.test";
const POOL_URL = `https://${HOST}/pool-${randomUUID()}`;
const cipher = createTokenCipher(Buffer.alloc(32, 7).toString("base64"));

let db: Db;
let server: TestServer;
let auth: TestAuth;
let payments: FakePayments = fakePayments();
let realClock = Date.parse("2026-10-16T12:00:00Z");
const createdUserIds: string[] = [];

async function deleteTestData(): Promise<void> {
  const testCircles = await db
    .select({ id: circles.id })
    .from(circles)
    .where(or(like(circles.name, `${PREFIX}%`), createdUserIds.length > 0 ? inArray(circles.createdBy, createdUserIds) : undefined));
  const circleIds = testCircles.map((c) => c.id);
  if (circleIds.length > 0) {
    const roundIds = (await db.select({ id: rounds.id }).from(rounds).where(inArray(rounds.circleId, circleIds))).map((r) => r.id);
    if (roundIds.length > 0) await db.delete(contributions).where(inArray(contributions.roundId, roundIds));
    await db.delete(rounds).where(inArray(rounds.circleId, circleIds));
    await db.delete(circleMembers).where(inArray(circleMembers.circleId, circleIds));
    await db.delete(circles).where(inArray(circles.id, circleIds));
  }
  await db.delete(testClocks).where(like(testClocks.name, `${PREFIX}%`));
  const testWallets = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `https://${HOST}/%`))).map((w) => w.id);
  if (testWallets.length > 0) {
    await db.delete(walletGrants).where(inArray(walletGrants.walletId, testWallets));
    await db.delete(auditEvents).where(inArray(auditEvents.walletId, testWallets));
    await db.update(users).set({ opWallet: null }).where(inArray(users.opWallet, testWallets));
  }
  await db.delete(users).where(or(like(users.fullName, `${PREFIX}%`), createdUserIds.length > 0 ? inArray(users.id, createdUserIds) : undefined));
  if (testWallets.length > 0) await db.delete(wallets).where(inArray(wallets.id, testWallets));
}

// A KYC-approved user with a linked wallet and, unless told otherwise, a standing grant.
async function member(options: { grant?: "active" | "expired" | "none"; name?: string } = {}) {
  const id = randomUUID();
  createdUserIds.push(id);
  const walletUrl = `https://${HOST}/${id}`;
  const [wallet] = await db.insert(wallets).values({ addressUrl: walletUrl, assetCode: "USD", assetScale: 2 }).returning({ id: wallets.id });
  if (!wallet) throw new Error("wallet insert");
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    documentType: "cc",
    documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
    nationality: "CO",
    fullName: `${PREFIX}${options.name ?? "Ana María Gómez"}`,
    opWallet: wallet.id,
  });
  const grant = options.grant ?? "active";
  if (grant !== "none") {
    await db.insert(walletGrants).values({
      userId: id,
      walletId: wallet.id,
      accessTokenCiphertext: cipher.encrypt(`token-${id}`),
      manageUri: `https://auth.${HOST}/token/${id}`,
      continueUri: `https://auth.${HOST}/continue/${id}`,
      tokenExpiresAt: grant === "expired" ? new Date(realClock - 1000) : null,
    });
  }
  return { id, walletUrl, token: await auth.token(id) };
}

type Member = Awaited<ReturnType<typeof member>>;

async function createClock(owner: Member, frozenTime: string): Promise<TestClockDto> {
  const res = await server.request("/api/test-clocks", { method: "POST", token: owner.token, body: { name: `${PREFIX}clock`, frozenTime } });
  assert.equal(res.status, 201, res.text);
  return res.body as TestClockDto;
}

// Creates a circle on the clock and fills it: the owner takes payout round 1, the rest in order.
async function startedCircle(clock: TestClockDto, owner: Member, others: Member[], cadence: "WEEKLY" | "MONTHLY"): Promise<CircleDto> {
  const created = await server.request("/api/circles", {
    method: "POST",
    token: owner.token,
    body: { name: `${PREFIX}Natillera`, city: "Medellín", contributionValue: "5000", size: others.length + 1, cadence, payoutRound: 1, testClockId: clock.id },
  });
  assert.equal(created.status, 201, created.text);
  const circle = created.body as CircleDto;
  let last = circle;
  for (const [i, m] of others.entries()) {
    const res = await server.request(`/api/circles/${circle.id}/join`, { method: "POST", token: m.token, body: { payoutRound: i + 2 } });
    assert.equal(res.status, 200, res.text);
    last = res.body as CircleDto;
  }
  return last;
}

const advance = (clock: TestClockDto, owner: Member, to: string) =>
  server.request(`/api/test-clocks/${clock.id}/advance`, { method: "POST", token: owner.token, body: { to } });

async function roundStates(circleId: string): Promise<string[]> {
  return (await db.select({ state: rounds.state }).from(rounds).where(eq(rounds.circleId, circleId)).orderBy(asc(rounds.number))).map((r) => r.state);
}

async function contributionRows(circleId: string, number: number) {
  const [round] = await db.select().from(rounds).where(and(eq(rounds.circleId, circleId), eq(rounds.number, number)));
  return db.select().from(contributions).where(eq(contributions.roundId, round?.id ?? ""));
}

describe("test clocks and the period engine against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    auth = await setupTestAuth();
    db = createDb(databaseUrl ?? "");
    await deleteTestData();

    // Each test swaps `payments`; the services always call the current one.
    const current: ContributionPayments = {
      createIncomingPayment: (a) => payments.createIncomingPayment(a),
      readIncomingPayment: (a) => payments.readIncomingPayment(a),
      payFromMember: (a, b) => payments.payFromMember(a, b),
      findMemberPayment: (a, b) => payments.findMemberPayment(a, b),
      rotateToken: (a) => payments.rotateToken(a),
    };
    const realNow = () => new Date(realClock);
    const engine = createPeriodEngine({
      db,
      payments: current,
      memberAccess: createMemberAccess({ db, cipher, payments: current, now: realNow }),
      realNow,
      settleWait: { attempts: 0, intervalMs: 0 },
    });
    const testClocksService = createTestClockService({ db, engine });
    const kyc: Services["kyc"] = { ...fakeServices().kyc, getStatus: async () => ({ status: "Approved", approved: true }) };
    const circleService = createCircleService({
      db,
      resolvePoolWallet: async () => ({ id: POOL_URL, assetCode: "USD", assetScale: 2 }),
      testClocksEnabled: true,
      onStarted: testClocksService.runCircle,
    });
    server = await startServer(fakeServices({ circles: circleService, kyc, testClocks: testClocksService }));
  });

  after(async () => {
    await deleteTestData();
    await server.close();
    await db.$client.end();
  });

  test("a monthly circle of 3 runs its 3 periods; each member pays once per period", async () => {
    payments = fakePayments();
    const [owner, bob, carol] = await Promise.all([member(), member({ name: "Bob Ruiz" }), member({ name: "Carol Díaz" })]);
    const clock = await createClock(owner, "2026-01-31T12:00:00Z");
    const started = await startedCircle(clock, owner, [bob, carol], "MONTHLY");

    // The circle starts at the clock's time, and period 1 is requested and paid right away.
    assert.equal(started.startedAt, "2026-01-31T12:00:00.000Z");
    assert.equal(started.testClockId, clock.id);
    assert.deepEqual(await roundStates(started.id), ["FUNDED", "UPCOMING", "UPCOMING"]);
    assert.equal(payments.outgoing.length, 3);

    // Advance boundary by boundary, as the dev panel does.
    let view = (await server.request(`/api/test-clocks/${clock.id}`, { token: owner.token })).body as TestClockDto;
    const seen: string[] = [];
    while (view.circles[0]?.nextBoundary) {
      seen.push(view.circles[0].nextBoundary);
      const res = await advance(clock, owner, view.circles[0].nextBoundary);
      assert.equal(res.status, 200, res.text);
      view = res.body as TestClockDto;
    }
    assert.deepEqual(seen, ["2026-02-28T12:00:00.000Z", "2026-03-31T12:00:00.000Z", "2026-04-30T12:00:00.000Z"]);
    assert.equal(view.frozenTime, "2026-04-30T12:00:00.000Z");
    assert.deepEqual(await roundStates(started.id), ["FUNDED", "FUNDED", "FUNDED"]);

    // 3 members × 3 periods, each with its own key, into incoming payments for the exact amount.
    assert.equal(payments.outgoing.length, 9);
    assert.equal(new Set(payments.outgoing.map((p) => p.key)).size, 9);
    assert.ok([...payments.incoming.values()].every((ip) => ip.value === 5000n && ip.received === 5000n));

    const period3 = view.circles[0]?.currentPeriod;
    assert.equal(period3?.number, 3);
    assert.equal(period3?.beneficiary.displayName, displayName(`${PREFIX}Carol Díaz`));
    assert.ok(period3?.contributions.every((c) => c.status === "COMPLETED"));

    // Completed contributions carry circle time, and the pool's audit log has the money in.
    const p2 = await contributionRows(started.id, 2);
    assert.ok(p2.every((c) => c.completedAt?.toISOString() === "2026-02-28T12:00:00.000Z"));
    const pool = await db.select({ id: wallets.id }).from(wallets).where(eq(wallets.addressUrl, POOL_URL));
    const completed = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.walletId, pool[0]?.id ?? ""), eq(auditEvents.eventType, "contribution.completed")));
    assert.equal(completed.filter((e) => p2.some((c) => e.externalId === `contribution.completed:${c.id}`)).length, 3);
    assert.ok(completed.every((e) => e.amount === 5000n));

    // Running again at the same time changes nothing and pays nobody twice.
    assert.equal((await advance(clock, owner, view.frozenTime)).status, 200);
    assert.equal(payments.outgoing.length, 9);
  });

  test("deadline: unpaid contributions fail, the period is BLOCKED, and the next one still opens", async () => {
    const [owner, refused, noGrant] = await Promise.all([member(), member(), member({ grant: "none" })]);
    payments = fakePayments({ settle: "later", refuse: new Set([refused.walletUrl]) });
    const clock = await createClock(owner, "2026-03-02T15:00:00Z");
    const started = await startedCircle(clock, owner, [refused, noGrant], "WEEKLY");

    const failures = Object.fromEntries((await contributionRows(started.id, 1)).map((c) => [c.memberId, [c.status, c.failureCode]]));
    const seat = (u: Member) => started.seats.find((s) => s.payoutRound === [owner, refused, noGrant].indexOf(u) + 1)?.memberId ?? "";
    assert.deepEqual(failures[seat(owner)], ["PROCESSING", null]);
    assert.deepEqual(failures[seat(refused)], ["FAILED", "QUOTE_FAILED"]);
    assert.deepEqual(failures[seat(noGrant)], ["FAILED", "NO_GRANT"]);

    // The owner's payment never arrives before the deadline.
    const res = await advance(clock, owner, "2026-03-09T15:00:00Z");
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(await roundStates(started.id), ["BLOCKED", "COLLECTING", "UPCOMING"]);
    const late = (await contributionRows(started.id, 1)).find((c) => c.memberId === seat(owner));
    assert.deepEqual([late?.status, late?.failureCode], ["FAILED", "DEADLINE_MISSED"]);

    // Money arriving for period 2 is picked up by a refresh (advance to the same time).
    payments.settleAll();
    await advance(clock, owner, "2026-03-09T15:00:00Z");
    const p2 = (await contributionRows(started.id, 2)).find((c) => c.memberId === seat(owner));
    assert.equal(p2?.status, "COMPLETED");
  });

  test("a lost response is recovered after the lease, without paying twice", async () => {
    payments = fakePayments({ settle: "later", loseResponses: 1 });
    const [owner, bob] = await Promise.all([member(), member()]);
    const clock = await createClock(owner, "2026-05-01T00:00:00Z");
    const started = await startedCircle(clock, owner, [bob], "WEEKLY");

    const stuck = (await contributionRows(started.id, 1)).filter((c) => c.status === "PROCESSING" && !c.outgoingPaymentUrl);
    assert.equal(stuck.length, 1);
    assert.equal(payments.outgoing.length, 2);

    // Within the lease nothing is retried; after it, the payment is found by its key.
    await advance(clock, owner, "2026-05-01T00:00:00Z");
    assert.equal(payments.outgoing.length, 2);
    realClock += 3 * 60_000;
    await advance(clock, owner, "2026-05-01T00:00:00Z");
    assert.equal(payments.outgoing.length, 2);
    payments.settleAll();
    await advance(clock, owner, "2026-05-01T00:00:00Z");
    const rows = await contributionRows(started.id, 1);
    assert.ok(rows.every((c) => c.status === "COMPLETED" && c.outgoingPaymentUrl));
  });

  test("an expired member token is rotated once and stored encrypted", async () => {
    payments = fakePayments();
    const [owner, bob] = await Promise.all([member(), member({ grant: "expired" })]);
    const clock = await createClock(owner, "2026-06-01T00:00:00Z");
    await startedCircle(clock, owner, [bob], "WEEKLY");

    const [grant] = await db.select().from(walletGrants).where(eq(walletGrants.userId, bob.id));
    assert.equal(cipher.decrypt(grant?.accessTokenCiphertext ?? ""), "rotated");
    assert.equal(grant?.manageUri, `https://auth.${TEST_WALLET_HOST}/token/rotated`);
    assert.ok((grant?.tokenExpiresAt?.getTime() ?? 0) > realClock);
    assert.ok(!(grant?.accessTokenCiphertext ?? "").includes("rotated"), "token stored in plain text");
  });

  test("clocks are private to their owner and only move forward", async () => {
    payments = fakePayments();
    const [owner, stranger] = await Promise.all([member(), member()]);
    const clock = await createClock(owner, "2026-07-01T00:00:00Z");

    assert.equal((await server.request(`/api/test-clocks/${clock.id}`, { token: stranger.token })).status, 404);
    assert.equal((await advance(clock, stranger, "2026-08-01T00:00:00Z")).status, 404);

    const back = await advance(clock, owner, "2026-06-30T00:00:00Z");
    assert.equal(back.status, 422);
    assert.equal(errorCode(back.body), "TEST_CLOCK_BACKWARDS");

    const borrowed = await server.request("/api/circles", {
      method: "POST",
      token: stranger.token,
      body: { name: `${PREFIX}x`, city: "Cali", contributionValue: "100", size: 2, cadence: "WEEKLY", payoutRound: 1, testClockId: clock.id },
    });
    assert.equal(borrowed.status, 404);
    assert.equal(errorCode(borrowed.body), "TEST_CLOCK_NOT_FOUND");
  });

  test("with test clocks disabled a circle can't be attached to one", async () => {
    const owner = await member();
    const clock = await createClock(owner, "2026-07-01T00:00:00Z");
    const disabled = createCircleService({ db, resolvePoolWallet: async () => ({ id: POOL_URL, assetCode: "USD", assetScale: 2 }) });
    await assert.rejects(
      disabled.create(owner.id, {
        name: `${PREFIX}x`,
        city: "Cali",
        contributionValue: 100n,
        size: 2,
        cadence: "WEEKLY",
        payoutRound: 1,
        collateralValue: 0n,
        grantMode: null,
        testClockId: clock.id,
      }),
      (e: unknown) => e instanceof Error && "code" in e && e.code === "TEST_CLOCK_NOT_FOUND",
    );
  });
});
