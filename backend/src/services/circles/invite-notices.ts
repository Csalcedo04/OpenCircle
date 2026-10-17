import { and, eq, gte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/client";
import { circleInvites, circles, users } from "../../db/schema";
import { displayName } from "../display-name";
import { deliverOnce, type Outgoing } from "../notifications/deliver";
import type { NotificationSender } from "../notifications/sender";
import { inviteUrl, usableAt } from "./invite-access";

/**
 * Emails each person a direct invite was made for, once per invite; failures are retried by
 * retryRecent (run by the scheduler tick). Codes are shared by hand, so nothing is sent for them.
 */
export function createInviteNotices({ db, sender, frontendUrl }: { db: Db; sender: NotificationSender; frontendUrl: string }) {
  const inviter = alias(users, "inviter");
  const invitee = alias(users, "invitee");

  /** Sends the invites among `inviteIds` that are direct and still usable. */
  async function created(inviteIds: readonly string[], now: Date = new Date()): Promise<number> {
    if (inviteIds.length === 0) return 0;
    const rows = await db
      .select({
        id: circleInvites.id,
        token: circleInvites.token,
        email: circleInvites.email,
        expiresAt: circleInvites.expiresAt,
        circleId: circles.id,
        circleName: circles.name,
        poolWalletId: circles.poolWalletId,
        inviterName: inviter.fullName,
        inviteeEmail: invitee.email,
      })
      .from(circleInvites)
      .innerJoin(circles, eq(circleInvites.circleId, circles.id))
      .innerJoin(inviter, eq(circleInvites.createdBy, inviter.id))
      .leftJoin(invitee, eq(circleInvites.userId, invitee.id))
      .where(and(inArray(circleInvites.id, [...inviteIds]), eq(circleInvites.kind, "DIRECT"), usableAt(now)));

    const items: Outgoing[] = [];
    for (const r of rows) {
      // Invited by email, or by user id: either way there is exactly one address to send to.
      const to = r.email ?? r.inviteeEmail;
      if (to === null) continue;
      items.push({
        key: `notification.sent:CIRCLE_INVITE:${r.id}:EMAIL`,
        walletId: r.poolWalletId,
        notification: {
          channel: "EMAIL",
          to,
          kind: "CIRCLE_INVITE",
          circleName: r.circleName,
          circleId: r.circleId,
          inviteId: r.id,
          inviterName: displayName(r.inviterName),
          inviteUrl: inviteUrl(frontendUrl, r.circleId, r.token),
          expiresAt: r.expiresAt,
        },
      });
    }
    return deliverOnce(db, sender, items);
  }

  return {
    created,

    /** Re-sends what failed for direct invites made since `since` that are still usable. */
    async retryRecent(since: Date): Promise<number> {
      const now = new Date();
      const recent = await db
        .select({ id: circleInvites.id })
        .from(circleInvites)
        .where(and(eq(circleInvites.kind, "DIRECT"), gte(circleInvites.createdAt, since), usableAt(now)));
      return created(
        recent.map((r) => r.id),
        now,
      );
    },
  };
}

export type InviteNotices = ReturnType<typeof createInviteNotices>;
