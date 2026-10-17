import { and, asc, desc, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { uniqueViolation } from "../db/errors";
import {
  APPROVAL_MODES,
  CIRCLE_STATUSES,
  CIRCLE_VISIBILITIES,
  GRANT_MODES,
  ROUND_STATES,
  auditEvents,
  circleInvites,
  circleMembers,
  circles,
  contributions,
  reviews,
  rounds,
  testClocks,
  users,
  wallets,
} from "../db/schema";
import { AppError } from "../errors/app-error";
import { lockCircle, membership, requireManager } from "./circles/circle-access";
import { addressedTo, consumeInvite, insertStandingCode, inviteUrl as inviteUrlOf, matchedInvite, standingCodeOf } from "./circles/invite-access";
import { cadenceDays, periodEnd, periodStart, type Cadence } from "./circles/period-schedule";
import { displayName } from "./display-name";
import { emptyRecord, findReviews, memberRecords, type MemberRecord, type ReviewDto } from "./member.service";

export { displayName };
import type { AmountDto, ResolvedWallet, Tx } from "./wallet.service";

export type CircleStatus = (typeof CIRCLE_STATUSES)[number];
export type GrantMode = (typeof GRANT_MODES)[number];
export type CircleVisibility = (typeof CIRCLE_VISIBILITIES)[number];
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
type RoundState = (typeof ROUND_STATES)[number];

// Defaults for new circles, matching the demo data. Placeholder policy until the team sets real values.
const DEFAULT_FEE_BPS = 200;
const DEFAULT_GRANT_WEIGHT_BPS = 5_000;

/** Who is asking: a signed-in user, the invite token from a link, or neither. */
export interface CircleViewer {
  userId?: string | undefined;
  invite?: string | undefined;
}

export interface SeatInput {
  payoutRound: number;
  collateralValue: bigint;
  grantMode: GrantMode | null;
}

export interface CreateCircleInput extends SeatInput {
  name: string;
  city?: string | undefined;
  contributionValue: bigint;
  size: number;
  cadence: Cadence;
  /** Dev only: run this circle on a test clock the user owns. */
  testClockId?: string | undefined;
  /** Private (invite only) unless the creator asks for public. */
  visibility?: CircleVisibility | undefined;
  /** Who accepts applicants to a public circle; the creator and their delegates by default. */
  approvalMode?: ApprovalMode | undefined;
}

// An applicant's seat preferences: with no payout round they get the next free one.
export type SeatRequest = Omit<SeatInput, "payoutRound"> & { payoutRound: number | null };

export interface CircleSummaryDto {
  id: string;
  name: string;
  city: string | null;
  status: CircleStatus;
  contribution: AmountDto;
  size: number;
  seatsTaken: number;
  cadence: Cadence;
  visibility: CircleVisibility;
  createdAt: string;
}

export interface SeatDto {
  memberId: string;
  /** The member's user id, for their profile (GET /api/members/:id). Pages are signed-in only. */
  userId: string;
  // "Ana G.", never the full legal name.
  displayName: string;
  /** Payment record across all their circles, for trust. */
  record: MemberRecord;
  payoutRound: number;
  collateral: AmountDto;
  grantMode: GrantMode | null;
  // Accepts or rejects applicants when the circle uses DELEGATES.
  isApprover: boolean;
}

export interface RoundDto {
  number: number;
  state: RoundState;
  beneficiaryMemberId: string;
  startsAt: string;
  deadline: string;
  contributions: { memberId: string; status: string }[];
}

export interface CircleDto extends CircleSummaryDto {
  feeBps: number;
  threshold: AmountDto;
  grantWeightBps: number;
  approvalMode: ApprovalMode;
  poolWalletAddress: string;
  startedAt: string | null;
  // Dev only (TEST_CLOCKS_ENABLED): the test clock this circle runs on.
  testClockId: string | null;
  /** The standing invite link (no expiry, no use limit); for the creator and approvers only. */
  inviteUrl: string | null;
  /** What the viewer may do here: invite people (creator or approver), change visibility (creator). */
  access: { canInvite: boolean; isCreator: boolean };
  // The round being collected or paid out; null before the circle starts or once it is over.
  currentRound: number | null;
  seats: SeatDto[];
  rounds: RoundDto[];
  /** Reviews members left each other in this circle, newest first. */
  reviews: ReviewDto[];
}

const ACTIVE_ROUND_STATES: readonly RoundState[] = ["COLLECTING", "FUNDED", "RISK_CHECK", "BLOCKED", "PAYING_OUT"];


const amount = (value: bigint, assetCode: string, assetScale: number): AmountDto => ({
  value: value.toString(),
  assetCode,
  assetScale,
});

export interface CircleServiceDeps {
  db: Db;
  /** Resolves the pot wallet (OpenCircle's own wallet address). */
  resolvePoolWallet: () => Promise<ResolvedWallet>;
  /** Whether circles may be attached to test clocks (TEST_CLOCKS_ENABLED). */
  testClocksEnabled?: boolean;
  /** Called after a circle starts, outside its transaction (test clocks request round 1 right away). */
  onStarted?: (circleId: string) => Promise<void>;
  /** Next app origin, for invite links. */
  frontendUrl: string;
}

export function createCircleService({ db, resolvePoolWallet, testClocksEnabled = false, onStarted, frontendUrl }: CircleServiceDeps) {
  const notFound = () => new AppError(404, "CIRCLE_NOT_FOUND", "Circle not found");
  const inviteUrl = (id: string, token: string) => inviteUrlOf(frontendUrl, id, token);

  // SQL form of canSee without an invite: public, or the viewer has a seat.
  const visibleTo = (viewerId: string) =>
    or(
      eq(circles.visibility, "PUBLIC"),
      exists(
        db
          .select({ id: circleMembers.id })
          .from(circleMembers)
          .where(and(eq(circleMembers.circleId, circles.id), eq(circleMembers.userId, viewerId))),
      ),
    );

  async function isMember(circleId: string, userId: string | undefined): Promise<boolean> {
    if (userId === undefined) return false;
    const [seat] = await db
      .select({ id: circleMembers.id })
      .from(circleMembers)
      .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)))
      .limit(1);
    return seat !== undefined;
  }

  // Who is joining, for direct invites addressed by user id or by email.
  async function identity(tx: Tx, userId: string): Promise<{ id: string; email: string }> {
    const [user] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId));
    if (!user) throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found");
    return user;
  }

  // Public, or a member, or holding a usable invite. Anyone else can't tell it exists.
  async function canSee(circle: { id: string; visibility: CircleVisibility }, viewer: CircleViewer): Promise<boolean> {
    if (circle.visibility === "PUBLIC" || (await isMember(circle.id, viewer.userId))) return true;
    return (await matchedInvite(db, circle.id, viewer.invite, new Date())) !== null;
  }
  const summaryColumns = {
    id: circles.id,
    name: circles.name,
    city: circles.city,
    status: circles.status,
    contributionValue: circles.contributionValue,
    assetCode: circles.assetCode,
    assetScale: circles.assetScale,
    size: circles.size,
    cadence: circles.cadence,
    visibility: circles.visibility,
    createdAt: circles.createdAt,
    seatsTaken: sql<number>`(select count(*)::int from ${circleMembers} where ${circleMembers.circleId} = ${circles.id})`,
  };
  interface SummaryRow {
    id: string;
    name: string;
    city: string | null;
    status: CircleStatus;
    contributionValue: bigint;
    assetCode: string;
    assetScale: number;
    size: number;
    cadence: Cadence;
    visibility: CircleVisibility;
    createdAt: Date;
    seatsTaken: number;
  }

  const toSummary = (r: SummaryRow): CircleSummaryDto => ({
    id: r.id,
    name: r.name,
    city: r.city,
    status: r.status,
    contribution: amount(r.contributionValue, r.assetCode, r.assetScale),
    size: r.size,
    seatsTaken: r.seatsTaken,
    cadence: r.cadence,
    visibility: r.visibility,
    createdAt: r.createdAt.toISOString(),
  });

  async function get(id: string, viewer: CircleViewer = {}): Promise<CircleDto> {
    const [circle] = await db
      .select({
        ...summaryColumns,
        feeBps: circles.feeBps,
        thresholdValue: circles.thresholdValue,
        grantWeightBps: circles.grantWeightBps,
        approvalMode: circles.approvalMode,
        startedAt: circles.startedAt,
        testClockId: circles.testClockId,
        createdBy: circles.createdBy,
        poolWalletAddress: wallets.addressUrl,
      })
      .from(circles)
      .innerJoin(wallets, eq(circles.poolWalletId, wallets.id))
      .where(eq(circles.id, id))
      .limit(1);
    if (!circle || !(await canSee(circle, viewer))) throw notFound();

    const seats = await db
      .select({
        memberId: circleMembers.id,
        userId: circleMembers.userId,
        fullName: users.fullName,
        payoutRound: circleMembers.payoutRound,
        collateralValue: circleMembers.collateralValue,
        grantMode: circleMembers.grantMode,
        isApprover: circleMembers.isApprover,
      })
      .from(circleMembers)
      .innerJoin(users, eq(circleMembers.userId, users.id))
      .where(eq(circleMembers.circleId, id))
      .orderBy(asc(circleMembers.payoutRound));

    const roundRows = await db.select().from(rounds).where(eq(rounds.circleId, id)).orderBy(asc(rounds.number));
    const contributionRows =
      roundRows.length === 0
        ? []
        : await db
            .select({ roundId: contributions.roundId, memberId: contributions.memberId, status: contributions.status })
            .from(contributions)
            .where(
              inArray(
                contributions.roundId,
                roundRows.map((r) => r.id),
              ),
            );

    const [records, circleReviews, viewerSeat] = await Promise.all([
      memberRecords(
        db,
        seats.map((s) => s.userId),
      ),
      findReviews(db, eq(reviews.circleId, id)),
      viewer.userId === undefined ? null : membership(db, id, viewer.userId),
    ]);
    const isCreator = viewer.userId === circle.createdBy;
    const canInvite = isCreator || (viewerSeat?.isApprover ?? false);
    const standingCode = canInvite ? await standingCodeOf(db, id, new Date()) : null;

    const { assetCode, assetScale } = circle;
    return {
      ...toSummary(circle),
      feeBps: circle.feeBps,
      threshold: amount(circle.thresholdValue, assetCode, assetScale),
      grantWeightBps: circle.grantWeightBps,
      approvalMode: circle.approvalMode,
      poolWalletAddress: circle.poolWalletAddress,
      startedAt: circle.startedAt?.toISOString() ?? null,
      testClockId: testClocksEnabled ? circle.testClockId : null,
      inviteUrl: standingCode === null ? null : inviteUrl(circle.id, standingCode),
      access: { canInvite, isCreator },
      currentRound: roundRows.find((r) => ACTIVE_ROUND_STATES.includes(r.state))?.number ?? null,
      seats: seats.map((s) => ({
        memberId: s.memberId,
        userId: s.userId,
        displayName: displayName(s.fullName),
        record: records.get(s.userId) ?? emptyRecord(),
        payoutRound: s.payoutRound,
        collateral: amount(s.collateralValue, assetCode, assetScale),
        grantMode: s.grantMode ?? null,
        isApprover: s.isApprover,
      })),
      rounds: roundRows.map((r) => ({
        number: r.number,
        state: r.state,
        beneficiaryMemberId: r.beneficiaryMemberId,
        startsAt: r.startsAt.toISOString(),
        deadline: r.deadline.toISOString(),
        contributions: contributionRows
          .filter((c) => c.roundId === r.id)
          .map((c) => ({ memberId: c.memberId, status: c.status })),
      })),
      reviews: circleReviews,
    };
  }

  // The pot wallet row, created on first use. Resolved outside the transaction (network I/O).
  async function poolWalletId(tx: Tx, remote: ResolvedWallet): Promise<{ id: string; assetCode: string; assetScale: number }> {
    await tx
      .insert(wallets)
      .values({ addressUrl: remote.id, assetCode: remote.assetCode, assetScale: remote.assetScale })
      .onConflictDoNothing({ target: wallets.addressUrl });
    const [wallet] = await tx
      .select({ id: wallets.id, assetCode: wallets.assetCode, assetScale: wallets.assetScale })
      .from(wallets)
      .where(eq(wallets.addressUrl, remote.id));
    if (!wallet) throw new Error("Pool wallet row missing after upsert");
    return wallet;
  }

  // Seat conflicts surface as unique violations; turn them into 409s the client can act on.
  function seatConflict(err: unknown): AppError | null {
    const constraint = uniqueViolation(err);
    if (constraint === "circle_members_circle_user_unique") {
      return new AppError(409, "ALREADY_MEMBER", "You already have a seat in this circle");
    }
    if (constraint === "circle_members_circle_payout_round_unique") {
      return new AppError(409, "SEAT_TAKEN", "That payout round is already taken");
    }
    return null;
  }

  type CircleRow = typeof circles.$inferSelect;

  // Only the creator manages the circle; to anyone else it doesn't exist.
  async function openCircleOf(userId: string, circleId: string): Promise<void> {
    const [circle] = await db
      .select({ createdBy: circles.createdBy, status: circles.status })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    if (!circle || circle.createdBy !== userId) throw notFound();
    if (circle.status !== "OPEN") throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");
  }

  // A circle on a test clock lives at the clock's frozen time; every other circle at real time.
  async function circleNow(tx: Tx, circle: CircleRow): Promise<Date> {
    if (!circle.testClockId) return new Date();
    const [clock] = await tx.select({ frozenTime: testClocks.frozenTime }).from(testClocks).where(eq(testClocks.id, circle.testClockId));
    if (!clock) throw new Error("Circle's test clock is missing");
    return clock.frozenTime;
  }

  async function ownedTestClock(userId: string, clockId: string): Promise<void> {
    const notFound = new AppError(404, "TEST_CLOCK_NOT_FOUND", "Test clock not found");
    if (!testClocksEnabled) throw notFound;
    const [clock] = await db
      .select({ id: testClocks.id })
      .from(testClocks)
      .where(and(eq(testClocks.id, clockId), eq(testClocks.ownerUserId, userId)))
      .limit(1);
    if (!clock) throw notFound;
  }

  // The last seat is filled: schedule every round and open round 1. Same transaction as the join.
  async function start(tx: Tx, circle: CircleRow, now: Date): Promise<void> {
    const seats = await tx
      .select({ id: circleMembers.id, payoutRound: circleMembers.payoutRound })
      .from(circleMembers)
      .where(eq(circleMembers.circleId, circle.id))
      .orderBy(asc(circleMembers.payoutRound));

    await tx.update(circles).set({ status: "ACTIVE", startedAt: now }).where(eq(circles.id, circle.id));

    const created = await tx
      .insert(rounds)
      .values(
        seats.map((seat) => ({
          circleId: circle.id,
          number: seat.payoutRound,
          beneficiaryMemberId: seat.id,
          state: seat.payoutRound === 1 ? ("COLLECTING" as const) : ("UPCOMING" as const),
          startsAt: periodStart(now, circle.cadence, seat.payoutRound),
          deadline: periodEnd(now, circle.cadence, seat.payoutRound),
          openedAt: seat.payoutRound === 1 ? now : null,
        })),
      )
      .returning({ id: rounds.id, number: rounds.number });

    const first = created.find((r) => r.number === 1);
    if (!first) throw new Error("Round 1 missing after scheduling");
    // Everyone pays every round, the beneficiary included (pot = contribution × size).
    await tx.insert(contributions).values(
      seats.map((seat) => ({
        roundId: first.id,
        memberId: seat.id,
        value: circle.contributionValue,
        assetCode: circle.assetCode,
        assetScale: circle.assetScale,
        // Deterministic: the same round and member always map to the same key.
        idempotencyKey: `contribution:${first.id}:${seat.id}`,
      })),
    );
    await tx
      .insert(auditEvents)
      .values({ walletId: circle.poolWalletId, eventType: "circle.started", externalId: `circle.started:${circle.id}` });
  }

  /**
   * Seats a user in an OPEN circle the caller has locked (FOR UPDATE), so seats are counted
   * one at a time. A null payout round takes the lowest free one. Filling the last seat
   * starts the circle; returns whether it did, so the caller runs afterStarted once committed.
   */
  async function takeSeat(tx: Tx, circle: CircleRow, userId: string, seat: SeatRequest): Promise<boolean> {
    if (circle.status !== "OPEN") throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");
    if (seat.payoutRound !== null && seat.payoutRound > circle.size) {
      throw new AppError(422, "INVALID_PAYOUT_ROUND", "Payout round must be between 1 and the circle size");
    }
    const taken = (
      await tx.select({ payoutRound: circleMembers.payoutRound }).from(circleMembers).where(eq(circleMembers.circleId, circle.id))
    ).map((m) => m.payoutRound);
    const payoutRound = seat.payoutRound ?? Array.from({ length: circle.size }, (_, i) => i + 1).find((n) => !taken.includes(n));
    if (payoutRound === undefined) throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");

    try {
      await tx.insert(circleMembers).values({
        circleId: circle.id,
        userId,
        payoutRound,
        collateralValue: seat.collateralValue,
        grantMode: seat.grantMode,
      });
    } catch (err) {
      throw seatConflict(err) ?? err;
    }

    if (taken.length + 1 < circle.size) return false;
    await start(tx, circle, await circleNow(tx, circle));
    return true;
  }

  async function afterStarted(circleId: string): Promise<void> {
    if (!onStarted) return;
    // The seat is taken either way; a failed first collection is retried by the next run.
    await onStarted(circleId).catch(() => console.error("Circle start hook failed", circleId));
  }

  return {
    get,

    async list(filter: { status?: CircleStatus | undefined }): Promise<CircleSummaryDto[]> {
      const rows = await db
        .select(summaryColumns)
        .from(circles)
        .where(and(eq(circles.visibility, "PUBLIC"), filter.status ? eq(circles.status, filter.status) : undefined))
        .orderBy(desc(circles.createdAt))
        .limit(100);
      return rows.map(toSummary);
    },

    /** The user's circles. Seen by someone else (`viewerId`), only those that viewer can see. */
    async listForUser(userId: string, viewerId: string = userId): Promise<CircleSummaryDto[]> {
      const rows = await db
        .select(summaryColumns)
        .from(circles)
        .innerJoin(circleMembers, and(eq(circleMembers.circleId, circles.id), eq(circleMembers.userId, userId)))
        .where(viewerId === userId ? undefined : visibleTo(viewerId))
        .orderBy(desc(circles.createdAt));
      return rows.map(toSummary);
    },

    /** Summaries of the given circles, in no particular order; unknown ids are left out. */
    async summariesOf(circleIds: readonly string[]): Promise<CircleSummaryDto[]> {
      if (circleIds.length === 0) return [];
      const rows = await db
        .select(summaryColumns)
        .from(circles)
        .where(inArray(circles.id, [...new Set(circleIds)]));
      return rows.map(toSummary);
    },

    /** Of `circleIds`, those `viewerId` may see (public, or they are a member). */
    async visibleIds(viewerId: string, circleIds: readonly string[]): Promise<Set<string>> {
      if (circleIds.length === 0) return new Set();
      const rows = await db
        .select({ id: circles.id })
        .from(circles)
        .where(and(inArray(circles.id, [...new Set(circleIds)]), visibleTo(viewerId)));
      return new Set(rows.map((r) => r.id));
    },

    /** Creates an OPEN circle with its creator in the payout round they chose. */
    async create(userId: string, input: CreateCircleInput): Promise<CircleDto> {
      if (input.payoutRound > input.size) {
        throw new AppError(422, "INVALID_PAYOUT_ROUND", "Payout round must be between 1 and the circle size");
      }
      if (input.testClockId !== undefined) await ownedTestClock(userId, input.testClockId);
      const remote = await resolvePoolWallet();
      const id = await db.transaction(async (tx) => {
        const pool = await poolWalletId(tx, remote);
        const [circle] = await tx
          .insert(circles)
          .values({
            name: input.name,
            city: input.city ?? null,
            contributionValue: input.contributionValue,
            // The pot's asset: every contribution is in the currency the pot wallet holds.
            assetCode: pool.assetCode,
            assetScale: pool.assetScale,
            feeBps: DEFAULT_FEE_BPS,
            thresholdValue: input.contributionValue,
            grantWeightBps: DEFAULT_GRANT_WEIGHT_BPS,
            cadence: input.cadence,
            roundLengthDays: cadenceDays[input.cadence],
            size: input.size,
            poolWalletId: pool.id,
            createdBy: userId,
            testClockId: input.testClockId ?? null,
            visibility: input.visibility ?? "PRIVATE",
            approvalMode: input.approvalMode ?? "DELEGATES",
          })
          .returning({ id: circles.id });
        if (!circle) throw new Error("Circle insert returned no row");
        // The creator always approves applicants.
        await tx.insert(circleMembers).values({
          circleId: circle.id,
          userId,
          payoutRound: input.payoutRound,
          collateralValue: input.collateralValue,
          grantMode: input.grantMode,
          isApprover: true,
        });
        await insertStandingCode(tx, circle.id, userId);
        return circle.id;
      });
      return get(id, { userId });
    },

    /** Takes a free seat; filling the last one starts the circle. */
    async join(userId: string, circleId: string, input: SeatInput, invite?: string): Promise<CircleDto> {
      const started = await db.transaction(async (tx) => {
        // Lock the circle so concurrent joins count seats (and invite uses) one at a time.
        const circle = await lockCircle(tx, circleId);
        // A code admits anyone; a direct invite only the person it was sent to.
        const matched = await matchedInvite(tx, circle.id, invite, new Date());
        const admitted = matched !== null && addressedTo(matched, await identity(tx, userId));
        // A non-member can only join a private circle through a usable invite.
        if (!admitted && !(await canSee(circle, { userId }))) throw notFound();
        // Public circles are semi-public: without an invite, applicants are accepted by the
        // creator and their delegates (POST /circles/:id/applications).
        if (circle.visibility === "PUBLIC" && !admitted) {
          throw new AppError(403, "APPLICATION_REQUIRED", "Apply to join this circle; its approvers decide");
        }
        const started = await takeSeat(tx, circle, userId, input);
        if (admitted) await consumeInvite(tx, matched, circle, userId);
        return started;
      });
      if (started) await afterStarted(circleId);
      return get(circleId, { userId });
    },

    takeSeat,
    afterStarted,

    /** Creator only, while the circle still takes members. */
    async setVisibility(userId: string, circleId: string, visibility: CircleVisibility): Promise<CircleDto> {
      await openCircleOf(userId, circleId);
      await db.update(circles).set({ visibility }).where(eq(circles.id, circleId));
      return get(circleId, { userId });
    },

    /**
     * A new standing invite link; the old one stops working (limited codes and direct invites
     * stay). Creator or approver, while the circle is OPEN.
     */
    async rotateInviteCode(userId: string, circleId: string): Promise<CircleDto> {
      await db.transaction(async (tx) => {
        const circle = await lockCircle(tx, circleId);
        await requireManager(tx, circle, userId);
        if (circle.status !== "OPEN") throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");
        await tx
          .update(circleInvites)
          .set({ status: "REVOKED" })
          .where(
            and(
              eq(circleInvites.circleId, circleId),
              eq(circleInvites.kind, "CODE"),
              eq(circleInvites.status, "ACTIVE"),
              isNull(circleInvites.expiresAt),
              isNull(circleInvites.maxUses),
            ),
          );
        await insertStandingCode(tx, circleId, userId);
      });
      return get(circleId, { userId });
    },
  };
}

export type CircleService = ReturnType<typeof createCircleService>;
