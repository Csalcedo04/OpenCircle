import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { circleMembers, circles } from "../../db/schema";
import { AppError } from "../../errors/app-error";
import type { Tx } from "../wallet.service";

// Lookups shared by the circle, application and invite services. To anyone who may not see a
// circle it doesn't exist (404), and members without a role get 403.

export type CircleRow = typeof circles.$inferSelect;

export interface Membership {
  id: string;
  isApprover: boolean;
}

export const circleNotFound = () => new AppError(404, "CIRCLE_NOT_FOUND", "Circle not found");

export async function membership(executor: Db | Tx, circleId: string, userId: string): Promise<Membership | null> {
  const [member] = await executor
    .select({ id: circleMembers.id, isApprover: circleMembers.isApprover })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)));
  return member ?? null;
}

/** The circle row, locked FOR UPDATE so seats, invites and applications change one at a time. */
export async function lockCircle(tx: Tx, circleId: string): Promise<CircleRow> {
  const [circle] = await tx.select().from(circles).where(eq(circles.id, circleId)).for("update");
  if (!circle) throw circleNotFound();
  return circle;
}

/**
 * The caller's seat when they manage the circle: its creator or an approver. A non-member can't
 * tell the circle exists (404); a plain member gets 403.
 */
export async function requireManager(executor: Db | Tx, circle: Pick<CircleRow, "id" | "createdBy">, userId: string): Promise<Membership> {
  const member = await membership(executor, circle.id, userId);
  if (!member) throw circleNotFound();
  if (circle.createdBy !== userId && !member.isApprover) {
    throw new AppError(403, "NOT_APPROVER", "Only the circle's creator or approvers can do this");
  }
  return member;
}
