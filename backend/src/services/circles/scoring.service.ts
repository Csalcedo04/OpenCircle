import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../../db/client";
import { CONTRIBUTION_STATUSES, auditEvents, circleMembers, contributions, rounds, users } from "../../db/schema";
import { applyScoreChange } from "../credit/credit-profile";
import { roundScoreChange, type RoundPaymentSummary } from "../credit/credit-score";

const DAY_MS = 86_400_000;
const LATE_GRACE_DAYS = 14;
const BEFORE_NEXT_CYCLE_DAYS = 5;

// DEFAULTED: missed after the member already received their round's pot, so the debt can't be
// netted from it and the others bear it.
export type PaymentOutcome = "ON_TIME" | "LATE" | "MISSED" | "DEFAULTED";
const OUTCOMES: readonly PaymentOutcome[] = ["ON_TIME", "LATE", "MISSED", "DEFAULTED"];
// On top of the missed payment's penalty; the score never goes below 0 (clampScore).
const DEFAULTED_EXTRA_PENALTY = 35;
type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

// One contribution is one expected payment of the member in that round.
const SUMMARIES: Record<Exclude<PaymentOutcome, "DEFAULTED">, RoundPaymentSummary> = {
  ON_TIME: { expectedPayments: 1, paidOnTime: 1, paidLate: 0, missedPayments: 0 },
  LATE: { expectedPayments: 1, paidOnTime: 0, paidLate: 1, missedPayments: 0 },
  MISSED: { expectedPayments: 1, paidOnTime: 0, paidLate: 0, missedPayments: 1 },
};

/** Score change of one contribution's outcome (+5 on time, −4 late, −15 missed, −50 defaulted with the default config). */
export const outcomeChange = (outcome: PaymentOutcome): number =>
  outcome === "DEFAULTED" ? roundScoreChange(SUMMARIES.MISSED) - DEFAULTED_EXTRA_PENALTY : roundScoreChange(SUMMARIES[outcome]);

/**
 * PER_ROUND: whether missing a payment in `roundNumber` hurts the others for good. Misses before
 * the member's own round are netted from their pot (and in it, their pot is just smaller); after
 * it, they have been paid already. END circles (no own round) never default.
 */
export const defaultable = (roundNumber: number, ownRound: number | null): boolean => ownRound !== null && ownRound < roundNumber;

/**
 * When an unpaid contribution counts as missed: 14 days after the deadline or 5 days before
 * the next cycle's deadline, whichever comes first, never before the deadline. The last
 * round has no next cycle and gets the 14 days.
 */
export function penaltyAt(deadline: Date, nextDeadline: Date | null): Date {
  const grace = deadline.getTime() + LATE_GRACE_DAYS * DAY_MS;
  const beforeNext = nextDeadline ? nextDeadline.getTime() - BEFORE_NEXT_CYCLE_DAYS * DAY_MS : grace;
  return new Date(Math.max(deadline.getTime(), Math.min(grace, beforeNext)));
}

export interface ScoredContribution {
  status: ContributionStatus;
  completedAt: Date | null;
  deadline: Date;
  penaltyAt: Date;
  /** See `defaultable`: a miss then counts as DEFAULTED. */
  defaultable: boolean;
}

/**
 * Pure: the outcome to record for a contribution now, and the score change it carries, given
 * the outcomes already recorded for it. A missed payment paid afterwards is re-scored as late:
 * the change then undoes the miss. Null when there is nothing (more) to apply.
 */
export function scoreAction(
  c: ScoredContribution,
  recorded: ReadonlySet<PaymentOutcome>,
  now: Date,
): { outcome: PaymentOutcome; change: number } | null {
  if (c.status === "CANCELLED") return null;
  if (c.status === "COMPLETED" && c.completedAt) {
    const outcome: PaymentOutcome = c.completedAt.getTime() <= c.deadline.getTime() ? "ON_TIME" : "LATE";
    if (recorded.has("ON_TIME") || recorded.has("LATE")) return null;
    const missed = (["DEFAULTED", "MISSED"] as const).find((o) => recorded.has(o));
    return { outcome, change: outcomeChange(outcome) - (missed ? outcomeChange(missed) : 0) };
  }
  if (recorded.size > 0 || now.getTime() < c.penaltyAt.getTime()) return null;
  const outcome: PaymentOutcome = c.defaultable ? "DEFAULTED" : "MISSED";
  return { outcome, change: outcomeChange(outcome) };
}

const externalId = (outcome: PaymentOutcome, contributionId: string) => `score.${outcome.toLowerCase()}:${contributionId}`;

/** Applies payment outcomes of a circle's contributions to each member's score (ICS), once each. */
export function createScoring({ db }: { db: Db }) {
  return {
    /** At circle time `now`. Safe to repeat or to run twice at once: each outcome is recorded once. */
    async scoreCircle(circleId: string, now: Date): Promise<number> {
      const roundRows = await db
        .select({ number: rounds.number, deadline: rounds.deadline, beneficiaryMemberId: rounds.beneficiaryMemberId })
        .from(rounds)
        .where(eq(rounds.circleId, circleId));
      const deadlineOf = new Map(roundRows.map((r) => [r.number, r.deadline]));
      const ownRoundOf = new Map(roundRows.flatMap((r) => (r.beneficiaryMemberId ? [[r.beneficiaryMemberId, r.number] as const] : [])));

      const rows = await db
        .select({
          id: contributions.id,
          status: contributions.status,
          completedAt: contributions.completedAt,
          memberId: contributions.memberId,
          roundNumber: rounds.number,
          deadline: rounds.deadline,
          walletId: users.opWallet,
        })
        .from(contributions)
        .innerJoin(rounds, eq(contributions.roundId, rounds.id))
        .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
        .innerJoin(users, eq(circleMembers.userId, users.id))
        .where(and(eq(rounds.circleId, circleId), ne(rounds.state, "UPCOMING")));
      if (rows.length === 0) return 0;

      const ids = rows.flatMap((r) => OUTCOMES.map((o) => externalId(o, r.id)));
      const done = new Set(
        (await db.select({ id: auditEvents.externalId }).from(auditEvents).where(inArray(auditEvents.externalId, ids))).map((e) => e.id),
      );

      let applied = 0;
      for (const r of rows) {
        const { walletId } = r;
        if (walletId === null) continue;
        const recorded = new Set(OUTCOMES.filter((o) => done.has(externalId(o, r.id))));
        const action = scoreAction(
          {
            ...r,
            penaltyAt: penaltyAt(r.deadline, deadlineOf.get(r.roundNumber + 1) ?? null),
            defaultable: defaultable(r.roundNumber, ownRoundOf.get(r.memberId) ?? null),
          },
          recorded,
          now,
        );
        if (!action) continue;

        await db.transaction(async (tx) => {
          // The audit row is the once-only guard: a concurrent run loses the insert and applies nothing.
          const [claimed] = await tx
            .insert(auditEvents)
            .values({ walletId, eventType: `score.${action.outcome.toLowerCase()}`, externalId: externalId(action.outcome, r.id) })
            .onConflictDoNothing({ target: auditEvents.externalId })
            .returning({ id: auditEvents.id });
          if (!claimed) return;
          await applyScoreChange(tx, walletId, action.change);
          applied++;
        });
      }
      return applied;
    },
  };
}

export type ScoringService = ReturnType<typeof createScoring>;
