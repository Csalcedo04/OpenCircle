import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import {
  applicationVotes,
  auditEvents,
  circleApplications,
  circleInvites,
  circleMembers,
  circles,
  contributions,
  creditProfiles,
  friendships,
  ledgerAccounts,
  ledgerTransfers,
  reviews,
  rounds,
  testClocks,
  users,
  wallets,
} from "../src/db/schema";
import { createCircleTick } from "../src/services/circles/circle-cycle";
import { createReminders } from "../src/services/circles/reminders.service";
import { createScoring } from "../src/services/circles/scoring.service";
import { scoreFromFraction } from "../src/services/credit/credit-score";
import type { CircleInvite, Notification, NotificationSender, PaymentReminder } from "../src/services/notifications/sender";
import { createApplicationNotices } from "../src/services/circles/application-notices";
import { createInviteNotices, type InviteNotices } from "../src/services/circles/invite-notices";
import { createInviteService, type CodeInviteDto, type DirectInviteDto, type InviteDto, type MyInvitationDto } from "../src/services/circles/invite.service";
import { createFriendService } from "../src/services/friend.service";
import type { Services } from "../src/routes";
import { createCircleService, displayName, type CircleDto } from "../src/services/circle.service";
import { createApplicationService, type ApplicationDto } from "../src/services/circles/application.service";
import { createMemberService, type MemberDto } from "../src/services/member.service";
import { createUserService } from "../src/services/user.service";
import { periodEnd, periodStart } from "../src/services/circles/period-schedule";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeServices } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

// Runs against the database in DATABASE_URL (Supabase). Its rows use the "[test-circles] " name
// prefix and a pot wallet under https://circles.test/ (not the users suite's "[test] " / wallet.test,
// since both suites run in parallel), and are deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "[test-circles] ";
const POOL_HOST = "circles.test";
const POOL_URL = `https://${POOL_HOST}/pool-${randomUUID()}`;
const FRONTEND_URL = "http://localhost:3001";

let db: Db;
let server: TestServer;
let auth: TestAuth;
const createdUserIds: string[] = [];
const approved = new Set<string>();

// Every email the application flow sends; `noticeFailures` makes the next sends throw.
const outbox: Notification[] = [];
let noticeFailures = 0;
let notices: ReturnType<typeof createApplicationNotices>;
let inviteNotices: InviteNotices;

async function deleteTestData(): Promise<void> {
  // Every user this suite made, including those an interrupted run left behind (found by name).
  const testUserIds = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(or(like(users.fullName, `${PREFIX}%`), createdUserIds.length > 0 ? inArray(users.id, createdUserIds) : undefined))
  ).map((u) => u.id);
  const userFilter = testUserIds.length > 0 ? inArray(circles.createdBy, testUserIds) : undefined;
  const testCircles = await db
    .select({ id: circles.id })
    .from(circles)
    .where(or(like(circles.name, `${PREFIX}%`), userFilter));
  const circleIds = testCircles.map((c) => c.id);

  // Ledger rows reference circles (pots) and users (accounts), so they go before both.
  const accountIds = (
    await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(
        or(
          circleIds.length > 0 ? inArray(ledgerAccounts.circleId, circleIds) : undefined,
          testUserIds.length > 0 ? inArray(ledgerAccounts.ownerUserId, testUserIds) : undefined,
        ),
      )
  ).map((a) => a.id);
  if (accountIds.length > 0) {
    const touching = or(inArray(ledgerTransfers.fromAccountId, accountIds), inArray(ledgerTransfers.toAccountId, accountIds));
    await db.delete(auditEvents).where(inArray(auditEvents.accountId, accountIds));
    await db.delete(ledgerTransfers).where(touching);
    await db.delete(ledgerAccounts).where(inArray(ledgerAccounts.id, accountIds));
  }

  // FK order: votes → applications → invites → contributions → rounds → seats → reviews → circles; nothing cascades.
  if (circleIds.length > 0) {
    const appIds = (
      await db.select({ id: circleApplications.id }).from(circleApplications).where(inArray(circleApplications.circleId, circleIds))
    ).map((a) => a.id);
    if (appIds.length > 0) await db.delete(applicationVotes).where(inArray(applicationVotes.applicationId, appIds));
    await db.delete(circleApplications).where(inArray(circleApplications.circleId, circleIds));
    await db.delete(circleInvites).where(inArray(circleInvites.circleId, circleIds));
    const roundIds = (await db.select({ id: rounds.id }).from(rounds).where(inArray(rounds.circleId, circleIds))).map((r) => r.id);
    if (roundIds.length > 0) await db.delete(contributions).where(inArray(contributions.roundId, roundIds));
    await db.delete(rounds).where(inArray(rounds.circleId, circleIds));
    await db.delete(circleMembers).where(inArray(circleMembers.circleId, circleIds));
    await db.delete(reviews).where(inArray(reviews.circleId, circleIds));
    await db.delete(circles).where(inArray(circles.id, circleIds));
  }
  // Pot and member wallets all live under the suite's host; users reference theirs, so they go first.
  const testWallets = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `https://${POOL_HOST}/%`))).map(
    (w) => w.id,
  );
  if (testWallets.length > 0) await db.delete(auditEvents).where(inArray(auditEvents.walletId, testWallets));
  if (testUserIds.length > 0) {
    await db.delete(testClocks).where(inArray(testClocks.ownerUserId, testUserIds));
    await db.delete(friendships).where(or(inArray(friendships.requesterId, testUserIds), inArray(friendships.addresseeId, testUserIds)));
    await db.delete(users).where(inArray(users.id, testUserIds));
  }
  if (testWallets.length > 0) await db.delete(wallets).where(inArray(wallets.id, testWallets));
}

interface Member {
  id: string;
  token: string;
  documentNumber: string;
  walletAddress: string | null;
}

// A user with a profile; KYC-approved unless told otherwise (KYC itself is faked here).
// `wallet` links a wallet (needed to apply); `score` stores a credit profile (0..1).
async function member(options: { kyc?: boolean; name?: string; wallet?: boolean; score?: number; email?: string } = {}): Promise<Member> {
  const id = randomUUID();
  createdUserIds.push(id);
  const documentNumber = String(randomInt(1_000_000_000, 9_999_999_999));
  let walletId: string | null = null;
  let walletAddress: string | null = null;
  if (options.wallet ?? true) {
    walletAddress = `https://${POOL_HOST}/member-${id}`;
    const [wallet] = await db
      .insert(wallets)
      .values({ addressUrl: walletAddress, assetCode: "COP", assetScale: 2 })
      .returning({ id: wallets.id });
    walletId = wallet?.id ?? null;
    if (walletId && options.score !== undefined) {
      await db.insert(creditProfiles).values({ walletId, internalCreditScore: options.score });
    }
  }
  await db.insert(users).values({
    id,
    email: options.email ?? `${id}@example.test`,
    documentType: "cc",
    documentNumber,
    nationality: "CO",
    fullName: `${PREFIX}${options.name ?? "Ana María Gómez"}`,
    phone: "+573001112233",
    opWallet: walletId,
  });
  if (options.kyc ?? true) approved.add(id);
  return { id, token: await auth.token(id), documentNumber, walletAddress };
}

const validCircle = (overrides: Record<string, unknown> = {}) => ({
  name: `${PREFIX}Natillera Laureles`,
  city: "Medellín",
  contributionValue: "2000000",
  size: 3,
  cadence: "WEEKLY",
  // These suites test circles that anyone can find; private circles have their own block below.
  visibility: "PUBLIC",
  ...overrides,
});

async function createCircle(token: string, overrides: Record<string, unknown> = {}): Promise<CircleDto> {
  const res = await server.request("/api/circles", { method: "POST", token, body: validCircle(overrides) });
  assert.equal(res.status, 201, res.text);
  return res.body as CircleDto;
}

// The circle's standing invite code (the link the creator shares), read from the DB; null for
// a circle that doesn't exist or has none.
async function standingCode(circleId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: circleInvites.token })
    .from(circleInvites)
    .where(and(eq(circleInvites.circleId, circleId), eq(circleInvites.kind, "CODE"), eq(circleInvites.status, "ACTIVE"), isNull(circleInvites.maxUses)))
    .orderBy(desc(circleInvites.createdAt))
    .limit(1);
  return row?.token ?? null;
}

// Joins through the circle's invite link (read from the DB) unless the body brings its own
// `invite`; without a link, public circles take applications instead (APPLICATION_REQUIRED).
async function join(id: string, token: string, body: Record<string, unknown> = {}) {
  const code = "invite" in body ? null : await standingCode(id);
  return server.request(`/api/circles/${id}/join`, {
    method: "POST",
    token,
    body: code === null ? body : { ...body, invite: code },
  });
}

const joinWithoutInvite = (id: string, token: string, body: Record<string, unknown>) =>
  server.request(`/api/circles/${id}/join`, { method: "POST", token, body });

// The `invite` query value of a circle's invite link.
const inviteOf = (circle: CircleDto) => new URL(circle.inviteUrl ?? "http://x").searchParams.get("invite") ?? "";

const applyTo = (circleId: string, token: string, body: Record<string, unknown> = {}) =>
  server.request(`/api/circles/${circleId}/applications`, { method: "POST", token, body });

const voteOn = (circleId: string, applicationId: string, token: string, decision: "ACCEPT" | "REJECT") =>
  server.request(`/api/circles/${circleId}/applications/${applicationId}/votes`, {
    method: "POST",
    token,
    body: { decision },
  });

async function applied(circleId: string, applicant: Member, body: Record<string, unknown> = {}): Promise<ApplicationDto> {
  const res = await applyTo(circleId, applicant.token, body);
  assert.equal(res.status, 201, res.text);
  return res.body as ApplicationDto;
}

// Applies and has the approver accept.
async function seated(circleId: string, approver: Member, applicant: Member, body: Record<string, unknown> = {}) {
  const application = await applied(circleId, applicant, body);
  const res = await voteOn(circleId, application.id, approver.token, "ACCEPT");
  assert.equal(res.status, 200, res.text);
  return res.body as ApplicationDto;
}

const getCircle = async (id: string, token?: string): Promise<CircleDto> =>
  (await server.request(`/api/circles/${id}`, token ? { token } : {})).body as CircleDto;

const publicProfile = (target: string, token: string) => server.request(`/api/users/${target}/public`, { token });

describe("display names", () => {
  test("public pages show first name and last initial", () => {
    assert.equal(displayName("Ana María Gómez"), "Ana G.");
    assert.equal(displayName("  carlos   salcedo "), "carlos S.");
    assert.equal(displayName("Ana"), "Ana");
    assert.equal(displayName(null), "—");
  });
});

describe("circles API against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    auth = await setupTestAuth();
    db = createDb(databaseUrl ?? "");
    await deleteTestData();

    const kyc: Services["kyc"] = {
      ...fakeServices().kyc,
      getStatus: async (id) => ({ status: approved.has(id) ? "Approved" : null, approved: approved.has(id) }),
    };
    const circleService = createCircleService({
      db,
      resolvePoolWallet: async () => ({ id: POOL_URL, assetCode: "COP", assetScale: 2 }),
      frontendUrl: FRONTEND_URL,
    });
    const sender: NotificationSender = {
      send: async (n) => {
        if (noticeFailures > 0) {
          noticeFailures--;
          throw new Error("provider down");
        }
        outbox.push(n);
      },
    };
    notices = createApplicationNotices({ db, sender });
    inviteNotices = createInviteNotices({ db, sender, frontendUrl: FRONTEND_URL });
    server = await startServer(
      fakeServices({
        circles: circleService,
        applications: createApplicationService({ db, circles: circleService, notices }),
        invites: createInviteService({ db, circles: circleService, notices: inviteNotices, frontendUrl: FRONTEND_URL }),
        friends: createFriendService({ db }),
        users: createUserService(db),
        kyc,
        members: createMemberService({ db, circles: circleService }),
      }),
    );
  });

  after(async () => {
    await deleteTestData();
    await server.close();
    await db.$client.end();
  });

  describe("create", () => {
    test("without a token → 401", async () => {
      const res = await server.request("/api/circles", { method: "POST", body: validCircle() });
      assert.equal(res.status, 401);
    });

    test("without approved KYC → 403 KYC_REQUIRED, nothing stored", async () => {
      const { id, token } = await member({ kyc: false });
      const res = await server.request("/api/circles", { method: "POST", token, body: validCircle() });
      assert.equal(res.status, 403);
      assert.equal(errorCode(res.body), "KYC_REQUIRED");
      assert.equal((await db.select().from(circles).where(eq(circles.createdBy, id))).length, 0);
    });

    test("the city is optional: without one it's stored and returned as null", async () => {
      const { token } = await member();
      const { city: _city, ...withoutCity } = validCircle();
      const res = await server.request("/api/circles", { method: "POST", token, body: withoutCity });
      assert.equal(res.status, 201, res.text);
      assert.equal((res.body as CircleDto).city, null);
    });

    test("→ 201: OPEN, creator in the first seat, best score first by default, amounts in the pot's asset", async () => {
      const { id, token } = await member();
      const circle = await createCircle(token);

      assert.equal(circle.status, "OPEN");
      assert.deepEqual(circle.contribution, { value: "2000000", assetCode: "COP", assetScale: 2 });
      assert.deepEqual(circle.threshold, circle.contribution);
      assert.equal(circle.feeBps, 200);
      assert.equal(circle.grantWeightBps, 5000);
      assert.equal(circle.poolWalletAddress, POOL_URL);
      assert.equal(circle.seatsTaken, 1);
      assert.equal(circle.currentRound, null);
      assert.deepEqual(circle.rounds, []);
      assert.equal(circle.seats.length, 1);
      assert.equal(circle.seats[0]?.payoutRound, 1);
      assert.equal(circle.payoutOrder, "BEST_SCORE_FIRST");
      assert.equal(circle.seats[0]?.displayName, "[test-circles] G.");

      const [row] = await db.select().from(circles).where(eq(circles.id, circle.id));
      assert.equal(row?.createdBy, id);
      assert.equal(row?.contributionValue, 2000000n);
    });

    test("shows members as 'Ana G.': never their full name, email or document", async () => {
      const { id, token, documentNumber } = await member({ name: "Valentina Restrepo" });
      const circle = await createCircle(token);
      const res = await server.request(`/api/circles/${circle.id}`);
      assert.ok(!res.text.includes("Valentina Restrepo"), "full name leaked");
      assert.ok(!res.text.includes(`${id}@example.test`), "email leaked");
      assert.ok(!res.text.includes(documentNumber), "document leaked");
      // The user id is exposed on purpose: it links a seat to the member's profile (signed-in pages).
      assert.equal((res.body as CircleDto).seats[0]?.userId, id);
    });

    test("invalid fields → 400 VALIDATION_ERROR, nothing stored", async () => {
      const { id, token } = await member();
      for (const overrides of [
        { contributionValue: "1.5" },
        { contributionValue: "-5" },
        { contributionValue: 2000000 },
        { contributionValue: "0" },
        { size: 1 },
        { size: 51 },
        // Rounds come from the payout order, never from the request.
        { payoutRound: 1 },
        { payoutOrder: "RANDOM" },
        { cadence: "DAILY" },
        { cadence: undefined },
        { roundLengthDays: 7 },
        { name: " " },
        { feeBps: 0 },
        { status: "ACTIVE" },
      ]) {
        const res = await server.request("/api/circles", { method: "POST", token, body: validCircle(overrides) });
        assert.equal(res.status, 400, JSON.stringify(overrides));
        assert.equal(errorCode(res.body), "VALIDATION_ERROR");
      }
      assert.equal((await db.select().from(circles).where(eq(circles.createdBy, id))).length, 0);
    });
  });

  describe("browse", () => {
    test("GET /api/circles is public and filters by status", async () => {
      const { token } = await member();
      const circle = await createCircle(token);

      const all = await server.request("/api/circles");
      assert.equal(all.status, 200);
      assert.ok((all.body as { id: string }[]).some((c) => c.id === circle.id));

      const open = await server.request("/api/circles?status=OPEN");
      assert.ok((open.body as { status: string }[]).every((c) => c.status === "OPEN"));

      const bad = await server.request("/api/circles?status=DELETED");
      assert.equal(bad.status, 400);
    });

    test("unknown or malformed circle id → 404 CIRCLE_NOT_FOUND", async () => {
      for (const id of [randomUUID(), "not-a-uuid"]) {
        const res = await server.request(`/api/circles/${id}`);
        assert.equal(res.status, 404, id);
        assert.equal(errorCode(res.body), "CIRCLE_NOT_FOUND");
      }
    });

    test("GET /api/users/me/circles lists only the caller's circles", async () => {
      const alice = await member();
      const bob = await member();
      const mine = await createCircle(alice.token);
      const theirs = await createCircle(bob.token);

      const res = await server.request("/api/users/me/circles", { token: alice.token });
      assert.equal(res.status, 200);
      const ids = (res.body as { id: string }[]).map((c) => c.id);
      assert.ok(ids.includes(mine.id));
      assert.ok(!ids.includes(theirs.id));
    });
  });

  describe("join", () => {
    test("takes the next free seat; a repeat or a chosen round is refused", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const bob = await member();
      const carol = await member();

      const ok = await join(circle.id, bob.token, { collateralValue: "500000", grantMode: "RECURRING" });
      assert.equal(ok.status, 200);
      const seat = (ok.body as CircleDto).seats.find((s) => s.payoutRound === 2);
      assert.deepEqual(seat?.collateral, { value: "500000", assetCode: "COP", assetScale: 2 });
      assert.equal(seat?.grantMode, "RECURRING");

      const again = await join(circle.id, bob.token);
      assert.equal(again.status, 409);
      assert.equal(errorCode(again.body), "ALREADY_MEMBER");

      const chosen = await join(circle.id, carol.token, { payoutRound: 3 });
      assert.equal(chosen.status, 400);
      assert.equal(errorCode(chosen.body), "VALIDATION_ERROR");
    });

    test("without approved KYC → 403 KYC_REQUIRED", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const { token } = await member({ kyc: false });
      const res = await join(circle.id, token, {});
      assert.equal(res.status, 403);
      assert.equal(errorCode(res.body), "KYC_REQUIRED");
    });

    test("a member with an OpenCircle account pays from it by default; asking for it without one is refused", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      assert.equal(circle.seats[0]?.fundingSource, "EXTERNAL_WALLET");

      const saver = await member({ wallet: false });
      await db.insert(ledgerAccounts).values({ kind: "USER", ownerUserId: saver.id, assetCode: "COP", assetScale: 2 });
      const byDefault = await join(circle.id, saver.token, { grantMode: "RECURRING" });
      assert.equal(byDefault.status, 200, byDefault.text);
      const seat = (byDefault.body as CircleDto).seats.find((s) => s.userId === saver.id);
      assert.equal(seat?.fundingSource, "INTERNAL_ACCOUNT");
      // A grant mode means nothing for an account-funded seat.
      assert.equal(seat?.grantMode, null);

      const walletOnly = await member();
      const refused = await join(circle.id, walletOnly.token, { fundingSource: "INTERNAL_ACCOUNT" });
      assert.equal(refused.status, 409);
      assert.equal(errorCode(refused.body), "INTERNAL_ACCOUNT_REQUIRED");

      const other = await member({ wallet: false });
      await db.insert(ledgerAccounts).values({ kind: "USER", ownerUserId: other.id, assetCode: "USD", assetScale: 2 });
      const mismatch = await join(circle.id, other.token, { fundingSource: "INTERNAL_ACCOUNT" });
      assert.equal(mismatch.status, 422);
      assert.equal(errorCode(mismatch.body), "ASSET_MISMATCH");
      const fallback = await join(circle.id, other.token, {});
      assert.equal(fallback.status, 200, fallback.text);
      assert.equal((fallback.body as CircleDto).seats.find((s) => s.userId === other.id)?.fundingSource, "EXTERNAL_WALLET");
    });

    test("an unknown circle → 404 CIRCLE_NOT_FOUND", async () => {
      const { token } = await member();
      const res = await join(randomUUID(), token, {});
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "CIRCLE_NOT_FOUND");
    });

    test("filling the last seat starts the circle: rounds scheduled, round 1 contributions pending", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3, cadence: "WEEKLY" });
      const bob = await member();
      const carol = await member();
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      const last = await join(circle.id, carol.token, {});
      assert.equal(last.status, 200);

      const started = last.body as CircleDto;
      assert.equal(started.status, "ACTIVE");
      assert.ok(started.startedAt);
      assert.equal(started.currentRound, 1);
      assert.deepEqual(
        started.rounds.map((r) => r.state),
        ["COLLECTING", "UPCOMING", "UPCOMING"],
      );

      // Round n pays out to the member who holds payout round n.
      for (const round of started.rounds) {
        const seat = started.seats.find((s) => s.memberId === round.beneficiaryMemberId);
        assert.equal(seat?.payoutRound, round.number);
      }

      // Weekly periods: round n runs from start + (n − 1) weeks to start + n weeks.
      const start = Date.parse(started.startedAt ?? "");
      for (const r of started.rounds) {
        assert.equal(Date.parse(r.startsAt) - start, (r.number - 1) * 7 * 86_400_000);
        assert.equal(Date.parse(r.deadline) - start, r.number * 7 * 86_400_000);
      }

      // Everyone pays round 1, the beneficiary included.
      const first = started.rounds[0];
      assert.equal(first?.contributions.length, 3);
      assert.ok(first?.contributions.every((c) => c.status === "PENDING"));
      assert.ok(started.rounds.slice(1).every((r) => r.contributions.length === 0));

      const roundRows = await db.select().from(rounds).where(eq(rounds.circleId, circle.id)).orderBy(asc(rounds.number));
      const rows = await db.select().from(contributions).where(eq(contributions.roundId, roundRows[0]?.id ?? ""));
      for (const c of rows) {
        assert.equal(c.value, 2000000n);
        assert.equal(c.assetCode, "COP");
        assert.equal(c.idempotencyKey, `contribution:${c.roundId}:${c.memberId}`);
        assert.equal(c.completedAt, null);
      }
      const events = await db.select().from(auditEvents).where(eq(auditEvents.externalId, `circle.started:${circle.id}`));
      assert.equal(events.length, 1);
      assert.equal(events[0]?.eventType, "circle.started");

      const late = await member();
      const closed = await join(circle.id, late.token, {});
      assert.equal(closed.status, 409);
      assert.equal(errorCode(closed.body), "CIRCLE_NOT_OPEN");
    });

    test("a monthly circle's periods follow calendar months from its start", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3, cadence: "MONTHLY" });
      assert.equal(circle.cadence, "MONTHLY");
      const [bob, carol] = await Promise.all([member(), member()]);
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      const started = (await join(circle.id, carol.token, {})).body as CircleDto;

      const start = new Date(started.startedAt ?? "");
      assert.deepEqual(
        started.rounds.map((r) => [r.startsAt, r.deadline]),
        [1, 2, 3].map((n) => [periodStart(start, "MONTHLY", n).toISOString(), periodEnd(start, "MONTHLY", n).toISOString()]),
      );
    });

    for (const [order, expected] of [
      ["BEST_SCORE_FIRST", ["high", "new", "low"]],
      ["BEST_SCORE_LAST", ["low", "new", "high"]],
    ] as const) {
      test(`filling the circle orders payout rounds by score: ${order}`, async () => {
        // Join order low → new → high; with no score yet "new" ranks as the initial score (50).
        const low = await member({ score: 0.3 });
        const circle = await createCircle(low.token, { size: 3, payoutOrder: order });
        assert.equal(circle.payoutOrder, order);
        const [fresh, high] = [await member(), await member({ score: 0.9 })];
        assert.equal((await join(circle.id, fresh.token)).status, 200);
        const started = (await join(circle.id, high.token)).body as CircleDto;

        const names = new Map([[low.id, "low"], [fresh.id, "new"], [high.id, "high"]]);
        const byRound = [...started.seats].sort((a, b) => a.payoutRound - b.payoutRound).map((s) => names.get(s.userId));
        assert.deepEqual(byRound, expected);
        for (const round of started.rounds) {
          assert.equal(started.seats.find((s) => s.memberId === round.beneficiaryMemberId)?.payoutRound, round.number);
        }
      });
    }

    test("a biweekly circle's periods are two weeks long", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 2, cadence: "BIWEEKLY" });
      const started = (await join(circle.id, (await member()).token)).body as CircleDto;
      const start = Date.parse(started.startedAt ?? "");
      assert.deepEqual(
        started.rounds.map((r) => Date.parse(r.deadline) - start),
        [1, 2].map((n) => n * 14 * 86_400_000),
      );
    });

    test("two users racing for the last seat: one wins, the circle starts once", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 2 });
      const [bob, carol] = await Promise.all([member(), member()]);

      const results = await Promise.all([bob, carol].map((u) => join(circle.id, u.token, {})));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);

      const seats = await db.select().from(circleMembers).where(eq(circleMembers.circleId, circle.id));
      assert.equal(seats.length, 2);
      const roundRows = await db.select().from(rounds).where(eq(rounds.circleId, circle.id));
      assert.equal(roundRows.length, 2);
      const [row] = await db.select().from(circles).where(and(eq(circles.id, circle.id), eq(circles.status, "ACTIVE")));
      assert.ok(row, "circle did not start");
    });
  });

  describe("member records and profiles", () => {
    // A started circle of 3 whose round-1 contributions end on time, late and failed.
    async function settledCircle() {
      const [ana, bob, cam] = [await member({ name: "Ana Gómez" }), await member({ name: "Bob Ruiz" }), await member({ name: "Cam Díaz" })];
      const circle = await createCircle(ana.token, { size: 3 });
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      assert.equal((await join(circle.id, cam.token, {})).status, 200);

      const [round] = await db.select().from(rounds).where(and(eq(rounds.circleId, circle.id), eq(rounds.number, 1)));
      assert.ok(round, "round 1 missing");
      const seats = await db.select().from(circleMembers).where(eq(circleMembers.circleId, circle.id));
      const seatOf = (userId: string) => seats.find((s) => s.userId === userId)?.id ?? "";
      const hour = 3_600_000;
      const settle = (userId: string, values: { status: "COMPLETED" | "FAILED"; completedAt: Date | null }) =>
        db
          .update(contributions)
          .set(values)
          .where(and(eq(contributions.roundId, round.id), eq(contributions.memberId, seatOf(userId))));
      await settle(ana.id, { status: "COMPLETED", completedAt: new Date(round.deadline.getTime() - hour) });
      await settle(bob.id, { status: "COMPLETED", completedAt: new Date(round.deadline.getTime() + hour) });
      await settle(cam.id, { status: "FAILED", completedAt: null });
      return { circle, ana, bob, cam };
    }

    test("records count on time, late and missed payments from real contributions", async () => {
      const { circle, ana, bob, cam } = await settledCircle();
      const res = await server.request(`/api/circles/${circle.id}`);
      const record = (userId: string) => (res.body as CircleDto).seats.find((s) => s.userId === userId)?.record.payments;
      assert.deepEqual(record(ana.id), { onTime: 1, late: 0, missed: 0 });
      assert.deepEqual(record(bob.id), { onTime: 0, late: 1, missed: 0 });
      assert.deepEqual(record(cam.id), { onTime: 0, late: 0, missed: 1 });
    });

    test("GET /api/members/:id: record, circles completed, member since, reviews received, circles", async () => {
      const { circle, ana, bob } = await settledCircle();
      await db.update(circles).set({ status: "COMPLETED" }).where(eq(circles.id, circle.id));
      await db.insert(reviews).values({ authorId: ana.id, subjectId: bob.id, circleId: circle.id, rating: 4, comment: "Pagó, aunque tarde" });

      const res = await server.request(`/api/members/${bob.id}`, { token: ana.token });
      assert.equal(res.status, 200, res.text);
      const profile = res.body as MemberDto;
      assert.equal(profile.id, bob.id);
      assert.equal(profile.displayName, "[test-circles] R.");
      assert.deepEqual(profile.payments, { onTime: 0, late: 1, missed: 0 });
      assert.equal(profile.circlesCompleted, 1);
      assert.deepEqual(profile.ratings, { count: 1, tenths: 40 });
      assert.ok(profile.memberSince && Date.parse(profile.memberSince) <= Date.now());
      assert.deepEqual(
        profile.reviews.map((r) => ({ author: r.authorName, circle: r.circleName, rating: r.rating, comment: r.comment })),
        [{ author: "[test-circles] G.", circle: `${PREFIX}Natillera Laureles`, rating: 4, comment: "Pagó, aunque tarde" }],
      );
      assert.ok(profile.circles.some((c) => c.id === circle.id));

      // The circle shows its reviews too.
      const detail = (await server.request(`/api/circles/${circle.id}`)).body as CircleDto;
      assert.equal(detail.reviews.length, 1);
      assert.equal(detail.reviews[0]?.subjectId, bob.id);
    });

    test("a member who never joined a circle has an empty record", async () => {
      const lone = await member();
      // Seen by themselves: someone who shares no circle with them can't see the profile at all.
      const res = await server.request(`/api/members/${lone.id}`, { token: lone.token });
      assert.equal(res.status, 200);
      const profile = res.body as MemberDto;
      assert.deepEqual(profile.payments, { onTime: 0, late: 0, missed: 0 });
      assert.deepEqual(profile.ratings, { count: 0, tenths: 0 });
      assert.equal(profile.circlesCompleted, 0);
      assert.equal(profile.memberSince, null);
      assert.deepEqual(profile.reviews, []);
      assert.deepEqual(profile.circles, []);
    });

    test("profiles need sign-in, never leak identity data, and unknown ids are 404", async () => {
      const subject = await member({ name: "Valentina Restrepo" });
      const viewer = await member();
      // The viewer shares a circle with the subject, so the profile is visible to them.
      const shared = await createCircle(viewer.token, { size: 3 });
      assert.equal((await join(shared.id, subject.token, {})).status, 200);
      assert.equal((await server.request(`/api/members/${subject.id}`)).status, 401);

      const res = await server.request(`/api/members/${subject.id}`, { token: viewer.token });
      assert.ok(!res.text.includes("Valentina Restrepo"), "full name leaked");
      assert.ok(!res.text.includes(`${subject.id}@example.test`), "email leaked");
      assert.ok(!res.text.includes(subject.documentNumber), "document leaked");

      for (const id of [randomUUID(), "not-a-uuid"]) {
        const missing = await server.request(`/api/members/${id}`, { token: viewer.token });
        assert.equal(missing.status, 404, id);
        assert.equal(errorCode(missing.body), "MEMBER_NOT_FOUND");
      }
    });
  });


  describe("visibility", () => {
    test("circles are private by default; only the creator gets the invite link", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { visibility: undefined });
      assert.equal(circle.visibility, "PRIVATE");
      const code = inviteOf(circle);
      assert.ok(code.length >= 43, "invite code too short");
      assert.ok(circle.inviteUrl?.startsWith(`${FRONTEND_URL}/es/circles/${circle.id}?invite=`));

      const all = await server.request("/api/circles");
      assert.ok(!(all.body as { id: string }[]).some((c) => c.id === circle.id), "private circle listed");
    });

    test("a stranger can't tell a private circle exists; the invite link and members can see it", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 3 });
      const stranger = await member();

      for (const res of [
        await server.request(`/api/circles/${circle.id}`),
        await server.request(`/api/circles/${circle.id}`, { token: stranger.token }),
        await server.request(`/api/circles/${circle.id}?invite=wrong`, { token: stranger.token }),
        await joinWithoutInvite(circle.id, stranger.token, {}),
      ]) {
        assert.equal(res.status, 404);
        assert.equal(errorCode(res.body), "CIRCLE_NOT_FOUND");
      }

      const viaLink = await server.request(`/api/circles/${circle.id}?invite=${encodeURIComponent(inviteOf(circle))}`, { token: stranger.token });
      assert.equal(viaLink.status, 200);
      assert.equal((viaLink.body as CircleDto).inviteUrl, null, "invite link leaked to a non-creator");

      const joined = await join(circle.id, stranger.token, { invite: inviteOf(circle) });
      assert.equal(joined.status, 200, joined.text);
      // Now a member: no link needed, and it's in their own list.
      assert.equal((await server.request(`/api/circles/${circle.id}`, { token: stranger.token })).status, 200);
      const mine = await server.request("/api/users/me/circles", { token: stranger.token });
      assert.ok((mine.body as { id: string }[]).some((c) => c.id === circle.id));
    });

    test("an invalid token is refused, not treated as anonymous", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const res = await server.request(`/api/circles/${circle.id}`, { token: "not-a-jwt" });
      assert.equal(res.status, 401);
    });

    test("the creator can make it public, and rotating the code kills old links", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 4 });
      const oldCode = inviteOf(circle);
      const other = await member();

      // Only the creator: everyone else gets 404.
      const denied = await server.request(`/api/circles/${circle.id}/visibility`, { method: "PATCH", token: other.token, body: { visibility: "PUBLIC" } });
      assert.equal(denied.status, 404);
      assert.equal((await server.request(`/api/circles/${circle.id}/invite-code`, { method: "POST", token: other.token })).status, 404);

      const rotated = await server.request(`/api/circles/${circle.id}/invite-code`, { method: "POST", token: owner.token });
      assert.equal(rotated.status, 200, rotated.text);
      assert.notEqual(inviteOf(rotated.body as CircleDto), oldCode);
      assert.equal((await server.request(`/api/circles/${circle.id}?invite=${encodeURIComponent(oldCode)}`, { token: other.token })).status, 404);

      const made = await server.request(`/api/circles/${circle.id}/visibility`, { method: "PATCH", token: owner.token, body: { visibility: "PUBLIC" } });
      assert.equal(made.status, 200, made.text);
      assert.equal((made.body as CircleDto).visibility, "PUBLIC");
      const all = await server.request("/api/circles");
      assert.ok((all.body as { id: string }[]).some((c) => c.id === circle.id));
      assert.equal((await join(circle.id, other.token, {})).status, 200);
    });

    test("a member's profile hides private circles, and reviews from them, from people outside", async () => {
      const [owner, bob, stranger] = await Promise.all([member(), member(), member()]);
      const hidden = await createCircle(owner.token, { visibility: "PRIVATE", size: 3, name: `${PREFIX}Secreta ${randomInt(1e6)}` });
      assert.equal((await join(hidden.id, bob.token, { invite: inviteOf(hidden) })).status, 200);
      await db.insert(reviews).values({ authorId: owner.id, subjectId: bob.id, circleId: hidden.id, rating: 5, comment: "Cumplido" });

      // "Outside" the private circle, but sharing a public one with Bob, so Bob's profile is visible.
      const open = await createCircle(stranger.token, { size: 3 });
      assert.equal((await join(open.id, bob.token, {})).status, 200);

      const outside = (await server.request(`/api/members/${bob.id}`, { token: stranger.token })).body as MemberDto;
      assert.ok(!outside.circles.some((c) => c.id === hidden.id), "private circle listed to a stranger");
      assert.ok(!outside.reviews.some((r) => r.circleId === hidden.id), "review from a private circle shown to a stranger");
      assert.ok(!JSON.stringify(outside).includes(hidden.name), "private circle name leaked");

      const insider = (await server.request(`/api/members/${bob.id}`, { token: owner.token })).body as MemberDto;
      assert.ok(insider.circles.some((c) => c.id === hidden.id));
      assert.ok(insider.reviews.some((r) => r.circleId === hidden.id));
    });

    test("visibility can't change once the circle has started", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 2 });
      const bob = await member();
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      const res = await server.request(`/api/circles/${circle.id}/visibility`, { method: "PATCH", token: owner.token, body: { visibility: "PRIVATE" } });
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "CIRCLE_NOT_OPEN");
    });
  });

  describe("approval settings on create", () => {
    test("DELEGATES by default with the creator as approver; MAJORITY when asked; others → 400", async () => {
      const { token } = await member();
      const circle = await createCircle(token);
      assert.equal(circle.approvalMode, "DELEGATES");
      assert.equal(circle.seats[0]?.isApprover, true);

      const majority = await createCircle(token, { approvalMode: "MAJORITY" });
      assert.equal(majority.approvalMode, "MAJORITY");

      const bad = await server.request("/api/circles", { method: "POST", token, body: validCircle({ approvalMode: "CREATOR_ONLY" }) });
      assert.equal(bad.status, 400);
      assert.equal(errorCode(bad.body), "VALIDATION_ERROR");
    });
  });

  describe("semi-public circles", () => {
    test("joining a public circle without the creator's link → 403 APPLICATION_REQUIRED; with it → seated", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3 });
      const bob = await member();

      const direct = await joinWithoutInvite(circle.id, bob.token, {});
      assert.equal(direct.status, 403);
      assert.equal(errorCode(direct.body), "APPLICATION_REQUIRED");
      const wrong = await joinWithoutInvite(circle.id, bob.token, { invite: "wrong" });
      assert.equal(wrong.status, 403);
      assert.equal((await getCircle(circle.id)).seatsTaken, 1);

      const viaLink = await joinWithoutInvite(circle.id, bob.token, { invite: inviteOf(circle) });
      assert.equal(viaLink.status, 200, viaLink.text);
      assert.equal((await getCircle(circle.id)).seatsTaken, 2);
    });
  });

  describe("member profile access (GET /api/members/:id)", () => {
    test("visible to co-members and to members of a circle the user applied to; hidden from strangers", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const [bob, carol, stranger] = await Promise.all([member(), member(), member()]);
      await seated(circle.id, owner, bob);
      const carolApp = await applied(circle.id, carol);

      const memberProfile = (target: string, token: string) => server.request(`/api/members/${target}`, { token });
      assert.equal((await memberProfile(bob.id, owner.token)).status, 200);
      assert.equal((await memberProfile(carol.id, bob.token)).status, 200);
      for (const [target, viewer] of [
        [bob.id, stranger.token],
        [carol.id, stranger.token],
        [owner.id, carol.token],
      ] as const) {
        const res = await memberProfile(target, viewer);
        assert.equal(res.status, 404);
        assert.equal(errorCode(res.body), "MEMBER_NOT_FOUND");
      }

      await voteOn(circle.id, carolApp.id, owner.token, "REJECT");
      assert.equal((await memberProfile(carol.id, bob.token)).status, 404);
    });
  });

  describe("applications to private circles", () => {
    test("private circles take no applications: they are joined by invite link", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { visibility: "PRIVATE" });
      const bob = await member();
      const res = await applyTo(circle.id, bob.token);
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "CIRCLE_NOT_FOUND");
    });
  });

  describe("POST /:id/applications (apply)", () => {
    test("→ 201 PENDING with only the applicant's name, wallet and ICS", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const bob = await member({ name: "Bob Ruiz", score: 0.8734 });

      const res = await applyTo(circle.id, bob.token, { collateralValue: "500000", grantMode: "RECURRING" });
      assert.equal(res.status, 201, res.text);
      const application = res.body as ApplicationDto;
      assert.equal(application.status, "PENDING");
      assert.equal(application.decidedAt, null);
      assert.deepEqual(application.votes, { accept: 0, reject: 0 });
      assert.deepEqual(application.applicant, { fullName: `${PREFIX}Bob Ruiz`, walletAddress: bob.walletAddress, ics: 87.34 });
      assert.deepEqual(Object.keys(application).sort(), ["applicant", "createdAt", "decidedAt", "id", "status", "votes"]);
      assert.ok(!res.text.includes("@example.test") && !res.text.includes("+57"), "contact data leaked");

      const [row] = await db.select().from(circleApplications).where(eq(circleApplications.id, application.id));
      assert.equal(row?.collateralValue, 500000n);
      assert.equal(row?.grantMode, "RECURRING");
      const events = await db.select().from(auditEvents).where(eq(auditEvents.externalId, `application.created:${application.id}`));
      assert.equal(events.length, 1);
    });

    test("without a token → 401; without approved KYC → 403 KYC_REQUIRED", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      assert.equal((await server.request(`/api/circles/${circle.id}/applications`, { method: "POST", body: {} })).status, 401);
      const { token } = await member({ kyc: false });
      const res = await applyTo(circle.id, token);
      assert.equal(res.status, 403);
      assert.equal(errorCode(res.body), "KYC_REQUIRED");
    });

    test("invalid body → 400 VALIDATION_ERROR", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const bob = await member();
      for (const body of [{ payoutRound: 1 }, { collateralValue: "1.5" }, { grantMode: "ALWAYS" }, { status: "ACCEPTED" }]) {
        const res = await applyTo(circle.id, bob.token, body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(errorCode(res.body), "VALIDATION_ERROR");
      }
    });

    test("unknown or malformed circle → 404", async () => {
      const bob = await member();
      for (const id of [randomUUID(), "not-a-uuid"]) {
        const res = await applyTo(id, bob.token);
        assert.equal(res.status, 404, id);
        assert.equal(errorCode(res.body), "CIRCLE_NOT_FOUND");
      }
    });

    test("members, a second pending application and users without a wallet are refused", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);

      const own = await applyTo(circle.id, owner.token);
      assert.equal(own.status, 409);
      assert.equal(errorCode(own.body), "ALREADY_MEMBER");

      const bob = await member();
      await applied(circle.id, bob);
      const again = await applyTo(circle.id, bob.token);
      assert.equal(again.status, 409);
      assert.equal(errorCode(again.body), "APPLICATION_PENDING");

      const noWallet = await member({ wallet: false });
      const res = await applyTo(circle.id, noWallet.token);
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "WALLET_REQUIRED");
    });

    test("a rejected applicant may apply again", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const bob = await member();
      const first = await applied(circle.id, bob);
      assert.equal((await voteOn(circle.id, first.id, owner.token, "REJECT")).status, 200);
      const second = await applyTo(circle.id, bob.token);
      assert.equal(second.status, 201);
    });
  });

  describe("GET /:id/applications (list)", () => {
    test("members see applications, filtered by status; others get 404", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const bob = await member();
      const carol = await member();
      const bobApp = await applied(circle.id, bob);
      const carolApp = await applied(circle.id, carol);
      await voteOn(circle.id, carolApp.id, owner.token, "REJECT");

      const all = await server.request(`/api/circles/${circle.id}/applications`, { token: owner.token });
      assert.equal(all.status, 200);
      assert.deepEqual(
        (all.body as ApplicationDto[]).map((a) => a.id),
        [bobApp.id, carolApp.id],
      );

      const pending = await server.request(`/api/circles/${circle.id}/applications?status=PENDING`, { token: owner.token });
      assert.deepEqual(
        (pending.body as ApplicationDto[]).map((a) => a.id),
        [bobApp.id],
      );

      // Applicants are not members yet: they can't read the list.
      const outsider = await server.request(`/api/circles/${circle.id}/applications`, { token: bob.token });
      assert.equal(outsider.status, 404);
      assert.equal(errorCode(outsider.body), "CIRCLE_NOT_FOUND");
    });

    test("without a token → 401; bad status → 400", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      assert.equal((await server.request(`/api/circles/${circle.id}/applications`)).status, 401);
      const bad = await server.request(`/api/circles/${circle.id}/applications?status=DONE`, { token: owner.token });
      assert.equal(bad.status, 400);
      assert.equal(errorCode(bad.body), "VALIDATION_ERROR");
    });
  });

  describe("POST /:id/applications/:applicationId/votes (DELEGATES)", () => {
    test("the creator's first decision accepts and seats the applicant in the next free round", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const bob = await member();
      const application = await applied(circle.id, bob, { collateralValue: "500000", grantMode: "RECURRING" });

      const res = await voteOn(circle.id, application.id, owner.token, "ACCEPT");
      assert.equal(res.status, 200, res.text);
      const decided = res.body as ApplicationDto;
      assert.equal(decided.status, "ACCEPTED");
      assert.ok(decided.decidedAt);
      assert.deepEqual(decided.votes, { accept: 1, reject: 0 });

      const after = await getCircle(circle.id);
      assert.equal(after.seatsTaken, 2);
      const seat = after.seats.find((s) => s.payoutRound === 2);
      assert.deepEqual(seat?.collateral, { value: "500000", assetCode: "COP", assetScale: 2 });
      assert.equal(seat?.grantMode, "RECURRING");
      assert.equal(seat?.isApprover, false);

      const events = await db.select().from(auditEvents).where(eq(auditEvents.externalId, `application.accepted:${application.id}`));
      assert.equal(events.length, 1);
    });

    test("accepted applicants take the next free rounds", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const [bob, carol] = await Promise.all([member(), member()]);
      await seated(circle.id, owner, bob);
      await seated(circle.id, owner, carol);
      const rounds = (await getCircle(circle.id)).seats.map((s) => s.payoutRound).sort();
      assert.deepEqual(rounds, [1, 2, 3]);
    });

    test("rejecting closes the application without a seat", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const bob = await member();
      const application = await applied(circle.id, bob);
      const res = await voteOn(circle.id, application.id, owner.token, "REJECT");
      assert.equal(res.status, 200);
      assert.equal((res.body as ApplicationDto).status, "REJECTED");
      assert.equal((await getCircle(circle.id)).seatsTaken, 1);
    });

    test("members who aren't approvers → 403; non-members → 404; decided → 409", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const [bob, carol, dave] = await Promise.all([member(), member(), member()]);
      await seated(circle.id, owner, bob);
      const application = await applied(circle.id, carol);

      const notApprover = await voteOn(circle.id, application.id, bob.token, "ACCEPT");
      assert.equal(notApprover.status, 403);
      assert.equal(errorCode(notApprover.body), "NOT_APPROVER");

      const outsider = await voteOn(circle.id, application.id, dave.token, "ACCEPT");
      assert.equal(outsider.status, 404);
      assert.equal(errorCode(outsider.body), "APPLICATION_NOT_FOUND");

      await voteOn(circle.id, application.id, owner.token, "REJECT");
      const decided = await voteOn(circle.id, application.id, owner.token, "ACCEPT");
      assert.equal(decided.status, 409);
      assert.equal(errorCode(decided.body), "APPLICATION_DECIDED");
    });

    test("unknown, malformed or other-circle application → 404; bad decision → 400; no token → 401", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const other = await createCircle(owner.token);
      const bob = await member();
      const elsewhere = await applied(other.id, bob);

      for (const appId of [randomUUID(), "nope", elsewhere.id]) {
        const res = await voteOn(circle.id, appId, owner.token, "ACCEPT");
        assert.equal(res.status, 404, appId);
        assert.equal(errorCode(res.body), "APPLICATION_NOT_FOUND");
      }
      const bad = await server.request(`/api/circles/${other.id}/applications/${elsewhere.id}/votes`, {
        method: "POST",
        token: owner.token,
        body: { decision: "MAYBE" },
      });
      assert.equal(bad.status, 400);
      const anon = await server.request(`/api/circles/${other.id}/applications/${elsewhere.id}/votes`, {
        method: "POST",
        body: { decision: "ACCEPT" },
      });
      assert.equal(anon.status, 401);
    });
  });

  describe("POST /:id/applications/:applicationId/votes (MAJORITY)", () => {
    test("accepts once more than half accept; rejects once acceptance is impossible", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 6, approvalMode: "MAJORITY" });
      const [a, b, c, d] = await Promise.all([member(), member(), member(), member()]);

      // 1 member: one accept is a majority.
      await seated(circle.id, owner, a);

      // 2 members: one accept is not enough (2 > 2 is false); the second settles it.
      const bApp = await applied(circle.id, b);
      const firstVote = await voteOn(circle.id, bApp.id, owner.token, "ACCEPT");
      assert.equal((firstVote.body as ApplicationDto).status, "PENDING");
      assert.deepEqual((firstVote.body as ApplicationDto).votes, { accept: 1, reject: 0 });
      const twice = await voteOn(circle.id, bApp.id, owner.token, "ACCEPT");
      assert.equal(twice.status, 409);
      assert.equal(errorCode(twice.body), "ALREADY_VOTED");
      const secondVote = await voteOn(circle.id, bApp.id, a.token, "ACCEPT");
      assert.equal((secondVote.body as ApplicationDto).status, "ACCEPTED");

      // 3 members: one reject keeps it open; the second (2 × 2 ≥ 3) rejects.
      const cApp = await applied(circle.id, c);
      assert.equal(((await voteOn(circle.id, cApp.id, owner.token, "REJECT")).body as ApplicationDto).status, "PENDING");
      assert.equal(((await voteOn(circle.id, cApp.id, a.token, "REJECT")).body as ApplicationDto).status, "REJECTED");

      // Any member may vote, not just approvers.
      const dApp = await applied(circle.id, d);
      await voteOn(circle.id, dApp.id, b.token, "ACCEPT");
      assert.equal(((await voteOn(circle.id, dApp.id, a.token, "ACCEPT")).body as ApplicationDto).status, "ACCEPTED");
      assert.equal((await getCircle(circle.id)).seatsTaken, 4);
    });
  });

  describe("filling the circle", () => {
    test("accepting the last seat starts it: rounds scheduled, round 1 contributions pending, other applications rejected", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3 });
      const [bob, carol, dave] = await Promise.all([member(), member(), member()]);
      await seated(circle.id, owner, bob, {});
      const daveApp = await applied(circle.id, dave);
      const last = await seated(circle.id, owner, carol, {});
      assert.equal(last.status, "ACCEPTED");

      const started = await getCircle(circle.id);
      assert.equal(started.status, "ACTIVE");
      assert.ok(started.startedAt);
      assert.equal(started.currentRound, 1);
      assert.deepEqual(
        started.rounds.map((r) => r.state),
        ["COLLECTING", "UPCOMING", "UPCOMING"],
      );

      // Round n pays out to the member who holds payout round n.
      for (const round of started.rounds) {
        const seat = started.seats.find((s) => s.memberId === round.beneficiaryMemberId);
        assert.equal(seat?.payoutRound, round.number);
      }

      // Weekly circle: deadlines are one week apart, starting one week after the start.
      const start = Date.parse(started.startedAt ?? "");
      started.rounds.forEach((r) => assert.equal(Date.parse(r.deadline) - start, r.number * 7 * 86_400_000));

      // Everyone pays round 1, the beneficiary included.
      const first = started.rounds[0];
      assert.equal(first?.contributions.length, 3);
      assert.ok(first?.contributions.every((c) => c.status === "PENDING"));
      assert.ok(started.rounds.slice(1).every((r) => r.contributions.length === 0));

      const roundRows = await db.select().from(rounds).where(eq(rounds.circleId, circle.id)).orderBy(asc(rounds.number));
      const rows = await db.select().from(contributions).where(eq(contributions.roundId, roundRows[0]?.id ?? ""));
      for (const c of rows) {
        assert.equal(c.value, 2000000n);
        assert.equal(c.assetCode, "COP");
        assert.equal(c.idempotencyKey, `contribution:${c.roundId}:${c.memberId}`);
        assert.equal(c.completedAt, null);
      }
      const events = await db.select().from(auditEvents).where(eq(auditEvents.externalId, `circle.started:${circle.id}`));
      assert.equal(events.length, 1);
      assert.equal(events[0]?.eventType, "circle.started");

      // The pending application lost its chance when the circle filled.
      const [daveRow] = await db.select().from(circleApplications).where(eq(circleApplications.id, daveApp.id));
      assert.equal(daveRow?.status, "REJECTED");

      const late = await member();
      const closed = await applyTo(circle.id, late.token);
      assert.equal(closed.status, 409);
      assert.equal(errorCode(closed.body), "CIRCLE_NOT_OPEN");
    });

    test("two acceptances racing for the last seat: one wins, the circle starts once", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 2 });
      const [bob, carol] = await Promise.all([member(), member()]);
      const apps = [await applied(circle.id, bob), await applied(circle.id, carol)];

      const results = await Promise.all(apps.map((a) => voteOn(circle.id, a.id, owner.token, "ACCEPT")));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);

      const seats = await db.select().from(circleMembers).where(eq(circleMembers.circleId, circle.id));
      assert.equal(seats.length, 2);
      const roundRows = await db.select().from(rounds).where(eq(rounds.circleId, circle.id));
      assert.equal(roundRows.length, 2);
      const [row] = await db.select().from(circles).where(and(eq(circles.id, circle.id), eq(circles.status, "ACTIVE")));
      assert.ok(row, "circle did not start");
    });
  });

  describe("PUT /:id/approvers", () => {
    test("the creator delegates; delegates can decide; an empty list keeps only the creator", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 5 });
      const [bob, carol, dave] = await Promise.all([member(), member(), member()]);
      await seated(circle.id, owner, bob);
      const bobSeat = (await getCircle(circle.id)).seats.find((s) => !s.isApprover);
      assert.ok(bobSeat);

      const res = await server.request(`/api/circles/${circle.id}/approvers`, {
        method: "PUT",
        token: owner.token,
        body: { memberIds: [bobSeat.memberId] },
      });
      assert.equal(res.status, 200, res.text);
      assert.ok((res.body as CircleDto).seats.every((s) => s.isApprover));

      const carolApp = await applied(circle.id, carol);
      const byDelegate = await voteOn(circle.id, carolApp.id, bob.token, "ACCEPT");
      assert.equal((byDelegate.body as ApplicationDto).status, "ACCEPTED");

      const cleared = await server.request(`/api/circles/${circle.id}/approvers`, {
        method: "PUT",
        token: owner.token,
        body: { memberIds: [] },
      });
      const approvers = (cleared.body as CircleDto).seats.filter((s) => s.isApprover);
      assert.equal(approvers.length, 1);
      const daveApp = await applied(circle.id, dave);
      assert.equal((await voteOn(circle.id, daveApp.id, bob.token, "ACCEPT")).status, 403);
    });

    test("non-creators → 403; outsiders → 404; non-member ids → 422; bad body → 400; no token → 401", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const [bob, eve] = await Promise.all([member(), member()]);
      await seated(circle.id, owner, bob);
      const put = (token: string | undefined, body: unknown) =>
        server.request(`/api/circles/${circle.id}/approvers`, { method: "PUT", ...(token ? { token } : {}), body });

      const notCreator = await put(bob.token, { memberIds: [] });
      assert.equal(notCreator.status, 403);
      assert.equal(errorCode(notCreator.body), "NOT_CREATOR");

      const outsider = await put(eve.token, { memberIds: [] });
      assert.equal(outsider.status, 404);

      const stranger = await put(owner.token, { memberIds: [randomUUID()] });
      assert.equal(stranger.status, 422);
      assert.equal(errorCode(stranger.body), "NOT_MEMBERS");

      assert.equal((await put(owner.token, { memberIds: ["x"] })).status, 400);
      assert.equal((await put(owner.token, {})).status, 400);
      assert.equal((await put(undefined, { memberIds: [] })).status, 401);
    });
  });

  describe("public profile access (GET /users/:id/public)", () => {
    test("members see their applicants and co-members; strangers and decided applicants are hidden", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const [bob, carol, stranger] = await Promise.all([member(), member({ score: 0.5 }), member()]);
      await seated(circle.id, owner, bob);
      const carolApp = await applied(circle.id, carol);

      // Members see a pending applicant, by id and by wallet.
      const byId = await publicProfile(carol.id, bob.token);
      assert.equal(byId.status, 200);
      assert.deepEqual(byId.body, { fullName: `${PREFIX}Ana María Gómez`, walletAddress: carol.walletAddress, ics: 50 });
      const byWallet = await server.request(`/api/users/public?walletAddress=${encodeURIComponent(carol.walletAddress ?? "")}`, {
        token: owner.token,
      });
      assert.equal(byWallet.status, 200);

      // Co-members see each other; everyone sees themselves.
      assert.equal((await publicProfile(owner.id, bob.token)).status, 200);
      assert.equal((await publicProfile(stranger.id, stranger.token)).status, 200);

      // Strangers see nobody, and the applicant can't browse the members.
      for (const [target, viewer] of [
        [carol.id, stranger.token],
        [owner.id, stranger.token],
        [owner.id, carol.token],
      ] as const) {
        const res = await publicProfile(target, viewer);
        assert.equal(res.status, 404);
        assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
      }

      // Once rejected, the applicant is no longer visible.
      await voteOn(circle.id, carolApp.id, owner.token, "REJECT");
      assert.equal((await publicProfile(carol.id, bob.token)).status, 404);
    });
  });

  describe("scores, reminders and the scheduler tick", () => {
    // A weekly circle of two, started: round 1 collects until `deadline`; round 2 ends a week later,
    // so round 1's penalty time is 5 days before that: deadline + 2 days.
    async function startedCircle(options: { bobScore?: number } = {}) {
      const owner = await member();
      const bob = await member(options.bobScore === undefined ? {} : { score: options.bobScore });
      const circle = await createCircle(owner.token, { size: 2 });
      await seated(circle.id, owner, bob);
      const [round1] = await db.select().from(rounds).where(and(eq(rounds.circleId, circle.id), eq(rounds.number, 1)));
      assert.ok(round1);
      const seats = await db
        .select({ id: circleMembers.id, userId: circleMembers.userId })
        .from(circleMembers)
        .where(eq(circleMembers.circleId, circle.id));
      const contributionOf = async (m: Member) => {
        const seat = seats.find((s) => s.userId === m.id);
        const [c] = await db
          .select()
          .from(contributions)
          .where(and(eq(contributions.roundId, round1.id), eq(contributions.memberId, seat?.id ?? "")));
        assert.ok(c);
        return c;
      };
      return { circle, owner, bob, deadline: round1.deadline, contributionOf };
    }

    const DAY = 86_400_000;
    const at = (base: Date, days: number) => new Date(base.getTime() + days * DAY);
    const complete = (contributionId: string, completedAt: Date) =>
      db.update(contributions).set({ status: "COMPLETED", completedAt }).where(eq(contributions.id, contributionId));
    const failUnpaid = (contributionId: string) =>
      db.update(contributions).set({ status: "FAILED", failureCode: "DEADLINE_MISSED" }).where(eq(contributions.id, contributionId));

    async function scoreOf(m: Member): Promise<number | null> {
      const [u] = await db.select({ walletId: users.opWallet }).from(users).where(eq(users.id, m.id));
      const [p] = await db.select().from(creditProfiles).where(eq(creditProfiles.walletId, u?.walletId ?? ""));
      return p ? scoreFromFraction(p.internalCreditScore) : null;
    }

    const events = (externalId: string) => db.select().from(auditEvents).where(eq(auditEvents.externalId, externalId));

    test("a payment on time adds the bonus once; a new member starts from the initial score", async () => {
      const { circle, owner, bob, deadline, contributionOf } = await startedCircle();
      const ownerPayment = await contributionOf(owner);
      await complete(ownerPayment.id, at(deadline, -0.5));

      const scoring = createScoring({ db });
      assert.equal(await scoring.scoreCircle(circle.id, at(deadline, 0.1)), 1);
      assert.equal(await scoreOf(owner), 55);
      // Bob hasn't paid but his penalty time hasn't come: nothing yet.
      assert.equal(await scoreOf(bob), null);

      assert.equal(await scoring.scoreCircle(circle.id, at(deadline, 0.2)), 0);
      assert.equal(await scoreOf(owner), 55);
      const recorded = await events(`score.on_time:${ownerPayment.id}`);
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0]?.eventType, "score.on_time");
    });

    test("unpaid at the penalty time counts as missed; paying afterwards re-scores it as late", async () => {
      const { circle, bob, deadline, contributionOf } = await startedCircle({ bobScore: 0.9 });
      const bobPayment = await contributionOf(bob);
      await failUnpaid(bobPayment.id);
      const scoring = createScoring({ db });

      await scoring.scoreCircle(circle.id, at(deadline, 1));
      assert.equal(await scoreOf(bob), 90, "penalised before the penalty time");

      await scoring.scoreCircle(circle.id, at(deadline, 2));
      assert.equal(await scoreOf(bob), 75);
      await scoring.scoreCircle(circle.id, at(deadline, 2.5));
      assert.equal(await scoreOf(bob), 75, "missed applied twice");

      await complete(bobPayment.id, at(deadline, 3));
      await scoring.scoreCircle(circle.id, at(deadline, 3));
      assert.equal(await scoreOf(bob), 86, "late should replace missed: 90 − 4");
      await scoring.scoreCircle(circle.id, at(deadline, 4));
      assert.equal(await scoreOf(bob), 86);

      const [missed] = await events(`score.missed:${bobPayment.id}`);
      const [late] = await events(`score.late:${bobPayment.id}`);
      const [bobUser] = await db.select({ walletId: users.opWallet }).from(users).where(eq(users.id, bob.id));
      assert.equal(missed?.walletId, bobUser?.walletId);
      assert.equal(late?.walletId, bobUser?.walletId);
    });

    test("members without a wallet are skipped, not failed", async () => {
      const { circle, bob, deadline, contributionOf } = await startedCircle();
      await db.update(users).set({ opWallet: null }).where(eq(users.id, bob.id));
      const bobPayment = await contributionOf(bob);
      assert.equal(await createScoring({ db }).scoreCircle(circle.id, at(deadline, 3)), 1, "only the owner's miss is scored");
      assert.equal((await events(`score.missed:${bobPayment.id}`)).length, 0);
    });

    test("reminders: due soon, due today and late, by email and WhatsApp, once each, only to who hasn't paid", async () => {
      const { circle, owner, deadline, contributionOf } = await startedCircle();
      const sent: PaymentReminder[] = [];
      const reminders = createReminders({ db, sender: { send: async (n) => void ("contributionId" in n && sent.push(n)) } });

      assert.equal(await reminders.remindCircle(circle.id, at(deadline, -4)), 0);

      assert.equal(await reminders.remindCircle(circle.id, at(deadline, -2)), 4);
      assert.deepEqual([...new Set(sent.map((n) => n.kind))], ["DUE_SOON"]);
      assert.deepEqual(sent.map((n) => n.channel).sort(), ["EMAIL", "EMAIL", "WHATSAPP", "WHATSAPP"]);
      assert.ok(sent.every((n) => n.circleName === circle.name && n.amount.value === "2000000" && n.deadline.getTime() === deadline.getTime()));
      assert.ok(sent.some((n) => n.to === `${owner.id}@example.test`));
      assert.equal(await reminders.remindCircle(circle.id, at(deadline, -1.5)), 0, "due soon sent twice");

      assert.equal(await reminders.remindCircle(circle.id, at(deadline, -0.5)), 4);
      assert.ok(sent.slice(4).every((n) => n.kind === "DUE_TODAY"));

      const ownerPayment = await contributionOf(owner);
      await complete(ownerPayment.id, at(deadline, -0.2));
      sent.length = 0;
      assert.equal(await reminders.remindCircle(circle.id, at(deadline, 1)), 2);
      assert.ok(sent.every((n) => n.kind === "LATE" && n.contributionId !== ownerPayment.id));

      // After the penalty time the score speaks; no more reminders.
      assert.equal(await reminders.remindCircle(circle.id, at(deadline, 2)), 0);

      // Audit rows identify the reminder only: no email or phone.
      const rows = await db.select().from(auditEvents).where(like(auditEvents.externalId, `notification.sent:%:${ownerPayment.id}:%`));
      assert.equal(rows.length, 4);
      assert.ok(rows.every((r) => !r.externalId?.includes("@") && !r.externalId?.includes("+57")));
    });

    test("a reminder that fails to send is retried on the next run", async () => {
      const { circle, deadline } = await startedCircle();
      let failures = 1;
      const sent: Notification[] = [];
      const reminders = createReminders({
        db,
        sender: {
          send: async (n) => {
            if (failures-- > 0) throw new Error("provider down");
            sent.push(n);
          },
        },
      });
      assert.equal(await reminders.remindCircle(circle.id, at(deadline, -2)), 3);
      assert.equal(await reminders.remindCircle(circle.id, at(deadline, -2)), 1);
      assert.equal(await reminders.remindCircle(circle.id, at(deadline, -2)), 0);
      assert.equal(sent.length, 4);
    });

    test("the tick runs the cycle for active real-time circles only, and survives one circle failing", async () => {
      const { circle: running } = await startedCircle();
      const { circle: onClock, owner } = await startedCircle();
      const owner2 = await member();
      const waiting = await createCircle(owner2.token, { size: 3 });
      const [clock] = await db
        .insert(testClocks)
        .values({ name: `${PREFIX}clock`, ownerUserId: owner.id, frozenTime: new Date() })
        .returning({ id: testClocks.id });
      await db.update(circles).set({ testClockId: clock?.id ?? null }).where(eq(circles.id, onClock.id));

      const now = new Date("2026-05-01T00:00:00Z");
      const seen: string[] = [];
      const tick = createCircleTick({
        db,
        now: () => now,
        notices: [{ retryRecent: async () => 0 }],
        cycle: {
          advanceCircle: async (id, t) => {
            assert.equal(t.getTime(), now.getTime());
            seen.push(id);
            if (id === running.id) throw new Error("boom");
          },
        },
      });
      const result = await tick.run();

      assert.ok(seen.includes(running.id));
      assert.ok(!seen.includes(onClock.id), "test-clock circle ticked in real time");
      assert.ok(!seen.includes(waiting.id), "open circle ticked");
      assert.equal(result.circles, seen.length);
      assert.ok(result.failed >= 1);
    });
  });

  describe("application emails", () => {
    const sentFor = (applicationId: string) =>
      outbox.filter((n): n is Exclude<Notification, PaymentReminder> => "applicationId" in n && n.applicationId === applicationId);
    const emailOf = (m: Member) => `${m.id}@example.test`;

    test("DELEGATES: applying emails the creator and the delegates; one accepting tells the others who accepted whom", async () => {
      const owner = await member({ name: "Olga Pérez" });
      const circle = await createCircle(owner.token, { size: 5 });
      const [bob, dave] = await Promise.all([member({ name: "Bob Ruiz" }), member({ name: "Dave Mora" })]);
      await seated(circle.id, owner, bob);
      await seated(circle.id, owner, dave);
      const bobSeat = (await getCircle(circle.id)).seats.find((s) => s.userId === bob.id);
      await server.request(`/api/circles/${circle.id}/approvers`, { method: "PUT", token: owner.token, body: { memberIds: [bobSeat?.memberId] } });

      const carol = await member({ name: "Carol Díaz" });
      const application = await applied(circle.id, carol);
      const received = sentFor(application.id);
      assert.deepEqual(received.map((n) => n.to).sort(), [emailOf(owner), emailOf(bob)].sort(), "only the deciders");
      for (const n of received) {
        assert.equal(n.kind, "APPLICATION_RECEIVED");
        assert.equal(n.channel, "EMAIL");
        assert.equal(n.circleId, circle.id);
        assert.equal(n.circleName, circle.name);
        assert.equal(n.applicantName, displayName(`${PREFIX}Carol Díaz`));
      }

      assert.equal((await voteOn(circle.id, application.id, bob.token, "ACCEPT")).status, 200);
      const accepted = sentFor(application.id).filter((n) => n.kind === "APPLICATION_ACCEPTED");
      assert.deepEqual(
        accepted.map((n) => n.to),
        [emailOf(owner)],
        "the acceptor, the newcomer and non-approvers aren't told",
      );
      const notice = accepted[0];
      assert.ok(notice && notice.kind === "APPLICATION_ACCEPTED");
      assert.equal(notice.acceptedByName, displayName(`${PREFIX}Bob Ruiz`));
      assert.equal(notice.applicantName, displayName(`${PREFIX}Carol Díaz`));
    });

    test("MAJORITY: every member is asked; the one whose vote settles it is named to the others", async () => {
      const owner = await member({ name: "Olga Pérez" });
      const circle = await createCircle(owner.token, { size: 4, approvalMode: "MAJORITY" });
      const ana = await member({ name: "Ana Gómez" });
      await seated(circle.id, owner, ana);

      const bob = await member({ name: "Bob Ruiz" });
      const application = await applied(circle.id, bob);
      assert.deepEqual(
        sentFor(application.id).map((n) => n.to).sort(),
        [emailOf(owner), emailOf(ana)].sort(),
      );

      await voteOn(circle.id, application.id, owner.token, "ACCEPT");
      assert.equal(sentFor(application.id).filter((n) => n.kind === "APPLICATION_ACCEPTED").length, 0, "told before it was settled");
      await voteOn(circle.id, application.id, ana.token, "ACCEPT");
      const accepted = sentFor(application.id).filter((n) => n.kind === "APPLICATION_ACCEPTED");
      assert.deepEqual(
        accepted.map((n) => n.to),
        [emailOf(owner)],
      );
      assert.equal(accepted[0]?.kind === "APPLICATION_ACCEPTED" && accepted[0].acceptedByName, displayName(`${PREFIX}Ana Gómez`));
    });

    test("a rejection sends no acceptance email; repeating a notice sends nothing new", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3 });
      const bob = await member();
      const application = await applied(circle.id, bob);
      assert.equal(sentFor(application.id).length, 1);
      assert.equal(await notices.received(application.id), 0, "sent twice");

      await voteOn(circle.id, application.id, owner.token, "REJECT");
      assert.equal(sentFor(application.id).length, 1);
      assert.equal(await notices.accepted(application.id), 0);
    });

    test("a failed email doesn't fail the application and is re-sent by the retry", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3 });
      const bob = await member();
      const since = new Date(Date.now() - 60_000);

      noticeFailures = 1;
      const res = await applyTo(circle.id, bob.token);
      assert.equal(res.status, 201, res.text);
      const application = res.body as ApplicationDto;
      assert.equal(sentFor(application.id).length, 0);

      assert.ok((await notices.retryRecent(since)) >= 1);
      assert.equal(sentFor(application.id).length, 1);
      assert.equal(await notices.received(application.id), 0);
    });
  });
  describe("circle invites: codes", () => {
    const invitesOf = (circleId: string, token: string, query = "") => server.request(`/api/circles/${circleId}/invites${query}`, { token });
    const makeInvite = (circleId: string, token: string, body: Record<string, unknown>) =>
      server.request(`/api/circles/${circleId}/invites`, { method: "POST", token, body });
    const revoke = (circleId: string, inviteId: string, token: string) =>
      server.request(`/api/circles/${circleId}/invites/${inviteId}`, { method: "DELETE", token });
    const tokenOf = (invite: InviteDto) => (invite.kind === "CODE" ? (new URL(invite.inviteUrl).searchParams.get("invite") ?? "") : "");
    const makeApprover = async (circleId: string, owner: Member, who: Member) => {
      const seat = (await getCircle(circleId, owner.token)).seats.find((s) => s.userId === who.id);
      const res = await server.request(`/api/circles/${circleId}/approvers`, { method: "PUT", token: owner.token, body: { memberIds: [seat?.memberId] } });
      assert.equal(res.status, 200, res.text);
    };

    test("a new circle has a standing code: the creator and approvers get the link, members and strangers don't", async () => {
      const [owner, bob, stranger] = await Promise.all([member(), member(), member()]);
      const circle = await createCircle(owner.token, { size: 4 });
      assert.ok(circle.inviteUrl, "no standing code");
      assert.deepEqual(circle.access, { canInvite: true, isCreator: true, isMember: true, canVote: true });

      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      const asMember = await getCircle(circle.id, bob.token);
      assert.equal(asMember.inviteUrl, null);
      assert.deepEqual(asMember.access, { canInvite: false, isCreator: false, isMember: true, canVote: false });
      assert.deepEqual((await getCircle(circle.id, stranger.token)).access, { canInvite: false, isCreator: false, isMember: false, canVote: false });

      await makeApprover(circle.id, owner, bob);
      const asApprover = await getCircle(circle.id, bob.token);
      assert.equal(asApprover.inviteUrl, circle.inviteUrl);
      assert.deepEqual(asApprover.access, { canInvite: true, isCreator: false, isMember: true, canVote: true });
    });

    test("under MAJORITY every member may vote; under DELEGATES only the creator and approvers", async () => {
      const [owner, bob] = await Promise.all([member(), member()]);
      const majority = await createCircle(owner.token, { size: 4, approvalMode: "MAJORITY" });
      assert.equal((await join(majority.id, bob.token)).status, 200);
      assert.deepEqual((await getCircle(majority.id, bob.token)).access, { canInvite: false, isCreator: false, isMember: true, canVote: true });
      const delegates = await createCircle(owner.token, { size: 4 });
      assert.equal((await join(delegates.id, bob.token)).status, 200);
      assert.equal((await getCircle(delegates.id, bob.token)).access.canVote, false);
      assert.equal((await getCircle(delegates.id, owner.token)).access.canVote, true);
      assert.equal((await getCircle(delegates.id)).access.canVote, false, "anonymous");
    });

    test("an approver makes a limited code; it counts uses and shows EXPIRED once spent", async () => {
      const [owner, bob, carol, dave] = await Promise.all([member(), member(), member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 5 });
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      await makeApprover(circle.id, owner, bob);

      const made = await makeInvite(circle.id, bob.token, { kind: "CODE", maxUses: 1, expiresInHours: 1 });
      assert.equal(made.status, 201, made.text);
      const [code] = made.body as CodeInviteDto[];
      assert.ok(code && code.kind === "CODE");
      assert.equal(code.status, "ACTIVE");
      assert.equal(code.uses, 0);
      assert.equal(code.maxUses, 1);
      assert.ok(code.expiresAt && new Date(code.expiresAt) > new Date());
      assert.equal(code.createdByName, displayName(`${PREFIX}Ana María Gómez`));

      assert.equal((await join(circle.id, carol.token, { invite: tokenOf(code) })).status, 200);
      const listed = (await invitesOf(circle.id, owner.token)).body as InviteDto[];
      const spent = listed.find((i) => i.id === code.id);
      assert.ok(spent && spent.kind === "CODE");
      assert.equal(spent.uses, 1);
      assert.equal(spent.status, "EXPIRED");
      // Spent: the private circle doesn't exist for the next holder of the link.
      assert.equal((await server.request(`/api/circles/${circle.id}?invite=${tokenOf(code)}`, { token: dave.token })).status, 404);
      assert.equal((await join(circle.id, dave.token, { invite: tokenOf(code) })).status, 404);
      assert.deepEqual(((await invitesOf(circle.id, owner.token, "?status=EXPIRED")).body as InviteDto[]).map((i) => i.id), [code.id]);
    });

    test("an expired code opens nothing: 404 for a private circle, APPLICATION_REQUIRED for a public one", async () => {
      const [owner, bob] = await Promise.all([member(), member()]);
      for (const visibility of ["PRIVATE", "PUBLIC"] as const) {
        const circle = await createCircle(owner.token, { visibility, size: 3 });
        const [code] = (await makeInvite(circle.id, owner.token, { kind: "CODE", expiresInHours: 1 })).body as CodeInviteDto[];
        assert.ok(code);
        await db.update(circleInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(circleInvites.id, code.id));
        const res = await join(circle.id, bob.token, { invite: tokenOf(code) });
        assert.equal(res.status, visibility === "PRIVATE" ? 404 : 403);
        assert.equal(errorCode(res.body), visibility === "PRIVATE" ? "CIRCLE_NOT_FOUND" : "APPLICATION_REQUIRED");
      }
    });

    test("rotating replaces the standing code and keeps limited ones; approvers may rotate", async () => {
      const [owner, bob, carol] = await Promise.all([member(), member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 4 });
      const oldStanding = inviteOf(circle);
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      await makeApprover(circle.id, owner, bob);
      const [limited] = (await makeInvite(circle.id, owner.token, { kind: "CODE", maxUses: 5 })).body as CodeInviteDto[];
      assert.ok(limited);

      const rotated = await server.request(`/api/circles/${circle.id}/invite-code`, { method: "POST", token: bob.token });
      assert.equal(rotated.status, 200, rotated.text);
      assert.notEqual(inviteOf(rotated.body as CircleDto), oldStanding);
      assert.equal((await server.request(`/api/circles/${circle.id}?invite=${encodeURIComponent(oldStanding)}`, { token: carol.token })).status, 404);
      assert.equal((await server.request(`/api/circles/${circle.id}?invite=${tokenOf(limited)}`, { token: carol.token })).status, 200);
      const statuses = new Map(((await invitesOf(circle.id, owner.token)).body as InviteDto[]).map((i) => [i.id, i.status]));
      assert.equal(statuses.get(limited.id), "ACTIVE");
      assert.equal([...statuses.values()].filter((st) => st === "REVOKED").length, 1, "exactly the old standing code is revoked");
    });

    test("only the creator and approvers manage invites; nothing can be made once the circle started", async () => {
      const [owner, bob, stranger] = await Promise.all([member(), member(), member()]);
      const circle = await createCircle(owner.token, { size: 2 });
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      const [code] = (await invitesOf(circle.id, owner.token)).body as InviteDto[];
      assert.ok(code);

      // The circle is full and ACTIVE: a plain member is told no, a stranger can't tell it exists.
      for (const [res, status, code2] of [
        [await makeInvite(circle.id, bob.token, { kind: "CODE" }), 403, "NOT_APPROVER"],
        [await invitesOf(circle.id, bob.token), 403, "NOT_APPROVER"],
        [await revoke(circle.id, code.id, bob.token), 403, "NOT_APPROVER"],
        [await makeInvite(circle.id, stranger.token, { kind: "CODE" }), 404, "CIRCLE_NOT_FOUND"],
        [await invitesOf(circle.id, stranger.token), 404, "CIRCLE_NOT_FOUND"],
        [await makeInvite(circle.id, owner.token, { kind: "CODE" }), 409, "CIRCLE_NOT_OPEN"],
        [await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: "x@example.test" }] }), 409, "CIRCLE_NOT_OPEN"],
      ] as const) {
        assert.equal(res.status, status, res.text);
        assert.equal(errorCode(res.body), code2);
      }
      // Listing and revoking still work for the creator after the start.
      assert.equal((await invitesOf(circle.id, owner.token)).status, 200);
      assert.equal((await revoke(circle.id, code.id, owner.token)).status, 200);
    });

    test("revoking kills the link; revoked, accepted, unknown and foreign invites can't be revoked", async () => {
      const [owner, bob] = await Promise.all([member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 3 });
      const other = await createCircle(owner.token, { size: 3 });
      const [code] = (await makeInvite(circle.id, owner.token, { kind: "CODE" })).body as CodeInviteDto[];
      assert.ok(code);

      const revoked = await revoke(circle.id, code.id, owner.token);
      assert.equal(revoked.status, 200, revoked.text);
      assert.equal((revoked.body as InviteDto).status, "REVOKED");
      assert.equal((await server.request(`/api/circles/${circle.id}?invite=${tokenOf(code)}`, { token: bob.token })).status, 404);

      const again = await revoke(circle.id, code.id, owner.token);
      assert.equal(again.status, 409);
      assert.equal(errorCode(again.body), "INVITE_NOT_ACTIVE");
      for (const res of [await revoke(circle.id, randomUUID(), owner.token), await revoke(other.id, code.id, owner.token)]) {
        assert.equal(res.status, 404);
        assert.equal(errorCode(res.body), "INVITE_NOT_FOUND");
      }
    });

    test("concurrent joins with one code stop at its use limit", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 6 });
      const [code] = (await makeInvite(circle.id, owner.token, { kind: "CODE", maxUses: 2 })).body as CodeInviteDto[];
      assert.ok(code);
      const joiners = await Promise.all([member(), member(), member()]);
      const results = await Promise.all(joiners.map((m) => join(circle.id, m.token, { invite: tokenOf(code) })));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 404]);
      const [row] = await db.select({ uses: circleInvites.uses }).from(circleInvites).where(eq(circleInvites.id, code.id));
      assert.equal(row?.uses, 2);
    });
  });

  describe("circle invites: direct", () => {
    const makeInvite = (circleId: string, token: string, body: Record<string, unknown>) =>
      server.request(`/api/circles/${circleId}/invites`, { method: "POST", token, body });
    const invitesOf = (circleId: string, token: string) => server.request(`/api/circles/${circleId}/invites`, { token });
    const mine = async (token: string) => (await server.request("/api/users/me/invitations", { token })).body as MyInvitationDto[];
    const emailOf = (m: Member) => `${m.id}@example.test`;
    const sentInvites = () => outbox.filter((n): n is CircleInvite => n.kind === "CIRCLE_INVITE");
    const tokenOf = (url: string) => new URL(url).searchParams.get("invite") ?? "";
    // The link only the invitee (and their email) holds, read from the DB.
    const directToken = async (inviteId: string) => {
      const [row] = await db.select({ token: circleInvites.token }).from(circleInvites).where(eq(circleInvites.id, inviteId));
      return row?.token ?? "";
    };

    test("inviting by user id and by email makes one invite and one email per person, with the link and the expiry", async () => {
      const owner = await member({ name: "Olga Pérez" });
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 5 });
      const [bob, carol] = await Promise.all([member({ name: "Bob Ruiz" }), member({ name: "Carol Díaz" })]);
      const nobody = `nobody-${randomUUID()}@example.test`;
      // Bob is visible to the owner (they share a circle); Carol is reached by email.
      const shared = await createCircle(owner.token, { size: 3 });
      assert.equal((await join(shared.id, bob.token, {})).status, 200);

      const before = sentInvites().length;
      const res = await makeInvite(circle.id, owner.token, {
        kind: "DIRECT",
        targets: [{ userId: bob.id }, { email: emailOf(carol).toUpperCase() }, { email: nobody }],
        expiresInDays: 3,
      });
      assert.equal(res.status, 201, res.text);
      const made = res.body as DirectInviteDto[];
      assert.equal(made.length, 3);
      for (const invite of made) {
        assert.equal(invite.kind, "DIRECT");
        assert.equal(invite.status, "ACTIVE");
        assert.ok(invite.expiresAt && new Date(invite.expiresAt).getTime() - Date.now() > 2.9 * 86_400_000);
        assert.equal(invite.createdByName, displayName(`${PREFIX}Olga Pérez`));
      }
      const byUser = made.find((i) => i.invitee.userId === bob.id);
      assert.deepEqual(byUser?.invitee, { userId: bob.id, displayName: displayName(`${PREFIX}Bob Ruiz`), email: null });
      const byEmail = made.find((i) => i.invitee.email === emailOf(carol));
      assert.deepEqual(byEmail?.invitee, { userId: carol.id, displayName: displayName(`${PREFIX}Carol Díaz`), email: emailOf(carol) });
      const unknown = made.find((i) => i.invitee.email === nobody);
      assert.deepEqual(unknown?.invitee, { userId: null, displayName: null, email: nobody });
      assert.ok(!res.text.includes("invite="), "a direct token leaked to the manager");

      const sent = sentInvites().slice(before);
      assert.deepEqual(sent.map((n) => n.to).sort(), [emailOf(bob), emailOf(carol), nobody].sort());
      for (const n of sent) {
        assert.equal(n.channel, "EMAIL");
        assert.equal(n.circleId, circle.id);
        assert.equal(n.inviterName, displayName(`${PREFIX}Olga Pérez`));
        assert.ok(n.inviteUrl.startsWith(`${FRONTEND_URL}/es/circles/${circle.id}?invite=`));
        assert.ok(n.expiresAt instanceof Date);
      }
    });

    test("the invitee sees the circle through the link, joins once, and the invite is accepted", async () => {
      const [owner, bob, dave] = await Promise.all([member(), member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 4 });
      const [invite] = (await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: `${bob.id}@example.test` }] })).body as DirectInviteDto[];
      assert.ok(invite);

      const pending = await mine(bob.token);
      assert.equal(pending.length, 1);
      assert.equal(pending[0]?.id, invite.id);
      assert.equal(pending[0]?.circle.id, circle.id);
      assert.equal(pending[0]?.invitedByName, displayName(`${PREFIX}Ana María Gómez`));
      const url = pending[0]?.inviteUrl ?? "";
      assert.equal(tokenOf(url), await directToken(invite.id));
      assert.deepEqual(await mine(dave.token), []);

      assert.equal((await server.request(`/api/circles/${circle.id}?invite=${tokenOf(url)}`, { token: bob.token })).status, 200);
      assert.equal((await join(circle.id, bob.token, { invite: tokenOf(url) })).status, 200);
      const listed = ((await invitesOf(circle.id, owner.token)).body as InviteDto[]).find((i) => i.id === invite.id);
      assert.equal(listed?.status, "ACCEPTED");
      const [row] = await db.select({ userId: circleInvites.userId, memberId: circleInvites.acceptedMemberId }).from(circleInvites).where(eq(circleInvites.id, invite.id));
      assert.equal(row?.userId, bob.id);
      assert.ok(row?.memberId, "seat not recorded");
      assert.deepEqual(await mine(bob.token), []);
      // Single use: the link is dead for everyone now.
      assert.equal((await server.request(`/api/circles/${circle.id}?invite=${tokenOf(url)}`, { token: dave.token })).status, 404);
      assert.equal((await join(circle.id, dave.token, { invite: tokenOf(url) })).status, 404);
    });

    test("a direct link shows the circle to anyone but only seats its addressee", async () => {
      const [owner, bob, carol] = await Promise.all([member(), member(), member()]);
      for (const visibility of ["PRIVATE", "PUBLIC"] as const) {
        const circle = await createCircle(owner.token, { visibility, size: 4 });
        const [invite] = (await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: `${bob.id}@example.test` }] })).body as DirectInviteDto[];
        assert.ok(invite);
        const token = await directToken(invite.id);
        // The emailed link works before signing in, so the invitee can read what they're joining.
        assert.equal((await server.request(`/api/circles/${circle.id}?invite=${token}`)).status, 200);
        assert.equal((await server.request(`/api/circles/${circle.id}?invite=${token}`, { token: carol.token })).status, 200);
        const res = await join(circle.id, carol.token, { invite: token });
        assert.equal(res.status, visibility === "PRIVATE" ? 404 : 403, res.text);
        assert.equal(errorCode(res.body), visibility === "PRIVATE" ? "CIRCLE_NOT_FOUND" : "APPLICATION_REQUIRED");
        assert.equal((await join(circle.id, bob.token, { invite: token })).status, 200);
      }
    });

    test("an invite to an email without an account is claimed by whoever signs up with it", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 3 });
      const email = `future-${randomUUID()}@example.test`;
      const [invite] = (await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: email.toUpperCase() }] })).body as DirectInviteDto[];
      assert.ok(invite);
      assert.equal(invite.invitee.userId, null);

      const newcomer = await member({ email });
      assert.deepEqual((await mine(newcomer.token)).map((i) => i.id), [invite.id]);
      const token = await directToken(invite.id);
      assert.equal((await join(circle.id, newcomer.token, { invite: token })).status, 200);
      const [row] = await db.select({ userId: circleInvites.userId, status: circleInvites.status }).from(circleInvites).where(eq(circleInvites.id, invite.id));
      assert.deepEqual(row, { userId: newcomer.id, status: "ACCEPTED" });
    });

    test("my invitations leave out expired and revoked ones", async () => {
      const [owner, bob] = await Promise.all([member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 4 });
      const target = { kind: "DIRECT", targets: [{ email: `${bob.id}@example.test` }] };
      const [first] = (await makeInvite(circle.id, owner.token, target)).body as DirectInviteDto[];
      assert.ok(first);
      assert.equal((await server.request(`/api/circles/${circle.id}/invites/${first.id}`, { method: "DELETE", token: owner.token })).status, 200);
      assert.deepEqual(await mine(bob.token), []);

      const [second] = (await makeInvite(circle.id, owner.token, target)).body as DirectInviteDto[];
      assert.ok(second, "re-inviting after a revocation");
      assert.equal((await mine(bob.token)).length, 1);
      await db.update(circleInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(circleInvites.id, second.id));
      assert.deepEqual(await mine(bob.token), []);
      const listed = ((await invitesOf(circle.id, owner.token)).body as InviteDto[]).find((i) => i.id === second.id);
      assert.equal(listed?.status, "EXPIRED");
    });

    test("members, people already invited and users the inviter can't see are refused", async () => {
      const [owner, bob, hidden] = await Promise.all([member(), member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 4 });
      assert.equal((await join(circle.id, bob.token, {})).status, 200);
      const carolEmail = `carol-${randomUUID()}@example.test`;
      assert.equal((await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: carolEmail }] })).status, 201);

      for (const [body, status, code] of [
        [{ kind: "DIRECT", targets: [{ userId: bob.id }] }, 409, "ALREADY_MEMBER"],
        [{ kind: "DIRECT", targets: [{ email: `${bob.id}@example.test` }] }, 409, "ALREADY_MEMBER"],
        [{ kind: "DIRECT", targets: [{ email: carolEmail }] }, 409, "INVITE_PENDING"],
        [{ kind: "DIRECT", targets: [{ userId: hidden.id }] }, 404, "PROFILE_NOT_FOUND"],
      ] as const) {
        const res = await makeInvite(circle.id, owner.token, body);
        assert.equal(res.status, status, res.text);
        assert.equal(errorCode(res.body), code);
      }
      // Nothing half-made: the refused requests left no invite behind.
      const listed = (await invitesOf(circle.id, owner.token)).body as InviteDto[];
      assert.equal(listed.filter((i) => i.kind === "DIRECT").length, 1);
    });

    test("the same person named twice is invited once", async () => {
      const [owner, bob] = await Promise.all([member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 4 });
      const shared = await createCircle(owner.token, { size: 3 });
      assert.equal((await join(shared.id, bob.token, {})).status, 200);
      const res = await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ userId: bob.id }, { email: `${bob.id}@example.test` }] });
      assert.equal(res.status, 201, res.text);
      assert.equal((res.body as InviteDto[]).length, 1);
    });

    test("a failed invite email doesn't fail the request and is re-sent by the retry, once", async () => {
      const [owner, bob] = await Promise.all([member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 3 });
      const since = new Date(Date.now() - 60_000);
      const before = sentInvites().length;

      noticeFailures = 1;
      const res = await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: `${bob.id}@example.test` }] });
      assert.equal(res.status, 201, res.text);
      assert.equal(sentInvites().length, before);

      assert.ok((await inviteNotices.retryRecent(since)) >= 1);
      assert.equal(sentInvites().length, before + 1);
      assert.equal(await inviteNotices.retryRecent(since), 0, "sent twice");
    });

    test("managers see a pending invitee's profile and the invitee sees the inviter's; strangers see neither", async () => {
      const [owner, bob, stranger] = await Promise.all([member(), member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 3 });
      assert.equal((await publicProfile(bob.id, owner.token)).status, 404);
      assert.equal((await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: `${bob.id}@example.test` }] })).status, 201);
      assert.equal((await publicProfile(bob.id, owner.token)).status, 200);
      assert.equal((await publicProfile(owner.id, bob.token)).status, 200);
      assert.equal((await publicProfile(bob.id, stranger.token)).status, 404);
    });

    test("audit rows name invites by id only", async () => {
      const [owner, bob] = await Promise.all([member(), member()]);
      const circle = await createCircle(owner.token, { visibility: "PRIVATE", size: 3 });
      const [invite] = (await makeInvite(circle.id, owner.token, { kind: "DIRECT", targets: [{ email: `${bob.id}@example.test` }] })).body as DirectInviteDto[];
      assert.ok(invite);
      const rows = await db.select({ eventType: auditEvents.eventType, externalId: auditEvents.externalId }).from(auditEvents).where(like(auditEvents.externalId, `%${invite.id}%`));
      assert.deepEqual(
        rows.map((r) => r.externalId).sort(),
        [`invite.created:${invite.id}`, `notification.sent:CIRCLE_INVITE:${invite.id}:EMAIL`],
      );
      assert.ok(rows.every((r) => !(r.externalId ?? "").includes("@")));
    });
  });
});
