import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../../db/client";
import { CONTRIBUTION_STATUSES, auditEvents, circleMembers, contributions, rounds, users } from "../../db/schema";
import { applyScoreChange } from "../credit/credit-profile";
import { roundScoreChange, type RoundPaymentSummary } from "../credit/credit-score";

const DAY_MS = 86_400_000;
const LATE_GRACE_DAYS = 14;
const BEFORE_NEXT_CYCLE_DAYS = 5;

export type PaymentOutcome = "ON_TIME" | "LATE" | "MISSED";
type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

// One contribution is one expected payment of the member in that round.
const SUMMARIES: Record<PaymentOutcome, RoundPaymentSummary> = {
  ON_TIME: { expectedPayments: 1, paidOnTime: 1, paidLate: 0, missedPayments: 0 },
  LATE: { expectedPayments: 1, paidOnTime: 0, paidLate: 1, missedPayments: 0 },
  MISSED: { expectedPayments: 1, paidOnTime: 0, paidLate: 0, missedPayments: 1 },
};

/** Score change of one contribution's outcome (+5 on time, −4 late, −15 missed with the default config). */
export const outcomeChange = (outcome: PaymentOutcome): number => roundScoreChange(SUMMARIES[outcome]);

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
    const undo = recorded.has("MISSED") ? outcomeChange("MISSED") : 0;
    return { outcome, change: outcomeChange(outcome) - undo };
  }
  if (recorded.size > 0 || now.getTime() < c.penaltyAt.getTime()) return null;
  return { outcome: "MISSED", change: outcomeChange("MISSED") };
}

const externalId = (outcome: PaymentOutcome, contributionId: string) => `score.${outcome.toLowerCase()}:${contributionId}`;

/** Applies payment outcomes of a circle's contributions to each member's score (ICS), once each. */
export function createScoring({ db }: { db: Db }) {
  return {
    /** At circle time `now`. Safe to repeat or to run twice at once: each outcome is recorded once. */
    async scoreCircle(circleId: string, now: Date): Promise<number> {
      const roundRows = await db
        .select({ number: rounds.number, deadline: rounds.deadline })
        .from(rounds)
        .where(eq(rounds.circleId, circleId));
      const deadlineOf = new Map(roundRows.map((r) => [r.number, r.deadline]));

      const rows = await db
        .select({
          id: contributions.id,
          status: contributions.status,
          completedAt: contributions.completedAt,
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

      const ids = rows.flatMap((r) => (["ON_TIME", "LATE", "MISSED"] as const).map((o) => externalId(o, r.id)));
      const done = new Set(
        (await db.select({ id: auditEvents.externalId }).from(auditEvents).where(inArray(auditEvents.externalId, ids))).map((e) => e.id),
      );

      let applied = 0;
      for (const r of rows) {
        const { walletId } = r;
        if (walletId === null) continue;
        const recorded = new Set((["ON_TIME", "LATE", "MISSED"] as const).filter((o) => done.has(externalId(o, r.id))));
        const action = scoreAction(
          { ...r, penaltyAt: penaltyAt(r.deadline, deadlineOf.get(r.roundNumber + 1) ?? null) },
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
