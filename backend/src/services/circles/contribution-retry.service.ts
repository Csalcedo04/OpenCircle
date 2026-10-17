import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { CONTRIBUTION_STATUSES, auditEvents, circleMembers, circles, contributions, rounds, testClocks } from "../../db/schema";
import { AppError } from "../../errors/app-error";

type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

const RETRYABLE_FAILURE_CODES = new Set<string>(["PAYMENT_REFUSED", "QUOTE_FAILED", "NO_GRANT"]);

export interface ContributionRetryResult {
  contributionId: string;
  status: ContributionStatus;
  failureCode: string | null;
}

export interface ContributionRetryDeps {
  db: Db;
  run: (circleId: string) => Promise<void>;
  now?: () => Date;
}

const notFound = () => new AppError(404, "CONTRIBUTION_NOT_FOUND", "Contribution not found");
const notAllowed = () => new AppError(409, "RETRY_NOT_ALLOWED", "This contribution cannot be retried");

/**
 * Retries a member's failed contribution while its round is still COLLECTING and before the
 * deadline. Resets FAILED → PENDING (compare-and-set), clearing failureCode, quoteUrl and
 * outgoingPaymentUrl while keeping incomingPaymentUrl and idempotencyKey intact so the pool's
 * incoming payment acts as the overpayment guard and open() never creates a duplicate row.
 */
export function createContributionRetry({ db, run, now = () => new Date() }: ContributionRetryDeps) {
  return {
    async retry(userId: string, contributionId: string): Promise<ContributionRetryResult> {
      const [row] = await db
        .select({
          id: contributions.id,
          status: contributions.status,
          failureCode: contributions.failureCode,
          value: contributions.value,
          roundState: rounds.state,
          deadline: rounds.deadline,
          circleId: circles.id,
          poolWalletId: circles.poolWalletId,
          frozenTime: testClocks.frozenTime,
        })
        .from(contributions)
        .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
        .innerJoin(rounds, eq(contributions.roundId, rounds.id))
        .innerJoin(circles, eq(rounds.circleId, circles.id))
        .leftJoin(testClocks, eq(circles.testClockId, testClocks.id))
        .where(and(eq(contributions.id, contributionId), eq(circleMembers.userId, userId)))
        .limit(1);

      if (!row) throw notFound();

      const circleTime = row.frozenTime ?? now();
      if (
        row.status !== "FAILED" ||
        row.failureCode === null ||
        !RETRYABLE_FAILURE_CODES.has(row.failureCode) ||
        row.roundState !== "COLLECTING" ||
        circleTime.getTime() >= row.deadline.getTime()
      ) {
        throw notAllowed();
      }

      const [reset] = await db
        .update(contributions)
        .set({
          status: "PENDING",
          failureCode: null,
          outgoingPaymentUrl: null,
          quoteUrl: null,
        })
        .where(and(eq(contributions.id, contributionId), eq(contributions.status, "FAILED")))
        .returning({ id: contributions.id });

      if (!reset) throw notAllowed();

      await db
        .insert(auditEvents)
        .values({
          walletId: row.poolWalletId,
          eventType: "contribution.retried",
          externalId: `contribution.retried:${contributionId}:${Date.now()}`,
          amount: row.value,
        })
        .onConflictDoNothing({ target: auditEvents.externalId });

      await run(row.circleId);

      const [updated] = await db
        .select({ status: contributions.status, failureCode: contributions.failureCode })
        .from(contributions)
        .where(eq(contributions.id, contributionId))
        .limit(1);

      return {
        contributionId,
        status: updated?.status ?? "PENDING",
        failureCode: updated?.failureCode ?? null,
      };
    },
  };
}

export type ContributionRetryService = ReturnType<typeof createContributionRetry>;
