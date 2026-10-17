import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, circleMembers, circles, contributions, reviews, rounds, users, wallets } from "../src/db/schema";
import type { Services } from "../src/routes";
import { createCircleService, displayName, type CircleDto } from "../src/services/circle.service";
import { createMemberService, type MemberDto } from "../src/services/member.service";
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

  // FK order: contributions → rounds → seats → reviews → circles; nothing cascades.
  if (circleIds.length > 0) {
    const roundIds = (await db.select({ id: rounds.id }).from(rounds).where(inArray(rounds.circleId, circleIds))).map((r) => r.id);
    if (roundIds.length > 0) await db.delete(contributions).where(inArray(contributions.roundId, roundIds));
    await db.delete(rounds).where(inArray(rounds.circleId, circleIds));
    await db.delete(circleMembers).where(inArray(circleMembers.circleId, circleIds));
    await db.delete(reviews).where(inArray(reviews.circleId, circleIds));
    await db.delete(circles).where(inArray(circles.id, circleIds));
  }
  const poolWallets = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `https://${POOL_HOST}/%`))).map(
    (w) => w.id,
  );
  if (poolWallets.length > 0) {
    await db.delete(auditEvents).where(inArray(auditEvents.walletId, poolWallets));
    await db.delete(wallets).where(inArray(wallets.id, poolWallets));
  }
  await db.delete(users).where(or(like(users.fullName, `${PREFIX}%`), createdUserIds.length > 0 ? inArray(users.id, createdUserIds) : undefined));
}

// A user with a profile; KYC-approved unless told otherwise (KYC itself is faked here).
async function member(
  options: { kyc?: boolean; name?: string } = {},
): Promise<{ id: string; token: string; documentNumber: string }> {
  const id = randomUUID();
  createdUserIds.push(id);
  const documentNumber = String(randomInt(1_000_000_000, 9_999_999_999));
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    documentType: "cc",
    documentNumber,
    nationality: "CO",
    fullName: `${PREFIX}${options.name ?? "Ana María Gómez"}`,
  });
  if (options.kyc ?? true) approved.add(id);
  return { id, token: await auth.token(id), documentNumber };
}

const validCircle = (overrides: Record<string, unknown> = {}) => ({
  name: `${PREFIX}Natillera Laureles`,
  city: "Medellín",
  contributionValue: "2000000",
  size: 3,
  cadence: "WEEKLY",
  payoutRound: 1,
  ...overrides,
});

async function createCircle(token: string, overrides: Record<string, unknown> = {}): Promise<CircleDto> {
  const res = await server.request("/api/circles", { method: "POST", token, body: validCircle(overrides) });
  assert.equal(res.status, 201, res.text);
  return res.body as CircleDto;
}

const join = (id: string, token: string, body: Record<string, unknown>) =>
  server.request(`/api/circles/${id}/join`, { method: "POST", token, body });

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
      fakeServices({ circles: circleService, kyc, members: createMemberService({ db, circles: circleService }) }),
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
        { payoutRound: 4 },
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
    test("takes a free seat; repeats and taken rounds are refused", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 4 });
      const bob = await member();
      const carol = await member();

      const ok = await join(circle.id, bob.token, { payoutRound: 2, collateralValue: "500000", grantMode: "RECURRING" });
      assert.equal(ok.status, 200);
      const seat = (ok.body as CircleDto).seats.find((s) => s.payoutRound === 2);
      assert.deepEqual(seat?.collateral, { value: "500000", assetCode: "COP", assetScale: 2 });
      assert.equal(seat?.grantMode, "RECURRING");

      const again = await join(circle.id, bob.token, { payoutRound: 3 });
      assert.equal(again.status, 409);
      assert.equal(errorCode(again.body), "ALREADY_MEMBER");

      const taken = await join(circle.id, carol.token, { payoutRound: 2 });
      assert.equal(taken.status, 409);
      assert.equal(errorCode(taken.body), "SEAT_TAKEN");

      const outOfRange = await join(circle.id, carol.token, { payoutRound: 5 });
      assert.equal(outOfRange.status, 422);
      assert.equal(errorCode(outOfRange.body), "INVALID_PAYOUT_ROUND");
    });

    test("without approved KYC → 403 KYC_REQUIRED", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token);
      const { token } = await member({ kyc: false });
      const res = await join(circle.id, token, { payoutRound: 2 });
      assert.equal(res.status, 403);
      assert.equal(errorCode(res.body), "KYC_REQUIRED");
    });

    test("an unknown circle → 404 CIRCLE_NOT_FOUND", async () => {
      const { token } = await member();
      const res = await join(randomUUID(), token, { payoutRound: 1 });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "CIRCLE_NOT_FOUND");
    });

    test("filling the last seat starts the circle: rounds scheduled, round 1 contributions pending", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3, cadence: "WEEKLY", payoutRound: 3 });
      const bob = await member();
      const carol = await member();
      assert.equal((await join(circle.id, bob.token, { payoutRound: 1 })).status, 200);
      const last = await join(circle.id, carol.token, { payoutRound: 2 });
      assert.equal(last.status, 200);

      const started = last.body as CircleDto;
      assert.equal(started.status, "ACTIVE");
      assert.ok(started.startedAt);
      assert.equal(started.currentRound, 1);
      assert.deepEqual(
        started.rounds.map((r) => r.state),
        ["COLLECTING", "UPCOMING", "UPCOMING"],
      );

      // Round n pays out to the member who chose payout round n.
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
      const closed = await join(circle.id, late.token, { payoutRound: 1 });
      assert.equal(closed.status, 409);
      assert.equal(errorCode(closed.body), "CIRCLE_NOT_OPEN");
    });

    test("a monthly circle's periods follow calendar months from its start", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 3, cadence: "MONTHLY", payoutRound: 1 });
      assert.equal(circle.cadence, "MONTHLY");
      const [bob, carol] = await Promise.all([member(), member()]);
      assert.equal((await join(circle.id, bob.token, { payoutRound: 2 })).status, 200);
      const started = (await join(circle.id, carol.token, { payoutRound: 3 })).body as CircleDto;

      const start = new Date(started.startedAt ?? "");
      assert.deepEqual(
        started.rounds.map((r) => [r.startsAt, r.deadline]),
        [1, 2, 3].map((n) => [periodStart(start, "MONTHLY", n).toISOString(), periodEnd(start, "MONTHLY", n).toISOString()]),
      );
    });

    test("two users racing for the last seat: one wins, the circle starts once", async () => {
      const owner = await member();
      const circle = await createCircle(owner.token, { size: 2, payoutRound: 1 });
      const [bob, carol] = await Promise.all([member(), member()]);

      const results = await Promise.all([bob, carol].map((u) => join(circle.id, u.token, { payoutRound: 2 })));
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
      const circle = await createCircle(ana.token, { size: 3, payoutRound: 1 });
      assert.equal((await join(circle.id, bob.token, { payoutRound: 2 })).status, 200);
      assert.equal((await join(circle.id, cam.token, { payoutRound: 3 })).status, 200);

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
      const viewer = await member();
      const res = await server.request(`/api/members/${lone.id}`, { token: viewer.token });
      assert.equal(res.status, 200);
      const profile = res.body as MemberDto;
      assert.deepEqual(profile.payments, { onTime: 0, late: 0, missed: 0 });
      assert.equal(profile.circlesCompleted, 0);
      assert.equal(profile.memberSince, null);
      assert.deepEqual(profile.reviews, []);
      assert.deepEqual(profile.circles, []);
    });

    test("profiles need sign-in, never leak identity data, and unknown ids are 404", async () => {
      const subject = await member({ name: "Valentina Restrepo" });
      const viewer = await member();
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

});
