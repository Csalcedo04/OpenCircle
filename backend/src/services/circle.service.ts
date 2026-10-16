import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { uniqueViolation } from "../db/errors";
import {
  CIRCLE_STATUSES,
  GRANT_MODES,
  ROUND_STATES,
  auditEvents,
  circleMembers,
  circles,
  contributions,
  rounds,
  testClocks,
  users,
  wallets,
} from "../db/schema";
import { AppError } from "../errors/app-error";
import { cadenceDays, periodEnd, periodStart, type Cadence } from "./circles/period-schedule";
import type { AmountDto, ResolvedWallet, Tx } from "./wallet.service";

export type CircleStatus = (typeof CIRCLE_STATUSES)[number];
export type GrantMode = (typeof GRANT_MODES)[number];
type RoundState = (typeof ROUND_STATES)[number];

// Defaults for new circles, matching the demo data. Placeholder policy until the team sets real values.
const DEFAULT_FEE_BPS = 200;
const DEFAULT_GRANT_WEIGHT_BPS = 5_000;

export interface SeatInput {
  payoutRound: number;
  collateralValue: bigint;
  grantMode: GrantMode | null;
}

export interface CreateCircleInput extends SeatInput {
  name: string;
  city: string;
  contributionValue: bigint;
  size: number;
  cadence: Cadence;
  /** Dev only: run this circle on a test clock the user owns. */
  testClockId?: string | undefined;
}

export interface CircleSummaryDto {
  id: string;
  name: string;
  city: string;
  status: CircleStatus;
  contribution: AmountDto;
  size: number;
  seatsTaken: number;
  cadence: Cadence;
  createdAt: string;
}

export interface SeatDto {
  memberId: string;
  // Public pages show "Ana G.", never the full legal name.
  displayName: string;
  payoutRound: number;
  collateral: AmountDto;
  grantMode: GrantMode | null;
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
  poolWalletAddress: string;
  startedAt: string | null;
  // Dev only (TEST_CLOCKS_ENABLED): the test clock this circle runs on.
  testClockId: string | null;
  // The round being collected or paid out; null before the circle starts or once it is over.
  currentRound: number | null;
  seats: SeatDto[];
  rounds: RoundDto[];
}

const ACTIVE_ROUND_STATES: readonly RoundState[] = ["COLLECTING", "FUNDED", "RISK_CHECK", "BLOCKED", "PAYING_OUT"];

/** "Ana María Gómez" → "Ana G." */
export function displayName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

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
}

export function createCircleService({ db, resolvePoolWallet, testClocksEnabled = false, onStarted }: CircleServiceDeps) {
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
    createdAt: circles.createdAt,
    seatsTaken: sql<number>`(select count(*)::int from ${circleMembers} where ${circleMembers.circleId} = ${circles.id})`,
  };
  interface SummaryRow {
    id: string;
    name: string;
    city: string;
    status: CircleStatus;
    contributionValue: bigint;
    assetCode: string;
    assetScale: number;
    size: number;
    cadence: Cadence;
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
    createdAt: r.createdAt.toISOString(),
  });

  async function get(id: string): Promise<CircleDto> {
    const [circle] = await db
      .select({
        ...summaryColumns,
        feeBps: circles.feeBps,
        thresholdValue: circles.thresholdValue,
        grantWeightBps: circles.grantWeightBps,
        startedAt: circles.startedAt,
        testClockId: circles.testClockId,
        poolWalletAddress: wallets.addressUrl,
      })
      .from(circles)
      .innerJoin(wallets, eq(circles.poolWalletId, wallets.id))
      .where(eq(circles.id, id))
      .limit(1);
    if (!circle) throw new AppError(404, "CIRCLE_NOT_FOUND", "Circle not found");

    const seats = await db
      .select({
        memberId: circleMembers.id,
        fullName: users.fullName,
        payoutRound: circleMembers.payoutRound,
        collateralValue: circleMembers.collateralValue,
        grantMode: circleMembers.grantMode,
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

    const { assetCode, assetScale } = circle;
    return {
      ...toSummary(circle),
      feeBps: circle.feeBps,
      threshold: amount(circle.thresholdValue, assetCode, assetScale),
      grantWeightBps: circle.grantWeightBps,
      poolWalletAddress: circle.poolWalletAddress,
      startedAt: circle.startedAt?.toISOString() ?? null,
      testClockId: testClocksEnabled ? circle.testClockId : null,
      currentRound: roundRows.find((r) => ACTIVE_ROUND_STATES.includes(r.state))?.number ?? null,
      seats: seats.map((s) => ({
        memberId: s.memberId,
        displayName: displayName(s.fullName),
        payoutRound: s.payoutRound,
        collateral: amount(s.collateralValue, assetCode, assetScale),
        grantMode: s.grantMode ?? null,
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

  return {
    get,

    async list(filter: { status?: CircleStatus | undefined }): Promise<CircleSummaryDto[]> {
      const rows = await db
        .select(summaryColumns)
        .from(circles)
        .where(filter.status ? eq(circles.status, filter.status) : undefined)
        .orderBy(desc(circles.createdAt))
        .limit(100);
      return rows.map(toSummary);
    },

    async listForUser(userId: string): Promise<CircleSummaryDto[]> {
      const rows = await db
        .select(summaryColumns)
        .from(circles)
        .innerJoin(circleMembers, and(eq(circleMembers.circleId, circles.id), eq(circleMembers.userId, userId)))
        .orderBy(desc(circles.createdAt));
      return rows.map(toSummary);
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
            city: input.city,
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
          })
          .returning({ id: circles.id });
        if (!circle) throw new Error("Circle insert returned no row");
        await tx.insert(circleMembers).values({
          circleId: circle.id,
          userId,
          payoutRound: input.payoutRound,
          collateralValue: input.collateralValue,
          grantMode: input.grantMode,
        });
        return circle.id;
      });
      return get(id);
    },

    /** Takes a free seat; filling the last one starts the circle. */
    async join(userId: string, circleId: string, input: SeatInput): Promise<CircleDto> {
      let started = false;
      try {
        await db.transaction(async (tx) => {
          // Lock the circle so concurrent joins count seats one at a time.
          const [circle] = await tx.select().from(circles).where(eq(circles.id, circleId)).for("update");
          if (!circle) throw new AppError(404, "CIRCLE_NOT_FOUND", "Circle not found");
          if (circle.status !== "OPEN") throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");
          if (input.payoutRound > circle.size) {
            throw new AppError(422, "INVALID_PAYOUT_ROUND", "Payout round must be between 1 and the circle size");
          }

          await tx.insert(circleMembers).values({
            circleId,
            userId,
            payoutRound: input.payoutRound,
            collateralValue: input.collateralValue,
            grantMode: input.grantMode,
          });

          const [{ taken } = { taken: 0 }] = await tx
            .select({ taken: sql<number>`count(*)::int` })
            .from(circleMembers)
            .where(eq(circleMembers.circleId, circleId));
          if (taken === circle.size) {
            await start(tx, circle, await circleNow(tx, circle));
            started = true;
          }
        });
      } catch (err) {
        throw seatConflict(err) ?? err;
      }
      if (started && onStarted) {
        // The seat is taken either way; a failed first collection is retried by the next run.
        await onStarted(circleId).catch(() => console.error("Circle start hook failed", circleId));
      }
      return get(circleId);
    },
  };
}

export type CircleService = ReturnType<typeof createCircleService>;
