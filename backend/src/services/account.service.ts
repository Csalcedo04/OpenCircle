import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  CONTRIBUTION_STATUSES,
  ROUND_STATES,
  circleMembers,
  circles,
  contributions,
  creditProfiles,
  rounds,
  testClocks,
  users,
  walletGrants,
  wallets,
} from "../db/schema";
import { AppError } from "../errors/app-error";
import type { CircleStatus } from "./circle.service";
import type { Cadence } from "./circles/period-schedule";
import { icsFromStored } from "./credit/credit-score";
import { toInternalAccountDto, userAccountInTx, type InternalAccountDto } from "./ledger/internal-account.service";
import { movementsOf, type MovementDto } from "./ledger/ledger.service";
import { emptyRecord, memberRecords, type MemberRecord } from "./member.service";
import type { AmountDto } from "./wallet.service";

type RoundState = (typeof ROUND_STATES)[number];
type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/** The standing Open Payments grant: ACTIVE, REVOKED, or NONE if the user never gave one. */
export interface WalletAuthorizationDto {
  status: "ACTIVE" | "REVOKED" | "NONE";
  /** When the grant was given; null without one. */
  since: string | null;
}

export interface DashboardWalletDto {
  address: string;
  assetCode: string;
  assetScale: number;
  authorization: WalletAuthorizationDto;
}

export interface DashboardRoundDto {
  number: number;
  state: RoundState;
  startsAt: string;
  deadline: string;
  /** The user receives this round's pot. */
  mine: boolean;
  /** Contributions COMPLETED (verified against the pool's incoming payment). */
  verified: number;
  /** The user's own contribution; null before the round opens. */
  myStatus: ContributionStatus | null;
  myFailureCode: string | null;
}

export interface DashboardCircleDto {
  id: string;
  name: string;
  status: CircleStatus;
  cadence: Cadence;
  size: number;
  seatsTaken: number;
  contribution: AmountDto;
  /** Pot minus OpenCircle's fee. Expected, never guaranteed: release follows the round engine. */
  expectedPayout: AmountDto;
  /** Provisional (join order) while the circle is OPEN. */
  myPayoutRound: number;
  currentRound: number | null;
  /** Circle time: a test clock's frozen time, or real time. Dates in `rounds` are on this clock. */
  now: string;
  onTestClock: boolean;
  rounds: DashboardRoundDto[];
}

/** One of the user's contributions, as recorded by the period engine. */
export interface ActivityDto {
  /** Contribution id: the transaction reference. */
  id: string;
  type: "CONTRIBUTION";
  circleId: string;
  circleName: string;
  roundNumber: number;
  amount: AmountDto;
  status: ContributionStatus;
  failureCode: string | null;
  deadline: string;
  createdAt: string;
  requestedAt: string | null;
  completedAt: string | null;
  fromWallet: string | null;
  toWallet: string;
  incomingPaymentUrl: string | null;
  outgoingPaymentUrl: string | null;
}

export interface DashboardDto {
  /** External Open Payments wallet, if linked. */
  wallet: DashboardWalletDto | null;
  /** OpenCircle internal account, if created, with its latest movements (newest first). */
  internalAccount: (InternalAccountDto & { movements: MovementDto[] }) | null;
  ics: number | null;
  record: MemberRecord;
  /** COMPLETED contributions only, one entry per asset: amounts in different assets are never summed. */
  contributed: AmountDto[];
  circles: DashboardCircleDto[];
  /** Newest first. */
  activity: ActivityDto[];
}

const ACTIVE_ROUND_STATES: readonly RoundState[] = ["COLLECTING", "FUNDED", "RISK_CHECK", "BLOCKED", "PAYING_OUT"];
const ACTIVITY_LIMIT = 20;

const amount = (value: bigint, assetCode: string, assetScale: number): AmountDto => ({
  value: value.toString(),
  assetCode,
  assetScale,
});

/** Pot (contribution × size) less the fee in basis points, rounded down like the frontend calculator. */
export function expectedPayoutValue(contribution: bigint, size: number, feeBps: number): bigint {
  const pot = contribution * BigInt(size);
  return pot - (pot * BigInt(feeBps)) / 10_000n;
}

/** Read model for the account page. Reads only: it never changes a payment or round. */
export function createAccountService({ db, now = () => new Date() }: { db: Db; now?: () => Date }) {
  async function wallet(userId: string): Promise<{ wallet: DashboardWalletDto | null; ics: number | null }> {
    const [row] = await db
      .select({
        address: wallets.addressUrl,
        assetCode: wallets.assetCode,
        assetScale: wallets.assetScale,
        score: creditProfiles.internalCreditScore,
      })
      .from(users)
      .leftJoin(wallets, eq(users.opWallet, wallets.id))
      .leftJoin(creditProfiles, eq(creditProfiles.walletId, wallets.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new AppError(404, "PROFILE_NOT_FOUND", "User profile not found");
    if (row.address === null || row.assetCode === null || row.assetScale === null) return { wallet: null, ics: icsFromStored(row.score) };

    // Consenting again adds a grant; the newest one is the one in force.
    const [grant] = await db
      .select({ status: walletGrants.status, createdAt: walletGrants.createdAt })
      .from(walletGrants)
      .where(eq(walletGrants.userId, userId))
      .orderBy(desc(walletGrants.createdAt))
      .limit(1);
    const authorization: WalletAuthorizationDto = grant
      ? { status: grant.status === "ACTIVE" ? "ACTIVE" : "REVOKED", since: grant.createdAt.toISOString() }
      : { status: "NONE", since: null };
    return {
      wallet: { address: row.address, assetCode: row.assetCode, assetScale: row.assetScale, authorization },
      ics: icsFromStored(row.score),
    };
  }

  async function myCircles(userId: string): Promise<DashboardCircleDto[]> {
    const rows = await db
      .select({
        id: circles.id,
        name: circles.name,
        status: circles.status,
        cadence: circles.cadence,
        size: circles.size,
        contributionValue: circles.contributionValue,
        assetCode: circles.assetCode,
        assetScale: circles.assetScale,
        feeBps: circles.feeBps,
        frozenTime: testClocks.frozenTime,
        memberId: circleMembers.id,
        payoutRound: circleMembers.payoutRound,
        seatsTaken: sql<number>`(select count(*)::int from ${circleMembers} cm where cm.circle_id = ${circles.id})`,
      })
      .from(circles)
      .innerJoin(circleMembers, and(eq(circleMembers.circleId, circles.id), eq(circleMembers.userId, userId)))
      .leftJoin(testClocks, eq(circles.testClockId, testClocks.id))
      .orderBy(desc(circles.createdAt));
    if (rows.length === 0) return [];

    const roundRows = await db
      .select()
      .from(rounds)
      .where(
        inArray(
          rounds.circleId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(rounds.number));
    const counts =
      roundRows.length === 0
        ? []
        : await db
            .select({
              roundId: contributions.roundId,
              verified: sql<number>`count(*) filter (where ${contributions.status} = 'COMPLETED')::int`,
            })
            .from(contributions)
            .where(
              inArray(
                contributions.roundId,
                roundRows.map((r) => r.id),
              ),
            )
            .groupBy(contributions.roundId);
    const verifiedOf = new Map(counts.map((c) => [c.roundId, c.verified]));
    const mine = await db
      .select({ roundId: contributions.roundId, status: contributions.status, failureCode: contributions.failureCode })
      .from(contributions)
      .where(
        inArray(
          contributions.memberId,
          rows.map((r) => r.memberId),
        ),
      );
    const mineOf = new Map(mine.map((c) => [c.roundId, c]));

    return rows.map((c) => {
      const circleRounds = roundRows.filter((r) => r.circleId === c.id);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        cadence: c.cadence,
        size: c.size,
        seatsTaken: c.seatsTaken,
        contribution: amount(c.contributionValue, c.assetCode, c.assetScale),
        expectedPayout: amount(expectedPayoutValue(c.contributionValue, c.size, c.feeBps), c.assetCode, c.assetScale),
        myPayoutRound: c.payoutRound,
        currentRound: circleRounds.find((r) => ACTIVE_ROUND_STATES.includes(r.state))?.number ?? null,
        now: (c.frozenTime ?? now()).toISOString(),
        onTestClock: c.frozenTime !== null,
        rounds: circleRounds.map((r) => {
          const own = mineOf.get(r.id);
          return {
            number: r.number,
            state: r.state,
            startsAt: r.startsAt.toISOString(),
            deadline: r.deadline.toISOString(),
            mine: r.beneficiaryMemberId === c.memberId,
            verified: verifiedOf.get(r.id) ?? 0,
            myStatus: own?.status ?? null,
            myFailureCode: own?.failureCode ?? null,
          };
        }),
      };
    });
  }

  async function activity(userId: string): Promise<ActivityDto[]> {
    const rows = await db
      .select({
        id: contributions.id,
        circleId: circles.id,
        circleName: circles.name,
        roundNumber: rounds.number,
        value: contributions.value,
        assetCode: contributions.assetCode,
        assetScale: contributions.assetScale,
        status: contributions.status,
        failureCode: contributions.failureCode,
        deadline: rounds.deadline,
        createdAt: contributions.createdAt,
        requestedAt: contributions.requestedAt,
        completedAt: contributions.completedAt,
        toWallet: wallets.addressUrl,
        incomingPaymentUrl: contributions.incomingPaymentUrl,
        outgoingPaymentUrl: contributions.outgoingPaymentUrl,
      })
      .from(contributions)
      .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
      .innerJoin(rounds, eq(contributions.roundId, rounds.id))
      .innerJoin(circles, eq(rounds.circleId, circles.id))
      .innerJoin(wallets, eq(circles.poolWalletId, wallets.id))
      .where(eq(circleMembers.userId, userId))
      .orderBy(desc(sql`coalesce(${contributions.completedAt}, ${contributions.requestedAt}, ${contributions.createdAt})`))
      .limit(ACTIVITY_LIMIT);

    const [owner] = await db
      .select({ address: wallets.addressUrl })
      .from(users)
      .innerJoin(wallets, eq(users.opWallet, wallets.id))
      .where(eq(users.id, userId))
      .limit(1);

    return rows.map((r) => ({
      id: r.id,
      type: "CONTRIBUTION" as const,
      circleId: r.circleId,
      circleName: r.circleName,
      roundNumber: r.roundNumber,
      amount: amount(r.value, r.assetCode, r.assetScale),
      status: r.status,
      failureCode: r.failureCode,
      deadline: r.deadline.toISOString(),
      createdAt: r.createdAt.toISOString(),
      requestedAt: r.requestedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      fromWallet: owner?.address ?? null,
      toWallet: r.toWallet,
      incomingPaymentUrl: r.incomingPaymentUrl,
      outgoingPaymentUrl: r.outgoingPaymentUrl,
    }));
  }

  async function contributed(userId: string): Promise<AmountDto[]> {
    const rows = await db
      .select({
        assetCode: contributions.assetCode,
        assetScale: contributions.assetScale,
        total: sql<string>`sum(${contributions.value})::text`,
      })
      .from(contributions)
      .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
      .where(and(eq(circleMembers.userId, userId), eq(contributions.status, "COMPLETED")))
      .groupBy(contributions.assetCode, contributions.assetScale)
      .orderBy(asc(contributions.assetCode));
    return rows.map((r) => amount(BigInt(r.total), r.assetCode, r.assetScale));
  }

  return {
    async getDashboard(userId: string): Promise<DashboardDto> {
      const { wallet: linked, ics } = await wallet(userId);
      const [circleList, recent, totals, records, account] = await Promise.all([
        myCircles(userId),
        activity(userId),
        contributed(userId),
        memberRecords(db, [userId]),
        userAccountInTx(db, userId),
      ]);
      const internalAccount = account ? { ...toInternalAccountDto(account), movements: await movementsOf(db, account.id, ACTIVITY_LIMIT) } : null;
      return {
        wallet: linked,
        internalAccount,
        ics,
        record: records.get(userId) ?? emptyRecord(),
        contributed: totals,
        circles: circleList,
        activity: recent,
      };
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
