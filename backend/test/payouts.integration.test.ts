import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, circleMembers, circles, contributions, creditProfiles, payouts, rounds, users, wallets } from "../src/db/schema";
import { AppError } from "../src/errors/app-error";
import { createCircleService } from "../src/services/circle.service";
import { createDebtService } from "../src/services/circles/debt.service";
import { assertNoOpenDebt, openDebtCount } from "../src/services/circles/debts";
import { NoGrantError } from "../src/services/circles/member-access";
import { createPayouts } from "../src/services/circles/payout.service";
import { createScoring } from "../src/services/circles/scoring.service";
import { scoreFromFraction } from "../src/services/credit/credit-score";
import { NoPoolGrantError } from "../src/services/circles/pool-access";
import { PaymentRefusedError, type Amount, type PayoutPayments, type SentPayout } from "../src/services/open-payments/payments";
import { fakePayments } from "./helpers/fakes";

// Runs against DATABASE_URL like the other integration suites. Rows use the "[test-payouts] "
// name prefix and wallets under https://payouts.test/, and are deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "[test-payouts] ";
const HOST = "payouts.test";
const POOL_URL = `https://${HOST}/pool-${randomUUID()}`;
// 20.000,00 COP per contribution.
const C = 2_000_000n;
const NOW = new Date("2026-06-01T00:00:00Z");

let db: Db;
let poolWalletId: string;

async function deleteTestData(): Promise<void> {
  const testCircles = (await db.select({ id: circles.id }).from(circles).where(like(circles.name, `${PREFIX}%`))).map((c) => c.id);
  if (testCircles.length > 0) {
    await db.delete(payouts).where(inArray(payouts.circleId, testCircles));
    const roundIds = (await db.select({ id: rounds.id }).from(rounds).where(inArray(rounds.circleId, testCircles))).map((r) => r.id);
    if (roundIds.length > 0) await db.delete(contributions).where(inArray(contributions.roundId, roundIds));
    await db.delete(rounds).where(inArray(rounds.circleId, testCircles));
    await db.delete(circleMembers).where(inArray(circleMembers.circleId, testCircles));
    await db.delete(circles).where(inArray(circles.id, testCircles));
  }
  const testWallets = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `https://${HOST}/%`))).map((w) => w.id);
  if (testWallets.length > 0) await db.delete(auditEvents).where(inArray(auditEvents.walletId, testWallets));
  if (testWallets.length > 0) await db.delete(creditProfiles).where(inArray(creditProfiles.walletId, testWallets));
  await db.delete(users).where(or(like(users.fullName, `${PREFIX}%`), testWallets.length > 0 ? inArray(users.opWallet, testWallets) : undefined));
  if (testWallets.length > 0) await db.delete(wallets).where(inArray(wallets.id, testWallets));
}

// ── In-memory Open Payments for payouts ────────────────────────────────────

interface FakeIncoming {
  walletAddressUrl: string;
  key: string;
  received: Amount | null;
  completed: boolean;
}

interface Fake extends PayoutPayments {
  sent: { key: string; debit: Amount; incomingPaymentUrl: string }[];
  incoming: Map<string, FakeIncoming>;
  settleAll(): void;
}

/**
 *   settle "now"   → the member's wallet receives as soon as the pool pays
 *   settle "later" → only after settleAll()
 *   refuse         → member wallets whose quote is refused
 *   gaveUp         → payout keys whose pool payment reports failed
 *   loseResponses  → outgoing payments created whose response is lost
 *   rate           → what a debit delivers (default: the same amount and asset)
 */
function fakePayouts(
  options: { settle?: "now" | "later"; refuse?: Set<string>; gaveUp?: Set<string>; loseResponses?: number; rate?: (debit: Amount) => Amount } = {},
): Fake {
  const sent: Fake["sent"] = [];
  const incoming: Fake["incoming"] = new Map();
  const delivers = options.rate ?? ((d: Amount) => d);
  let toLose = options.loseResponses ?? 0;
  let n = 0;
  const sentPayout = (i: number): SentPayout => {
    const s = sent[i];
    if (!s) throw new Error("no such payment");
    return { quoteUrl: `https://${HOST}/quotes/${i + 1}`, outgoingPaymentUrl: `https://${HOST}/outgoing/${i + 1}`, receiveAmount: delivers(s.debit) };
  };
  return {
    sent,
    incoming,
    settleAll() {
      for (const s of sent) {
        const ip = incoming.get(s.incomingPaymentUrl);
        if (ip && !options.gaveUp?.has(s.key)) ip.received = delivers(s.debit);
      }
    },
    async createMemberIncomingPayment(walletAddressUrl, { key }) {
      const url = `https://${HOST}/incoming/${++n}`;
      incoming.set(url, { walletAddressUrl, key, received: null, completed: false });
      return { url };
    },
    async readMemberIncomingPayment(_wallet, url) {
      const ip = incoming.get(url);
      if (!ip) throw new Error("not found");
      return { received: ip.received ?? { value: "0", assetCode: "COP", assetScale: 2 } };
    },
    async completeMemberIncomingPayment(_wallet, url) {
      const ip = incoming.get(url);
      if (ip) ip.completed = true;
    },
    async payFromPool(_access, { incomingPaymentUrl, key, debitAmount }) {
      const ip = incoming.get(incomingPaymentUrl);
      if (ip && options.refuse?.has(ip.walletAddressUrl)) throw new PaymentRefusedError("quote", 400);
      sent.push({ key, debit: debitAmount, incomingPaymentUrl });
      if ((options.settle ?? "now") === "now") this.settleAll();
      if (toLose > 0) {
        toLose--;
        throw new Error("network: response lost");
      }
      return sentPayout(sent.length - 1);
    },
    async findPoolPayment(_access, key) {
      const i = sent.findIndex((s) => s.key === key);
      return i === -1 ? null : sentPayout(i);
    },
    async readPoolPayment(_access, url) {
      const i = Number(url.split("/").pop()) - 1;
      return { failed: options.gaveUp?.has(sent[i]?.key ?? "") ?? false };
    },
  };
}

// The pool's access: flip `granted` to simulate its owner not having authorized payouts yet.
function fakePool() {
  const state = { granted: true };
  return {
    state,
    async withAccess<T>(call: (a: { walletAddressUrl: string; accessToken: string }) => Promise<T>): Promise<T> {
      if (!state.granted) throw new NoPoolGrantError();
      return call({ walletAddressUrl: POOL_URL, accessToken: "pool-token" });
    },
  };
}

// ── Circles in a given state, written straight to the database ────────────

type Status = "COMPLETED" | "FAILED" | "PENDING";

interface Setup {
  payoutMode?: "PER_ROUND" | "END";
  feeBps?: number;
  members: string[];
  /** Per round: its state and, per member name, their contribution status (default COMPLETED). */
  rounds: { state: "FUNDED" | "BLOCKED" | "UPCOMING" | "COLLECTING"; statuses?: Record<string, Status> }[];
  /** Members created without a linked wallet. */
  noWallet?: string[];
}

interface Built {
  id: string;
  memberIds: Record<string, string>;
  walletOf: Record<string, string>;
  roundIds: string[];
}

async function circleWith(setup: Setup): Promise<Built> {
  const mode = setup.payoutMode ?? "PER_ROUND";
  const size = setup.members.length;
  const userIds: Record<string, string> = {};
  const walletOf: Record<string, string> = {};
  for (const name of setup.members) {
    const id = randomUUID();
    let walletId: string | null = null;
    if (!setup.noWallet?.includes(name)) {
      walletOf[name] = `https://${HOST}/${name}-${id}`;
      const [w] = await db.insert(wallets).values({ addressUrl: walletOf[name], assetCode: "COP", assetScale: 2 }).returning({ id: wallets.id });
      walletId = w?.id ?? null;
    }
    await db.insert(users).values({
      id,
      email: `${id}@example.test`,
      documentType: "cc",
      documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
      nationality: "CO",
      fullName: `${PREFIX}${name}`,
      opWallet: walletId,
    });
    userIds[name] = id;
  }
  const [circle] = await db
    .insert(circles)
    .values({
      name: `${PREFIX}Natillera`,
      status: "ACTIVE",
      contributionValue: C,
      assetCode: "COP",
      assetScale: 2,
      feeBps: setup.feeBps ?? 0,
      roundLengthDays: 30,
      cadence: "MONTHLY",
      inviteCode: randomBytes(32).toString("base64url"),
      size,
      payoutMode: mode,
      goalValue: mode === "END" ? C * BigInt(size) * BigInt(setup.rounds.length) : null,
      poolWalletId,
      createdBy: userIds[setup.members[0] ?? ""] ?? "",
      startedAt: NOW,
    })
    .returning({ id: circles.id });
  if (!circle) throw new Error("circle insert");
  const memberIds: Record<string, string> = {};
  for (const [i, name] of setup.members.entries()) {
    const [m] = await db
      .insert(circleMembers)
      .values({ circleId: circle.id, userId: userIds[name] ?? "", payoutRound: i + 1 })
      .returning({ id: circleMembers.id });
    memberIds[name] = m?.id ?? "";
  }
  const roundIds: string[] = [];
  for (const [i, r] of setup.rounds.entries()) {
    const [row] = await db
      .insert(rounds)
      .values({
        circleId: circle.id,
        number: i + 1,
        beneficiaryMemberId: mode === "END" ? null : (memberIds[setup.members[i] ?? ""] ?? null),
        state: r.state,
        startsAt: new Date(NOW.getTime() - (setup.rounds.length - i) * 86_400_000),
        deadline: new Date(NOW.getTime() - (setup.rounds.length - i - 1) * 86_400_000),
      })
      .returning({ id: rounds.id });
    if (!row) throw new Error("round insert");
    roundIds.push(row.id);
    if (r.state === "UPCOMING") continue;
    await db.insert(contributions).values(
      setup.members.map((name) => {
        const status = r.statuses?.[name] ?? "COMPLETED";
        return {
          roundId: row.id,
          memberId: memberIds[name] ?? "",
          value: C,
          assetCode: "COP",
          assetScale: 2,
          status,
          completedAt: status === "COMPLETED" ? NOW : null,
          idempotencyKey: `contribution:${row.id}:${memberIds[name]}`,
        };
      }),
    );
  }
  return { id: circle.id, memberIds, walletOf, roundIds };
}

const payoutsOf = (circleId: string) => db.select().from(payouts).where(eq(payouts.circleId, circleId)).orderBy(asc(payouts.createdAt), asc(payouts.idempotencyKey));
const roundStates = async (circleId: string) =>
  (await db.select({ state: rounds.state }).from(rounds).where(eq(rounds.circleId, circleId)).orderBy(asc(rounds.number))).map((r) => r.state);
const circleStatus = async (circleId: string) => (await db.select({ status: circles.status }).from(circles).where(eq(circles.id, circleId)))[0]?.status;

describe("payouts against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    db = createDb(databaseUrl ?? "");
    await deleteTestData();
    const [pool] = await db.insert(wallets).values({ addressUrl: POOL_URL, assetCode: "COP", assetScale: 2 }).returning({ id: wallets.id });
    poolWalletId = pool?.id ?? "";
  });

  after(async () => {
    await deleteTestData();
    await db.$client.end();
  });

  describe("PER_ROUND", () => {
    test("a funded round pays its beneficiary the pot after the fee; the round is paid out, the circle goes on", async () => {
      const c = await circleWith({ feeBps: 200, members: ["ana", "bob", "cata"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }, { state: "UPCOMING" }] });
      const ops = fakePayouts();
      await createPayouts({ db, payments: ops, pool: fakePool() }).payCircle(c.id, NOW);

      const [p, ...rest] = await payoutsOf(c.id);
      assert.equal(rest.length, 0);
      // 3 × 20k = 60k, less 2% = 58.800,00.
      assert.equal(p?.kind, "ROUND");
      assert.equal(p?.memberId, c.memberIds["ana"]);
      assert.equal(p?.value, 5_880_000n);
      assert.equal(p?.status, "COMPLETED");
      assert.equal(p?.completedAt?.getTime(), NOW.getTime());
      assert.equal(p?.receiveValue, 5_880_000n);
      assert.deepEqual(ops.sent.map((s) => s.debit), [{ value: "5880000", assetCode: "COP", assetScale: 2 }]);
      // The member's incoming payment is on their wallet, and closed once paid.
      assert.deepEqual([...ops.incoming.values()].map((i) => [i.walletAddressUrl, i.completed]), [[c.walletOf["ana"], true]]);
      assert.deepEqual(await roundStates(c.id), ["PAID_OUT", "UPCOMING", "UPCOMING"]);
      assert.equal(await circleStatus(c.id), "ACTIVE");

      const events = (await db.select({ type: auditEvents.eventType, amount: auditEvents.amount }).from(auditEvents).where(like(auditEvents.externalId, `%${p?.idempotencyKey}`))).map((e) => [e.type, e.amount]);
      assert.deepEqual(
        events.sort(),
        [
          ["payout.completed", 5_880_000n],
          ["payout.created", 5_880_000n],
          ["payout.fee", 120_000n],
        ].sort(),
      );
    });

    test("once every round is paid out, the circle is COMPLETED; running again changes nothing", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "FUNDED" }] });
      const ops = fakePayouts();
      const service = createPayouts({ db, payments: ops, pool: fakePool() });
      await service.payCircle(c.id, NOW);
      await service.payCircle(c.id, NOW);

      assert.deepEqual(
        (await payoutsOf(c.id)).map((p) => [p.kind, p.value, p.status]),
        [
          ["ROUND", 4_000_000n, "COMPLETED"],
          ["ROUND", 4_000_000n, "COMPLETED"],
        ],
      );
      assert.equal(ops.sent.length, 2, "paid twice");
      assert.deepEqual(await roundStates(c.id), ["PAID_OUT", "PAID_OUT"]);
      assert.equal(await circleStatus(c.id), "COMPLETED");
    });

    test("a blocked round pays what it collected; the defaulter's own round nets the debt and compensates", async () => {
      const c = await circleWith({
        members: ["ana", "bob", "cata"],
        rounds: [{ state: "BLOCKED", statuses: { bob: "FAILED" } }, { state: "FUNDED" }, { state: "UPCOMING" }],
      });
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(c.id, NOW);

      const byKind = (await payoutsOf(c.id)).map((p) => [p.kind, Object.keys(c.memberIds).find((n) => c.memberIds[n] === p.memberId), p.value, p.status]);
      assert.deepEqual(
        byKind.sort(),
        [
          ["COMPENSATION", "ana", 2_000_000n, "COMPLETED"],
          ["ROUND", "ana", 4_000_000n, "COMPLETED"],
          ["ROUND", "bob", 4_000_000n, "COMPLETED"],
        ].sort(),
      );
      assert.deepEqual(await roundStates(c.id), ["PAID_OUT", "PAID_OUT", "UPCOMING"]);
    });

    test("the circle shows what was collected and, per seat, what was received and what is still expected", async () => {
      const c = await circleWith({
        members: ["ana", "bob", "cata"],
        rounds: [{ state: "BLOCKED", statuses: { bob: "FAILED" } }, { state: "COLLECTING", statuses: { cata: "PENDING" } }, { state: "UPCOMING" }],
      });
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(c.id, NOW);
      const view = await createCircleService({
        db,
        resolvePoolWallet: async () => ({ id: POOL_URL, assetCode: "COP", assetScale: 2 }),
        frontendUrl: "http://localhost:3001",
      }).get(c.id, { userId: (await db.select({ userId: circleMembers.userId }).from(circleMembers).where(eq(circleMembers.id, c.memberIds["ana"] ?? "")))[0]?.userId });

      const money = (value: bigint | string) => ({ value: String(value), assetCode: "COP", assetScale: 2 });
      // Round 1: 2 of 3 paid; round 2: 2 of 3 so far.
      assert.deepEqual(view.poolCollected, money(4n * C));
      const seat = (name: string) => view.seats.find((s) => s.memberId === c.memberIds[name])?.payout;
      // ana: her short round (40k) is paid; bob's debt comes back to her when his round pays.
      assert.deepEqual(seat("ana"), { expected: money(3n * C), saved: money(2n * C), payoutAt: view.rounds[0]?.deadline, status: "COMPLETED", received: money(2n * C) });
      // bob: his round's pot (60k if cata pays) less the 20k he owes ana.
      assert.deepEqual(seat("bob"), { expected: money(2n * C), saved: money(C), payoutAt: view.rounds[1]?.deadline, status: "SCHEDULED", received: null });
      assert.deepEqual(seat("cata")?.expected, money(3n * C));
    });

    test("missing a round after being paid: DEFAULTED (−50, floor 0), an open debt, and the circle stays open", async () => {
      // ana is paid in round 1, then misses round 2 (bob's): bob gets less and nothing can be netted.
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "BLOCKED", statuses: { ana: "FAILED" } }] });
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(c.id, NOW);
      assert.deepEqual(await roundStates(c.id), ["PAID_OUT", "PAID_OUT"]);
      assert.equal(await circleStatus(c.id), "ACTIVE", "completed with a default pending");

      const userOf = async (name: string) =>
        (await db.select({ userId: circleMembers.userId }).from(circleMembers).where(eq(circleMembers.id, c.memberIds[name] ?? "")))[0]?.userId ?? "";
      const ana = await userOf("ana");
      assert.equal(await openDebtCount(db, ana), 0, "a debt before its penalty time");

      // Past the penalty time (last round: deadline + 14 days).
      await createScoring({ db }).scoreCircle(c.id, new Date(NOW.getTime() + 15 * 86_400_000));
      const [anaUser] = await db.select({ walletId: users.opWallet }).from(users).where(eq(users.id, ana));
      const [profile] = await db.select().from(creditProfiles).where(eq(creditProfiles.walletId, anaUser?.walletId ?? ""));
      // 50 − 4 (round 1 paid after its deadline in this fixture) − 50 → floored at 0, never negative.
      assert.equal(scoreFromFraction(profile?.internalCreditScore ?? -1), 0);
      assert.equal(await openDebtCount(db, ana), 1);
      assert.equal(await openDebtCount(db, await userOf("bob")), 0);
      await assert.rejects(assertNoOpenDebt(db, ana), (err: unknown) => err instanceof AppError && err.code === "DEBT_OUTSTANDING" && err.status === 409);

      // Still visited, still not completed.
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(c.id, NOW);
      assert.equal(await circleStatus(c.id), "ACTIVE");
    });

    test("a miss before one's own round is netted, not a default; the circle completes", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "BLOCKED", statuses: { bob: "FAILED" } }, { state: "FUNDED" }] });
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(c.id, NOW);
      assert.equal(await circleStatus(c.id), "COMPLETED");
      await createScoring({ db }).scoreCircle(c.id, new Date(NOW.getTime() + 15 * 86_400_000));
      const bob = (await db.select({ userId: circleMembers.userId }).from(circleMembers).where(eq(circleMembers.id, c.memberIds["bob"] ?? "")))[0]?.userId ?? "";
      assert.equal(await openDebtCount(db, bob), 0);
    });

    test("the cap: never plans more than the circle collected", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }] });
      // Something already promised the whole pot (and more) elsewhere in this circle.
      await db.insert(payouts).values({
        circleId: c.id,
        roundId: c.roundIds[1] ?? "",
        memberId: c.memberIds["bob"] ?? "",
        kind: "COMPENSATION",
        value: 3_000_000n,
        assetCode: "COP",
        assetScale: 2,
        status: "FAILED",
        idempotencyKey: `payout:test:${c.id}`,
      });
      const ops = fakePayouts();
      await createPayouts({ db, payments: ops, pool: fakePool() }).payCircle(c.id, NOW);
      assert.equal((await payoutsOf(c.id)).length, 1);
      assert.equal(ops.sent.length, 0);
      assert.deepEqual(await roundStates(c.id), ["FUNDED", "UPCOMING"]);
    });
  });

  describe("debts: paying a default late", () => {
    const PENALTY_PASSED = new Date(NOW.getTime() + 15 * 86_400_000);

    // ana is paid in round 1, misses round 2 (bob's) and the default is scored.
    async function defaulted() {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "BLOCKED", statuses: { ana: "FAILED" } }] });
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(c.id, NOW);
      await createScoring({ db }).scoreCircle(c.id, PENALTY_PASSED);
      const userOf = async (name: string) =>
        (await db.select({ userId: circleMembers.userId }).from(circleMembers).where(eq(circleMembers.id, c.memberIds[name] ?? "")))[0]?.userId ?? "";
      const [debt] = await db
        .select({ id: contributions.id })
        .from(contributions)
        .where(and(eq(contributions.roundId, c.roundIds[1] ?? ""), eq(contributions.memberId, c.memberIds["ana"] ?? "")));
      return { ...c, ana: await userOf("ana"), bob: await userOf("bob"), debtId: debt?.id ?? "" };
    }

    // The member's grant, faked: `granted: false` is a member who revoked it.
    const access = (walletOf: Record<string, string>, userOf: Record<string, string>, state = { granted: true }) => ({
      async withAccess<T>(userId: string, call: (a: { walletAddressUrl: string; accessToken: string }) => Promise<T>): Promise<T> {
        if (!state.granted) throw new NoGrantError();
        const name = Object.keys(userOf).find((n) => userOf[n] === userId) ?? "";
        return call({ walletAddressUrl: walletOf[name] ?? "", accessToken: "member-token" });
      },
    });

    const statusOf = async (id: string) => (await db.select().from(contributions).where(eq(contributions.id, id)))[0];

    test("paid: COMPLETED late, the short beneficiary is compensated, the block lifts, re-scored late, the circle completes", async () => {
      const d = await defaulted();
      const ops = fakePayments();
      const debts = createDebtService({ db, payments: ops, memberAccess: access(d.walletOf, { ana: d.ana, bob: d.bob }), settleWait: { attempts: 1, intervalMs: 0 } });
      assert.deepEqual(
        (await debts.list(d.ana)).map((x) => [x.contributionId, x.roundNumber, x.amount.value, x.status]),
        [[d.debtId, 2, String(C), "OWED"]],
      );
      assert.deepEqual(await debts.list(d.bob), []);

      assert.equal(await debts.pay(d.ana, d.debtId), null, "not settled");
      const paid = await statusOf(d.debtId);
      assert.equal(paid?.status, "COMPLETED");
      assert.equal(paid?.failureCode, null);
      // Collected under its own key, never the first attempt's.
      assert.deepEqual(ops.outgoing.map((o) => [o.key, o.walletAddressUrl]), [[`debt:${d.debtId}`, d.walletOf["ana"]]]);
      assert.equal(await openDebtCount(db, d.ana), 0);
      assert.deepEqual(await debts.list(d.ana), []);

      const [compensation] = (await payoutsOf(d.id)).filter((p) => p.kind === "COMPENSATION");
      assert.deepEqual([compensation?.memberId, compensation?.roundId, compensation?.value, compensation?.status], [d.memberIds["bob"], d.roundIds[1], C, "PENDING"]);

      // The next cycle pays bob and completes the circle; scoring turns the default into a late payment.
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(d.id, NOW);
      assert.equal((await payoutsOf(d.id)).find((p) => p.kind === "COMPENSATION")?.status, "COMPLETED");
      assert.equal(await circleStatus(d.id), "COMPLETED");
      await createScoring({ db }).scoreCircle(d.id, PENALTY_PASSED);
      const late = await db.select().from(auditEvents).where(eq(auditEvents.externalId, `score.late:${d.debtId}`));
      assert.equal(late.length, 1);

      // Nothing left to pay.
      await assert.rejects(debts.pay(d.ana, d.debtId), (err: unknown) => err instanceof AppError && err.code === "DEBT_NOT_FOUND");
    });

    test("on its way: PAYING, a second pay is 409, the cycle finishes it", async () => {
      const d = await defaulted();
      const ops = fakePayments({ settle: "later" });
      const debts = createDebtService({ db, payments: ops, memberAccess: access(d.walletOf, { ana: d.ana, bob: d.bob }), settleWait: { attempts: 1, intervalMs: 0 } });
      assert.equal((await debts.pay(d.ana, d.debtId))?.status, "PAYING");
      await assert.rejects(debts.pay(d.ana, d.debtId), (err: unknown) => err instanceof AppError && err.code === "DEBT_IN_PROGRESS" && err.status === 409);
      assert.deepEqual((await debts.list(d.ana)).map((x) => x.status), ["PAYING"]);
      // While it's on its way the circle can't complete either.
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(d.id, NOW);
      assert.equal(await circleStatus(d.id), "ACTIVE");

      ops.settleAll();
      await debts.syncCircle(d.id);
      assert.equal((await statusOf(d.debtId))?.status, "COMPLETED");
      assert.equal(ops.outgoing.length, 1);
    });

    test("refused, or no grant: still owed, with the reason, and the error says so", async () => {
      const d = await defaulted();
      const refusing = createDebtService({
        db,
        payments: fakePayments({ refuse: new Set([d.walletOf["ana"] ?? ""]) }),
        memberAccess: access(d.walletOf, { ana: d.ana, bob: d.bob }),
        settleWait: { attempts: 1, intervalMs: 0 },
      });
      await assert.rejects(refusing.pay(d.ana, d.debtId), (err: unknown) => err instanceof AppError && err.code === "PAYMENT_REFUSED" && err.status === 422);
      assert.deepEqual([(await statusOf(d.debtId))?.status, (await statusOf(d.debtId))?.failureCode], ["FAILED", "QUOTE_FAILED"]);
      assert.equal(await openDebtCount(db, d.ana), 1);

      const revoked = createDebtService({
        db,
        payments: fakePayments(),
        memberAccess: access(d.walletOf, { ana: d.ana, bob: d.bob }, { granted: false }),
        settleWait: { attempts: 1, intervalMs: 0 },
      });
      await assert.rejects(revoked.pay(d.ana, d.debtId), (err: unknown) => err instanceof AppError && err.code === "WALLET_NOT_AUTHORIZED");
      assert.deepEqual([(await statusOf(d.debtId))?.status, (await statusOf(d.debtId))?.failureCode], ["FAILED", "NO_GRANT"]);
      assert.deepEqual((await owedBy(d)).map((x) => x.status), ["OWED"]);
    });

    test("a lost response is recovered after the lease without charging twice", async () => {
      const d = await defaulted();
      const ops = fakePayments({ loseResponses: 1 });
      let real = new Date("2026-06-20T12:00:00Z");
      const debts = createDebtService({ db, payments: ops, memberAccess: access(d.walletOf, { ana: d.ana, bob: d.bob }), realNow: () => real, settleWait: { attempts: 1, intervalMs: 0 } });
      assert.equal((await debts.pay(d.ana, d.debtId))?.status, "PAYING");
      await debts.syncCircle(d.id);
      assert.equal((await statusOf(d.debtId))?.status, "PROCESSING");

      real = new Date(real.getTime() + 3 * 60_000);
      await debts.syncCircle(d.id);
      assert.equal((await statusOf(d.debtId))?.status, "COMPLETED");
      assert.equal(ops.outgoing.length, 1, "charged twice");
    });

    test("someone else's debt, or a contribution that isn't owed, is 404", async () => {
      const d = await defaulted();
      const debts = createDebtService({ db, payments: fakePayments(), memberAccess: access(d.walletOf, { ana: d.ana, bob: d.bob }), settleWait: { attempts: 1, intervalMs: 0 } });
      await assert.rejects(debts.pay(d.bob, d.debtId), (err: unknown) => err instanceof AppError && err.code === "DEBT_NOT_FOUND");
      const [onTime] = await db.select({ id: contributions.id }).from(contributions).where(eq(contributions.roundId, d.roundIds[0] ?? ""));
      await assert.rejects(debts.pay(d.ana, onTime?.id ?? ""), (err: unknown) => err instanceof AppError && err.code === "DEBT_NOT_FOUND");
    });

    // The list as the debtor sees it.
    const owedBy = (d: { ana: string }) =>
      createDebtService({ db, payments: fakePayments(), memberAccess: { withAccess: async () => assert.fail("no payment") } }).list(d.ana);
  });

  describe("END", () => {
    test("nothing is paid while rounds remain; at the end each member gets what they paid in", async () => {
      const c = await circleWith({
        payoutMode: "END",
        feeBps: 200,
        members: ["ana", "bob"],
        rounds: [{ state: "FUNDED" }, { state: "BLOCKED", statuses: { bob: "FAILED" } }, { state: "UPCOMING" }],
      });
      const ops = fakePayouts();
      const service = createPayouts({ db, payments: ops, pool: fakePool() });
      await service.payCircle(c.id, NOW);
      assert.equal((await payoutsOf(c.id)).length, 0);
      assert.deepEqual(await roundStates(c.id), ["FUNDED", "BLOCKED", "UPCOMING"]);

      // The last round closes (bob paid it).
      await db.update(rounds).set({ state: "FUNDED" }).where(eq(rounds.id, c.roundIds[2] ?? ""));
      await db.insert(contributions).values(
        ["ana", "bob"].map((name) => ({
          roundId: c.roundIds[2] ?? "",
          memberId: c.memberIds[name] ?? "",
          value: C,
          assetCode: "COP",
          assetScale: 2,
          status: "COMPLETED" as const,
          completedAt: NOW,
          idempotencyKey: `contribution:${c.roundIds[2]}:${c.memberIds[name]}`,
        })),
      );
      await service.payCircle(c.id, NOW);

      const finals = (await payoutsOf(c.id)).map((p) => [p.kind, p.roundId, p.memberId, p.value, p.status]);
      // ana paid 3 × 20k = 60k → 58.800; bob paid 2 × 20k = 40k → 39.200 (2% fee).
      assert.deepEqual(
        finals.sort(),
        [
          ["FINAL", null, c.memberIds["ana"], 5_880_000n, "COMPLETED"],
          ["FINAL", null, c.memberIds["bob"], 3_920_000n, "COMPLETED"],
        ].sort(),
      );
      assert.deepEqual(await roundStates(c.id), ["PAID_OUT", "PAID_OUT", "PAID_OUT"]);
      assert.equal(await circleStatus(c.id), "COMPLETED");
    });
  });

  describe("failures and recovery", () => {
    test("no pool grant yet → payouts wait PENDING, nothing touches the member's wallet; paid once authorized", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }] });
      const ops = fakePayouts();
      const pool = fakePool();
      pool.state.granted = false;
      const service = createPayouts({ db, payments: ops, pool });
      await service.payCircle(c.id, NOW);
      const [waiting] = await payoutsOf(c.id);
      assert.equal(waiting?.status, "PENDING");
      assert.equal(waiting?.requestedAt, null);
      assert.equal(ops.incoming.size, 0);
      assert.deepEqual(await roundStates(c.id), ["PAYING_OUT", "UPCOMING"]);

      pool.state.granted = true;
      await service.payCircle(c.id, NOW);
      assert.equal((await payoutsOf(c.id))[0]?.status, "COMPLETED");
      assert.deepEqual(await roundStates(c.id), ["PAID_OUT", "UPCOMING"]);
    });

    test("a refused quote or a member without a wallet → FAILED; the circle can't complete", async () => {
      const refused = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "FUNDED" }] });
      await createPayouts({ db, payments: fakePayouts({ refuse: new Set([refused.walletOf["ana"] ?? ""]) }), pool: fakePool() }).payCircle(refused.id, NOW);
      assert.deepEqual(
        (await payoutsOf(refused.id)).map((p) => [p.memberId === refused.memberIds["ana"] ? "ana" : "bob", p.status, p.failureCode]).sort(),
        [
          ["ana", "FAILED", "QUOTE_FAILED"],
          ["bob", "COMPLETED", null],
        ],
      );
      assert.deepEqual(await roundStates(refused.id), ["PAYING_OUT", "PAID_OUT"]);
      assert.equal(await circleStatus(refused.id), "ACTIVE");

      const walletless = await circleWith({ members: ["ana", "bob"], noWallet: ["ana"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }] });
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(walletless.id, NOW);
      const [p] = await payoutsOf(walletless.id);
      assert.deepEqual([p?.status, p?.failureCode], ["FAILED", "NO_WALLET"]);
    });

    test("paid but not received yet → PROCESSING; COMPLETED once the member's wallet has it", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }] });
      const ops = fakePayouts({ settle: "later" });
      const service = createPayouts({ db, payments: ops, pool: fakePool() });
      await service.payCircle(c.id, NOW);
      assert.equal((await payoutsOf(c.id))[0]?.status, "PROCESSING");
      assert.deepEqual(await roundStates(c.id), ["PAYING_OUT", "UPCOMING"]);

      ops.settleAll();
      await service.payCircle(c.id, NOW);
      assert.equal((await payoutsOf(c.id))[0]?.status, "COMPLETED");
      assert.equal(ops.sent.length, 1);
    });

    test("the pool's payment gave up → FAILED PAYMENT_FAILED", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }] });
      const ops = fakePayouts({ settle: "later", gaveUp: new Set([`payout:round:${c.roundIds[0]}`]) });
      await createPayouts({ db, payments: ops, pool: fakePool() }).payCircle(c.id, NOW);
      const [p] = await payoutsOf(c.id);
      assert.deepEqual([p?.status, p?.failureCode], ["FAILED", "PAYMENT_FAILED"]);
    });

    test("a lost response is recovered after the lease from the pool's own record: never paid twice", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }] });
      const ops = fakePayouts({ loseResponses: 1 });
      let real = new Date("2026-06-01T12:00:00Z");
      const service = createPayouts({ db, payments: ops, pool: fakePool(), realNow: () => real });
      await service.payCircle(c.id, NOW);
      const [lost] = await payoutsOf(c.id);
      assert.equal(lost?.status, "PROCESSING");
      assert.equal(lost?.outgoingPaymentUrl, null);

      // Within the lease: left alone. After it: found by its key, not paid again.
      await service.payCircle(c.id, NOW);
      assert.equal(ops.sent.length, 1);
      real = new Date(real.getTime() + 3 * 60_000);
      await service.payCircle(c.id, NOW);
      const [recovered] = await payoutsOf(c.id);
      assert.equal(recovered?.status, "COMPLETED");
      assert.equal(ops.sent.length, 1, "paid twice");
    });

    test("cross-currency: proven by what the member's wallet received in its own asset", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "UPCOMING" }] });
      // 40.000,00 COP → 9,40 EUR, as quoted.
      const ops = fakePayouts({ rate: () => ({ value: "940", assetCode: "EUR", assetScale: 2 }) });
      await createPayouts({ db, payments: ops, pool: fakePool() }).payCircle(c.id, NOW);
      const [p] = await payoutsOf(c.id);
      assert.deepEqual([p?.status, p?.value, p?.receiveValue, p?.receiveAssetCode], ["COMPLETED", 4_000_000n, 940n, "EUR"]);
    });

    test("circles not ACTIVE are left alone", async () => {
      const c = await circleWith({ members: ["ana", "bob"], rounds: [{ state: "FUNDED" }, { state: "FUNDED" }] });
      await db.update(circles).set({ status: "COMPLETED" }).where(and(eq(circles.id, c.id)));
      await createPayouts({ db, payments: fakePayouts(), pool: fakePool() }).payCircle(c.id, NOW);
      assert.equal((await payoutsOf(c.id)).length, 0);
    });
  });
});
