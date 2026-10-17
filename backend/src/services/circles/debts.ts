import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { auditEvents, circleMembers, contributions } from "../../db/schema";
import { AppError } from "../../errors/app-error";
import type { Tx } from "../wallet.service";

/**
 * A member's open debt: a contribution still FAILED whose default was recorded (missed after
 * they had received their round's pot, so the others bore it). Derived, no column: paying it
 * makes the contribution COMPLETED and the debt is gone.
 */
export const isOpenDebt = and(
  eq(contributions.status, "FAILED"),
  sql`exists (select 1 from ${auditEvents} where ${auditEvents.externalId} = 'score.defaulted:' || ${contributions.id}::text)`,
);

export async function openDebtCount(executor: Db | Tx, userId: string): Promise<number> {
  const [row] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(contributions)
    .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
    .where(and(eq(circleMembers.userId, userId), isOpenDebt));
  return row?.n ?? 0;
}

/** 409 DEBT_OUTSTANDING while the user owes their circles: no new circle, application or seat. */
export async function assertNoOpenDebt(executor: Db | Tx, userId: string): Promise<void> {
  const debts = await openDebtCount(executor, userId);
  if (debts > 0) {
    throw new AppError(409, "DEBT_OUTSTANDING", "Pay what you owe your circles before creating or joining another", { debts });
  }
}
