import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { uniqueViolation } from "../db/errors";
import {
  APPROVAL_MODES,
  CIRCLE_STATUSES,
  GRANT_MODES,
  ROUND_STATES,
  auditEvents,
  circleMembers,
  circles,
  contributions,
  rounds,
  users,
  wallets,
} from "../db/schema";
import { AppError } from "../errors/app-error";
import { planCircle, roundsTotal } from "./circles/circle-plan";
import { roundDeadline } from "./circles/schedule";
import type { AmountDto, ResolvedWallet, Tx } from "./wallet.service";

export type CircleStatus = (typeof CIRCLE_STATUSES)[number];
export type GrantMode = (typeof GRANT_MODES)[number];
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
type RoundState = (typeof ROUND_STATES)[number];

// Defaults for new circles, matching the demo data. Placeholder policy until the team sets real values.
const DEFAULT_FEE_BPS = 200;
const DEFAULT_GRANT_WEIGHT_BPS = 5_000;

export interface SeatInput {
  payoutRound: number;
  collateralValue: bigint;
  grantMode: GrantMode | null;
}

// An applicant's seat preferences: with no payout round they get the next free one.
export type SeatRequest = Omit<SeatInput, "payoutRound"> & { payoutRound: number | null };

// The creator gives the goal and either the number of rounds or the per-round contribution.
export type CreateCircleInput = SeatInput & {
  name: string;
  city: string;
  goalValue: bigint;
  size: number;
  roundLengthDays: number;
  approvalMode: ApprovalMode;
} & ({ roundsTotal: number; contributionValue?: undefined } | { contributionValue: bigint; roundsTotal?: undefined });

export interface CircleSummaryDto {
  id: string;
  name: string;
  city: string;
  status: CircleStatus;
  contribution: AmountDto;
  size: number;
  seatsTaken: number;
  roundLengthDays: number;
  createdAt: string;
}

export interface SeatDto {
  memberId: string;
  // Public pages show "Ana G.", never the full legal name.
  displayName: string;
  payoutRound: number;
  collateral: AmountDto;
  grantMode: GrantMode | null;
  // Accepts or rejects applicants when the circle uses DELEGATES.
  isApprover: boolean;
}

export interface RoundDto {
  number: number;
  state: RoundState;
  // Null in the pool model: the pot pays out once it reaches the goal.
  beneficiaryMemberId: string | null;
  deadline: string;
  // Sum of the round's completed contributions; the round is whole at contribution × size.
  collected: AmountDto;
  contributions: { memberId: string; status: string }[];
}

export interface CircleDto extends CircleSummaryDto {
  feeBps: number;
  threshold: AmountDto;
  grantWeightBps: number;
  approvalMode: ApprovalMode;
  goal: AmountDto;
  roundsTotal: number;
  // Every completed contribution so far, across rounds.
  poolCollected: AmountDto;
  poolWalletAddress: string;
  startedAt: string | null;
  // The round being collected or paid out; null before the circle starts or once it is over.
  currentRound: number | null;
  // Deadline of the round being collected: the next pay date. Null when none is collecting.
  nextPayDate: string | null;
  // Who already paid the round being collected, against what it needs.
  currentCollection: { round: number; collected: AmountDto; expected: AmountDto; paidMemberIds: string[] } | null;
  seats: SeatDto[];
  rounds: RoundDto[];
}

/** Sum of the completed contributions among `rows`. */
export const collectedValue = (rows: readonly { status: string; value: bigint }[]): bigint =>
  rows.reduce((sum, c) => (c.status === "COMPLETED" ? sum + c.value : sum), 0n);

/** What a round must collect: everyone pays the contribution. */
export const expectedPerRound = (c: { contributionValue: bigint; size: number }): bigint => c.contributionValue * BigInt(c.size);

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
}

export function createCircleService({ db, resolvePoolWallet }: CircleServiceDeps) {
  const summaryColumns = {
    id: circles.id,
    name: circles.name,
    city: circles.city,
    status: circles.status,
    contributionValue: circles.contributionValue,
    assetCode: circles.assetCode,
    assetScale: circles.assetScale,
    size: circles.size,
    roundLengthDays: circles.roundLengthDays,
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
    roundLengthDays: number;
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
    roundLengthDays: r.roundLengthDays,
    createdAt: r.createdAt.toISOString(),
  });

  async function get(id: string): Promise<CircleDto> {
    const [circle] = await db
      .select({
        ...summaryColumns,
        feeBps: circles.feeBps,
        thresholdValue: circles.thresholdValue,
        grantWeightBps: circles.grantWeightBps,
        approvalMode: circles.approvalMode,
        goalValue: circles.goalValue,
        startedAt: circles.startedAt,
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
            .select({
              roundId: contributions.roundId,
              memberId: contributions.memberId,
              status: contributions.status,
              value: contributions.value,
            })
            .from(contributions)
            .where(
              inArray(
                contributions.roundId,
                roundRows.map((r) => r.id),
              ),
            );

    const { assetCode, assetScale } = circle;
    const money = (value: bigint) => amount(value, assetCode, assetScale);
    const collecting = roundRows.find((r) => r.state === "COLLECTING");
    const collectingRows = collecting ? contributionRows.filter((c) => c.roundId === collecting.id) : [];
    return {
      ...toSummary(circle),
      feeBps: circle.feeBps,
      threshold: money(circle.thresholdValue),
      grantWeightBps: circle.grantWeightBps,
      approvalMode: circle.approvalMode,
      goal: money(circle.goalValue),
      roundsTotal: roundsTotal(circle),
      poolCollected: money(collectedValue(contributionRows)),
      poolWalletAddress: circle.poolWalletAddress,
      startedAt: circle.startedAt?.toISOString() ?? null,
      currentRound: roundRows.find((r) => ACTIVE_ROUND_STATES.includes(r.state))?.number ?? null,
      nextPayDate: collecting?.deadline.toISOString() ?? null,
      currentCollection: collecting
        ? {
            round: collecting.number,
            collected: money(collectedValue(collectingRows)),
            expected: money(expectedPerRound(circle)),
            paidMemberIds: collectingRows.filter((c) => c.status === "COMPLETED").map((c) => c.memberId),
          }
        : null,
      seats: seats.map((s) => ({
        memberId: s.memberId,
        displayName: displayName(s.fullName),
        payoutRound: s.payoutRound,
        collateral: amount(s.collateralValue, assetCode, assetScale),
        grantMode: s.grantMode ?? null,
        isApprover: s.isApprover,
      })),
      rounds: roundRows.map((r) => ({
        number: r.number,
        state: r.state,
        beneficiaryMemberId: r.beneficiaryMemberId,
        deadline: r.deadline.toISOString(),
        collected: money(collectedValue(contributionRows.filter((c) => c.roundId === r.id))),
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

    /** Creates an OPEN circle with its creator in the payout round they chose; the creator approves applicants. */
    async create(userId: string, input: CreateCircleInput): Promise<CircleDto> {
      if (input.payoutRound > input.size) throw invalidPayoutRound();
      const plan = planCircle(
        input.roundsTotal !== undefined
          ? { goal: input.goalValue, size: input.size, roundsTotal: input.roundsTotal }
          : { goal: input.goalValue, size: input.size, contribution: input.contributionValue },
      );
      const remote = await resolvePoolWallet();
      const id = await db.transaction(async (tx) => {
        const pool = await poolWalletId(tx, remote);
        const [circle] = await tx
          .insert(circles)
          .values({
            name: input.name,
            city: input.city,
            contributionValue: plan.contribution,
            goalValue: input.goalValue,
            // The pot's asset: every contribution is in the currency the pot wallet holds.
            assetCode: pool.assetCode,
            assetScale: pool.assetScale,
            feeBps: DEFAULT_FEE_BPS,
            thresholdValue: plan.contribution,
            grantWeightBps: DEFAULT_GRANT_WEIGHT_BPS,
            roundLengthDays: input.roundLengthDays,
            size: input.size,
            approvalMode: input.approvalMode,
            poolWalletId: pool.id,
            createdBy: userId,
          })
          .returning({ id: circles.id });
        if (!circle) throw new Error("Circle insert returned no row");
        await tx.insert(circleMembers).values({
          circleId: circle.id,
          userId,
          payoutRound: input.payoutRound,
          collateralValue: input.collateralValue,
          grantMode: input.grantMode,
          isApprover: true,
        });
        return circle.id;
      });
      return get(id);
    },
  };
}

export type CircleService = ReturnType<typeof createCircleService>;

export type CircleRow = typeof circles.$inferSelect;

const invalidPayoutRound = () =>
  new AppError(422, "INVALID_PAYOUT_ROUND", "Payout round must be between 1 and the circle size");

// Seat conflicts surface as unique violations; turn them into 409s the client can act on.
export function seatConflict(err: unknown): AppError | null {
  const constraint = uniqueViolation(err);
  if (constraint === "circle_members_circle_user_unique") {
    return new AppError(409, "ALREADY_MEMBER", "You already have a seat in this circle");
  }
  if (constraint === "circle_members_circle_payout_round_unique") {
    return new AppError(409, "SEAT_TAKEN", "That payout round is already taken");
  }
  return null;
}

/**
 * Seats an accepted applicant. The caller holds the circle row lock (FOR UPDATE), so seats
 * are counted one at a time. A preferred payout round that is taken falls back to the next
 * free one. Filling the last seat starts the circle; returns whether it did.
 */
export async function takeSeat(tx: Tx, circle: CircleRow, userId: string, seat: SeatRequest, now: Date): Promise<boolean> {
  if (circle.status !== "OPEN") throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");
  if (seat.payoutRound !== null && seat.payoutRound > circle.size) throw invalidPayoutRound();

  const taken = new Set(
    (await tx.select({ payoutRound: circleMembers.payoutRound }).from(circleMembers).where(eq(circleMembers.circleId, circle.id))).map(
      (m) => m.payoutRound,
    ),
  );
  if (taken.size >= circle.size) throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");
  const payoutRound =
    seat.payoutRound !== null && !taken.has(seat.payoutRound)
      ? seat.payoutRound
      : Array.from({ length: circle.size }, (_, i) => i + 1).find((n) => !taken.has(n));
  if (payoutRound === undefined) throw new Error("No free payout round in a circle with free seats");

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

  if (taken.size + 1 < circle.size) return false;
  await start(tx, circle, now);
  return true;
}

/** Creates one pending contribution per member for an opened round. Safe to repeat. */
export async function createRoundContributions(tx: Tx, circle: CircleRow, roundId: string): Promise<void> {
  const seats = await tx.select({ id: circleMembers.id }).from(circleMembers).where(eq(circleMembers.circleId, circle.id));
  await tx
    .insert(contributions)
    .values(
      seats.map((seat) => ({
        roundId,
        memberId: seat.id,
        value: circle.contributionValue,
        assetCode: circle.assetCode,
        assetScale: circle.assetScale,
        // Deterministic: the same round and member always map to the same key.
        idempotencyKey: `contribution:${roundId}:${seat.id}`,
      })),
    )
    .onConflictDoNothing({ target: contributions.idempotencyKey });
}

// The last seat is filled: schedule every round to the goal and open round 1. Same transaction as the seating.
async function start(tx: Tx, circle: CircleRow, now: Date): Promise<void> {
  await tx.update(circles).set({ status: "ACTIVE", startedAt: now }).where(eq(circles.id, circle.id));

  const created = await tx
    .insert(rounds)
    .values(
      Array.from({ length: roundsTotal(circle) }, (_, i) => i + 1).map((n) => ({
        circleId: circle.id,
        number: n,
        state: n === 1 ? ("COLLECTING" as const) : ("UPCOMING" as const),
        deadline: roundDeadline(now, circle.roundLengthDays, n),
        openedAt: n === 1 ? now : null,
      })),
    )
    .returning({ id: rounds.id, number: rounds.number });

  const first = created.find((r) => r.number === 1);
  if (!first) throw new Error("Round 1 missing after scheduling");
  // Everyone pays every round (pot = contribution × size per round).
  await createRoundContributions(tx, circle, first.id);
  await tx
    .insert(auditEvents)
    .values({ walletId: circle.poolWalletId, eventType: "circle.started", externalId: `circle.started:${circle.id}` });
}
