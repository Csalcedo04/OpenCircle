import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import { NOTIFICATION_KINDS, circleInvites, circles, friendships, notifications, users } from "../db/schema";
import { AppError } from "../errors/app-error";
import { inviteUrl, shownStatus, type InviteShownStatus } from "./circles/invite-access";
import { displayName } from "./display-name";

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  readAt: string | null;
  createdAt: string;
  /** Who caused it ("Ana G."); null if that account is gone. */
  actor: { userId: string; displayName: string } | null;
  /** FRIEND_REQUEST: the request to answer (see /api/friends/requests). */
  friendRequestId: string | null;
  /** CIRCLE_INVITE: the circle and the link that seats the user; `status` says if it is still usable. */
  invite: { id: string; circleId: string; circleName: string; inviteUrl: string; status: InviteShownStatus; expiresAt: string | null } | null;
}

export interface NotificationList {
  /** Unread notifications in total, not only among `items`. */
  unread: number;
  items: NotificationDto[];
}

const notFound = () => new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");

/**
 * What waits for a user in the app. Writers (`friendRequested`, `invited`) are idempotent per
 * source event and called after the event's own transaction committed; the readers are the
 * user's own list and read markers.
 */
export function createNotificationService({ db, frontendUrl, now = () => new Date() }: { db: Db; frontendUrl: string; now?: () => Date }) {
  const actor = alias(users, "actor");

  async function find(userId: string, where: ReturnType<typeof and>, limit: number): Promise<NotificationDto[]> {
    const at = now();
    const rows = await db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        actorId: actor.id,
        actorName: actor.fullName,
        friendshipId: notifications.friendshipId,
        invite: {
          id: circleInvites.id,
          circleId: circleInvites.circleId,
          token: circleInvites.token,
          status: circleInvites.status,
          expiresAt: circleInvites.expiresAt,
          maxUses: circleInvites.maxUses,
          uses: circleInvites.uses,
        },
        circleName: circles.name,
      })
      .from(notifications)
      .leftJoin(actor, eq(notifications.actorUserId, actor.id))
      .leftJoin(circleInvites, eq(notifications.inviteId, circleInvites.id))
      .leftJoin(circles, eq(circleInvites.circleId, circles.id))
      .where(and(eq(notifications.userId, userId), where))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      actor: r.actorId === null ? null : { userId: r.actorId, displayName: displayName(r.actorName) },
      friendRequestId: r.friendshipId,
      invite:
        r.invite === null || r.circleName === null
          ? null
          : {
              id: r.invite.id,
              circleId: r.invite.circleId,
              circleName: r.circleName,
              inviteUrl: inviteUrl(frontendUrl, r.invite.circleId, r.invite.token),
              status: shownStatus({ status: r.invite.status, expiresAt: r.invite.expiresAt, maxUses: r.invite.maxUses, uses: r.invite.uses }, at),
              expiresAt: r.invite.expiresAt?.toISOString() ?? null,
            },
    }));
  }

  async function unreadCount(userId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.n ?? 0;
  }

  return {
    /** The user's notifications, newest first, with how many are unread in total. */
    async list(userId: string, options: { unreadOnly?: boolean | undefined; limit?: number | undefined } = {}): Promise<NotificationList> {
      const where = options.unreadOnly ? isNull(notifications.readAt) : undefined;
      const [items, unread] = await Promise.all([find(userId, and(where), options.limit ?? 50), unreadCount(userId)]);
      return { unread, items };
    },

    async markRead(userId: string, id: string): Promise<NotificationDto> {
      // Reading twice is fine; a notification that isn't the user's doesn't exist for them.
      await db
        .update(notifications)
        .set({ readAt: now() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
      const [dto] = await find(userId, and(eq(notifications.id, id)), 1);
      if (!dto) throw notFound();
      return dto;
    },

    /** Marks everything unread as read; returns how many were. */
    async markAllRead(userId: string): Promise<number> {
      const updated = await db
        .update(notifications)
        .set({ readAt: now() })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
        .returning({ id: notifications.id });
      return updated.length;
    },

    /** Tells the addressee of a pending friend request. Once per request. */
    async friendRequested(friendshipId: string): Promise<void> {
      const [request] = await db
        .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId, status: friendships.status })
        .from(friendships)
        .where(eq(friendships.id, friendshipId))
        .limit(1);
      if (!request || request.status !== "PENDING") return;
      await db
        .insert(notifications)
        .values({ userId: request.addresseeId, kind: "FRIEND_REQUEST", actorUserId: request.requesterId, friendshipId })
        .onConflictDoNothing();
    },

    /** Tells each person a direct invite was made for, when they have an account. Once per invite. */
    async invited(inviteIds: readonly string[]): Promise<void> {
      if (inviteIds.length === 0) return;
      const rows = await db
        .select({ id: circleInvites.id, userId: circleInvites.userId, createdBy: circleInvites.createdBy })
        .from(circleInvites)
        .where(and(inArray(circleInvites.id, [...inviteIds]), eq(circleInvites.kind, "DIRECT")));
      const values = rows.flatMap((r) =>
        r.userId === null ? [] : [{ userId: r.userId, kind: "CIRCLE_INVITE" as const, actorUserId: r.createdBy, inviteId: r.id }],
      );
      if (values.length === 0) return;
      await db.insert(notifications).values(values).onConflictDoNothing();
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
