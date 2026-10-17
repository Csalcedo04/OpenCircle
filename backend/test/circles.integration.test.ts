import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import {
  applicationVotes,
  auditEvents,
  circleApplications,
  circleMembers,
  circles,
  contributions,
  creditProfiles,
  reviews,
  rounds,
  users,
  wallets,
} from "../src/db/schema";
import type { Services } from "../src/routes";
import { createCircleService, displayName, type CircleDto } from "../src/services/circle.service";
import { createApplicationService, type ApplicationDto } from "../src/services/circles/application.service";
import { createUserService } from "../src/services/user.service";
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

let db: Db;
let server: TestServer;
let auth: TestAuth;
const createdUserIds: string[] = [];
const approved = new Set<string>();

async function deleteTestData(): Promise<void> {
  const userFilter = createdUserIds.length > 0 ? inArray(circles.createdBy, createdUserIds) : undefined;
  const testCircles = await db
    .select({ id: circles.id })
    .from(circles)
    .where(or(like(circles.name, `${PREFIX}%`), userFilter));
  const circleIds = testCircles.map((c) => c.id);

  // FK order: votes → applications → contributions → rounds → seats → reviews → circles →
  // audit events → users → wallets; nothing cascades.
  if (circleIds.length > 0) {
    const appIds = (
      await db.select({ id: circleApplications.id }).from(circleApplications).where(inArray(circleApplications.circleId, circleIds))
    ).map((a) => a.id);
    if (appIds.length > 0) await db.delete(applicationVotes).where(inArray(applicationVotes.applicationId, appIds));
    await db.delete(circleApplications).where(inArray(circleApplications.circleId, circleIds));
    const roundIds = (await db.select({ id: rounds.id }).from(rounds).where(inArray(rounds.circleId, circleIds))).map((r) => r.id);
    if (roundIds.length > 0) await db.delete(contributions).where(inArray(contributions.roundId, roundIds));
    await db.delete(rounds).where(inArray(rounds.circleId, circleIds));
    await db.delete(circleMembers).where(inArray(circleMembers.circleId, circleIds));
    await db.delete(reviews).where(inArray(reviews.circleId, circleIds));
    await db.delete(circles).where(inArray(circles.id, circleIds));
  }
  // Pot and member wallets all live under the suite's host.
  const testWallets = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `https://${POOL_HOST}/%`))).map(
    (w) => w.id,
  );
  if (testWallets.length > 0) await db.delete(auditEvents).where(inArray(auditEvents.walletId, testWallets));
  await db.delete(users).where(or(like(users.fullName, `${PREFIX}%`), createdUserIds.length > 0 ? inArray(users.id, createdUserIds) : undefined));
  if (testWallets.length > 0) await db.delete(wallets).where(inArray(wallets.id, testWallets));
}

interface Member {
  id: string;
  token: string;
  walletAddress: string | null;
}

// A user with a profile and a linked wallet; KYC-approved unless told otherwise (KYC itself is faked here).
async function member(options: { kyc?: boolean; name?: string; wallet?: boolean; score?: number } = {}): Promise<Member> {
  const id = randomUUID();
  createdUserIds.push(id);
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
    email: `${id}@example.test`,
    documentType: "cc",
    documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
    nationality: "CO",
    fullName: `${PREFIX}${options.name ?? "Ana María Gómez"}`,
    phone: "+573001112233",
    opWallet: walletId,
  });
  if (options.kyc ?? true) approved.add(id);
  return { id, token: await auth.token(id), walletAddress };
}

// 3 rounds of 20.000 COP per member by default: goal = contribution × size × 3.
const validCircle = (overrides: Record<string, unknown> = {}) => {
  const size = typeof overrides.size === "number" ? overrides.size : 3;
  return {
    name: `${PREFIX}Natillera Laureles`,
    city: "Medellín",
    contributionValue: "2000000",
    goalValue: String(2_000_000n * BigInt(size) * 3n),
    size,
    roundLengthDays: 7,
    payoutRound: 1,
    ...overrides,
  };
};

async function createCircle(token: string, overrides: Record<string, unknown> = {}): Promise<CircleDto> {
  const res = await server.request("/api/circles", { method: "POST", token, body: validCircle(overrides) });
  assert.equal(res.status, 201, res.text);
  return res.body as CircleDto;
}

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

// Applies and has the approver accept, as the old direct join did.
async function seated(circleId: string, approver: Member, applicant: Member, body: Record<string, unknown> = {}) {
  const application = await applied(circleId, applicant, body);
  const res = await voteOn(circleId, application.id, approver.token, "ACCEPT");
  assert.equal(res.status, 200, res.text);
  return res.body as ApplicationDto;
}

const getCircle = async (id: string): Promise<CircleDto> => (await server.request(`/api/circles/${id}`)).body as CircleDto;

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
    });
    server = await startServer(
      fakeServices({
        circles: circleService,
        applications: createApplicationService({ db, circles: circleService }),
        users: createUserService(db),
        kyc,
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

    test("→ 201: OPEN, creator seated in the chosen round, amounts in the pot's asset", async () => {
      const { id, token } = await member();
      const circle = await createCircle(token, { payoutRound: 2 });

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
      assert.equal(circle.seats[0]?.payoutRound, 2);
      assert.equal(circle.seats[0]?.displayName, "[test-circles] G.");
      // Default approval: the creator (and later their delegates) decide.
      assert.equal(circle.approvalMode, "DELEGATES");
      assert.equal(circle.seats[0]?.isApprover, true);

      const [row] = await db.select().from(circles).where(eq(circles.id, circle.id));
      assert.equal(row?.createdBy, id);
      assert.equal(row?.contributionValue, 2000000n);
    });

    test("by contribution: rounds derived from the goal; nothing collected yet", async () => {
      const { token } = await member();
      const circle = await createCircle(token, { size: 5, contributionValue: "5000000", goalValue: "50000000" });
      assert.deepEqual(circle.goal, { value: "50000000", assetCode: "COP", assetScale: 2 });
      assert.deepEqual(circle.contribution, { value: "5000000", assetCode: "COP", assetScale: 2 });
      assert.equal(circle.roundsTotal, 2);
      assert.deepEqual(circle.poolCollected, { value: "0", assetCode: "COP", assetScale: 2 });
      assert.equal(circle.nextPayDate, null);
      assert.equal(circle.currentCollection, null);
    });

    test("by rounds: contribution = goal ÷ (members × rounds); monthly by default", async () => {
      const { token } = await member();
      const body = { ...validCircle({ size: 5, goalValue: "50000000", roundsTotal: 5 }) } as Record<string, unknown>;
      delete body.contributionValue;
      delete body.roundLengthDays;
      const res = await server.request("/api/circles", { method: "POST", token, body });
      assert.equal(res.status, 201, res.text);
      const circle = res.body as CircleDto;
      assert.deepEqual(circle.contribution, { value: "2000000", assetCode: "COP", assetScale: 2 });
      assert.equal(circle.roundsTotal, 5);
      assert.equal(circle.roundLengthDays, 30);
      const [row] = await db.select().from(circles).where(eq(circles.id, circle.id));
      assert.equal(row?.goalValue, 50000000n);
      assert.equal(row?.contributionValue, 2000000n);
    });

    test("impossible plans → 422 with what would work, nothing stored", async () => {
      const { id, token } = await member();
      const tooHigh = await server.request("/api/circles", {
        method: "POST",
        token,
        body: validCircle({ size: 5, goalValue: "50000000", contributionValue: "30000000" }),
      });
      assert.equal(tooHigh.status, 422);
      assert.equal(errorCode(tooHigh.body), "CONTRIBUTION_TOO_HIGH");
      assert.deepEqual((tooHigh.body as { error: { details: unknown } }).error.details, { maxContribution: "10000000" });

      const body = validCircle({ size: 3, goalValue: "50000000", roundsTotal: 1 }) as Record<string, unknown>;
      delete body.contributionValue;
      const uneven = await server.request("/api/circles", { method: "POST", token, body });
      assert.equal(uneven.status, 422);
      assert.equal(errorCode(uneven.body), "GOAL_NOT_DIVISIBLE");
      assert.deepEqual((uneven.body as { error: { details: unknown } }).error.details, {
        suggestedGoals: { lower: "49999998", upper: "50000001" },
      });
      assert.equal((await db.select().from(circles).where(eq(circles.createdBy, id))).length, 0);
    });

    test("both or neither of roundsTotal and contributionValue → 400", async () => {
      const { token } = await member();
      const neither = validCircle() as Record<string, unknown>;
      delete neither.contributionValue;
      for (const body of [validCircle({ roundsTotal: 3 }), neither, validCircle({ roundsTotal: 0 }), validCircle({ goalValue: "0" })]) {
        const res = await server.request("/api/circles", { method: "POST", token, body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(errorCode(res.body), "VALIDATION_ERROR");
      }
    });

    test("approvalMode MAJORITY is stored", async () => {
      const { token } = await member();
      const circle = await createCircle(token, { approvalMode: "MAJORITY" });
      assert.equal(circle.approvalMode, "MAJORITY");
    });

    test("never exposes a member's full name or user id", async () => {
      const { id, token } = await member({ name: "Valentina Restrepo" });
      const circle = await createCircle(token);
      const res = await server.request(`/api/circles/${circle.id}`);
      assert.ok(!res.text.includes("Valentina Restrepo"), "full name leaked");
      assert.ok(!res.text.includes(id), "user id leaked");
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
        { payoutRound: 4 },
        { roundLengthDays: 0 },
        { name: " " },
        { feeBps: 0 },
        { status: "ACTIVE" },
        { approvalMode: "CREATOR_ONLY" },
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

  describe("POST /:id/applications (apply)", () => {
    test("→ 201 PENDING with only the applicant's name, wallet and ICS", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const bob = await member({ name: "Bob Ruiz", score: 0.8734 });

      const res = await applyTo(circle.id, bob.token, { payoutRound: 3, collateralValue: "500000", grantMode: "RECURRING" });
      assert.equal(res.status, 201, res.text);
      const application = res.body as ApplicationDto;
      assert.equal(application.status, "PENDING");
      assert.equal(application.decidedAt, null);
      assert.deepEqual(application.votes, { accept: 0, reject: 0 });
      assert.deepEqual(application.applicant, { fullName: `${PREFIX}Bob Ruiz`, walletAddress: bob.walletAddress, ics: 87.34 });
      assert.deepEqual(Object.keys(application).sort(), ["applicant", "createdAt", "decidedAt", "id", "status", "votes"]);
      assert.ok(!res.text.includes("@example.test") && !res.text.includes("+57"), "contact data leaked");

      const [row] = await db.select().from(circleApplications).where(eq(circleApplications.id, application.id));
      assert.equal(row?.payoutRound, 3);
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
      for (const body of [{ payoutRound: 0 }, { collateralValue: "1.5" }, { grantMode: "ALWAYS" }, { status: "ACCEPTED" }]) {
        const res = await applyTo(circle.id, bob.token, body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(errorCode(res.body), "VALIDATION_ERROR");
      }
    });

    test("unknown or malformed circle → 404; payout round past the size → 422", async () => {
      const bob = await member();
      for (const id of [randomUUID(), "not-a-uuid"]) {
        const res = await applyTo(id, bob.token);
        assert.equal(res.status, 404, id);
        assert.equal(errorCode(res.body), "CIRCLE_NOT_FOUND");
      }
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3 });
      const res = await applyTo(circle.id, bob.token, { payoutRound: 4 });
      assert.equal(res.status, 422);
      assert.equal(errorCode(res.body), "INVALID_PAYOUT_ROUND");
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
    test("the creator's first decision accepts and seats the applicant in their preferred round", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4, payoutRound: 1 });
      const bob = await member();
      const application = await applied(circle.id, bob, { payoutRound: 3, collateralValue: "500000", grantMode: "RECURRING" });

      const res = await voteOn(circle.id, application.id, owner.token, "ACCEPT");
      assert.equal(res.status, 200, res.text);
      const decided = res.body as ApplicationDto;
      assert.equal(decided.status, "ACCEPTED");
      assert.ok(decided.decidedAt);
      assert.deepEqual(decided.votes, { accept: 1, reject: 0 });

      const after = await getCircle(circle.id);
      assert.equal(after.seatsTaken, 2);
      const seat = after.seats.find((s) => s.payoutRound === 3);
      assert.deepEqual(seat?.collateral, { value: "500000", assetCode: "COP", assetScale: 2 });
      assert.equal(seat?.grantMode, "RECURRING");
      assert.equal(seat?.isApprover, false);

      const events = await db.select().from(auditEvents).where(eq(auditEvents.externalId, `application.accepted:${application.id}`));
      assert.equal(events.length, 1);
    });

    test("a taken or missing preferred round falls back to the next free one", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4, payoutRound: 1 });
      const [bob, carol] = await Promise.all([member(), member()]);
      await seated(circle.id, owner, bob, { payoutRound: 1 });
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
      const circle = await createCircle(owner.token, { size: 3, roundLengthDays: 7, payoutRound: 3 });
      const [bob, carol, dave] = await Promise.all([member(), member(), member()]);
      await seated(circle.id, owner, bob, { payoutRound: 1 });
      const daveApp = await applied(circle.id, dave);
      const last = await seated(circle.id, owner, carol, { payoutRound: 2 });
      assert.equal(last.status, "ACCEPTED");

      const started = await getCircle(circle.id);
      assert.equal(started.status, "ACTIVE");
      assert.ok(started.startedAt);
      assert.equal(started.currentRound, 1);
      assert.deepEqual(
        started.rounds.map((r) => r.state),
        ["COLLECTING", "UPCOMING", "UPCOMING"],
      );

      // Pool model: no per-round beneficiary; the pot pays out at the goal.
      assert.ok(started.rounds.every((r) => r.beneficiaryMemberId === null));
      assert.equal(started.nextPayDate, started.rounds[0]?.deadline);

      // Deadlines are one round length apart, starting one round after the start.
      const start = Date.parse(started.startedAt ?? "");
      started.rounds.forEach((r) => assert.equal(Date.parse(r.deadline) - start, r.number * 7 * 86_400_000));

      // Everyone pays round 1.
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

    test("derived pool values follow completed contributions: who paid, round and pool totals", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 2 });
      const bob = await member();
      await seated(circle.id, owner, bob);

      const started = await getCircle(circle.id);
      assert.equal(started.roundsTotal, 3);
      assert.equal(started.rounds.length, 3);
      assert.deepEqual(started.currentCollection, {
        round: 1,
        collected: { value: "0", assetCode: "COP", assetScale: 2 },
        expected: { value: "4000000", assetCode: "COP", assetScale: 2 },
        paidMemberIds: [],
      });

      // Mark the owner's round-1 contribution as completed (the payment flow does this later).
      const ownerSeat = started.seats.find((s) => s.isApprover);
      const [round1] = await db.select().from(rounds).where(and(eq(rounds.circleId, circle.id), eq(rounds.number, 1)));
      await db
        .update(contributions)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(and(eq(contributions.roundId, round1?.id ?? ""), eq(contributions.memberId, ownerSeat?.memberId ?? "")));

      const partial = await getCircle(circle.id);
      assert.deepEqual(partial.currentCollection?.collected, { value: "2000000", assetCode: "COP", assetScale: 2 });
      assert.deepEqual(partial.currentCollection?.paidMemberIds, [ownerSeat?.memberId]);
      assert.deepEqual(partial.rounds[0]?.collected, { value: "2000000", assetCode: "COP", assetScale: 2 });
      assert.deepEqual(partial.poolCollected, { value: "2000000", assetCode: "COP", assetScale: 2 });
      assert.deepEqual(partial.goal, { value: "12000000", assetCode: "COP", assetScale: 2 });
    });

    test("two acceptances racing for the last seat: one wins, the circle starts once", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 2, payoutRound: 1 });
      const [bob, carol] = await Promise.all([member(), member()]);
      const apps = [await applied(circle.id, bob), await applied(circle.id, carol)];

      const results = await Promise.all(apps.map((a) => voteOn(circle.id, a.id, owner.token, "ACCEPT")));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);

      const seats = await db.select().from(circleMembers).where(eq(circleMembers.circleId, circle.id));
      assert.equal(seats.length, 2);
      const roundRows = await db.select().from(rounds).where(eq(rounds.circleId, circle.id));
      // Scheduled once: goal ÷ (contribution × size) = 3 rounds.
      assert.equal(roundRows.length, 3);
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
});
