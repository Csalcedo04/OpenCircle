import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import { uniqueViolation } from "../db/errors";
import { friendships, users } from "../db/schema";
import { AppError } from "../errors/app-error";
import { displayName } from "./display-name";
import type { NotificationService } from "./notification.service";
import { findUserIdByEmail, profileVisibleTo } from "./user.service";

export interface PersonDto {
  userId: string;
  // "Ana G.", never the full legal name.
  displayName: string;
}

export interface FriendDto extends PersonDto {
  since: string;
}

export interface FriendRequestDto {
  id: string;
  from: PersonDto;
  to: PersonDto;
  createdAt: string;
}

export type FriendTarget = { userId: string } | { email: string };

const requestNotFound = () => new AppError(404, "FRIEND_REQUEST_NOT_FOUND", "Friend request not found");

/**
 * Friends: one row per pair of users, PENDING until the addressee accepts. Rejecting, withdrawing
 * or removing deletes the row, so a new request can follow. Nobody is told who declined.
 */
export interface FriendServiceDeps {
  db: Db;
  notifications: Pick<NotificationService, "friendRequested">;
}

export function createFriendService({ db, notifications }: FriendServiceDeps) {
  const requester = alias(users, "requester");
  const addressee = alias(users, "addressee");

  const rowsFor = (userId: string) =>
    db
      .select({
        id: friendships.id,
        status: friendships.status,
        acceptedAt: friendships.acceptedAt,
        createdAt: friendships.createdAt,
        requesterId: requester.id,
        requesterName: requester.fullName,
        addresseeId: addressee.id,
        addresseeName: addressee.fullName,
      })
      .from(friendships)
      .innerJoin(requester, eq(friendships.requesterId, requester.id))
      .innerJoin(addressee, eq(friendships.addresseeId, addressee.id))
      .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
      .orderBy(desc(friendships.createdAt));

  type Row = Awaited<ReturnType<typeof rowsFor>>[number];

  const toRequest = (r: Row): FriendRequestDto => ({
    id: r.id,
    from: { userId: r.requesterId, displayName: displayName(r.requesterName) },
    to: { userId: r.addresseeId, displayName: displayName(r.addresseeName) },
    createdAt: r.createdAt.toISOString(),
  });

  const toFriend = (r: Row, userId: string): FriendDto => {
    const other = r.requesterId === userId ? { userId: r.addresseeId, name: r.addresseeName } : { userId: r.requesterId, name: r.requesterName };
    return { userId: other.userId, displayName: displayName(other.name), since: (r.acceptedAt ?? r.createdAt).toISOString() };
  };

  // The pair's row, whichever direction, or null.
  async function pairRow(a: string, b: string) {
    const [row] = await db
      .select({ id: friendships.id, status: friendships.status })
      .from(friendships)
      .where(or(and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)), and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a))))
      .limit(1);
    return row ?? null;
  }

  // Who the request is for: a visible user by id, or whoever holds the email.
  async function resolveTarget(userId: string, target: FriendTarget): Promise<string> {
    if ("userId" in target) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, target.userId), profileVisibleTo(db, userId)))
        .limit(1);
      if (!user) throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found");
      return user.id;
    }
    const id = await findUserIdByEmail(db, target.email);
    if (id === null) throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found");
    return id;
  }

  return {
    async list(userId: string): Promise<FriendDto[]> {
      const rows = await rowsFor(userId);
      return rows.filter((r) => r.status === "ACCEPTED").map((r) => toFriend(r, userId));
    },

    async requests(userId: string): Promise<{ incoming: FriendRequestDto[]; outgoing: FriendRequestDto[] }> {
      const pending = (await rowsFor(userId)).filter((r) => r.status === "PENDING");
      return {
        incoming: pending.filter((r) => r.addresseeId === userId).map(toRequest),
        outgoing: pending.filter((r) => r.requesterId === userId).map(toRequest),
      };
    },

    /** Asks someone to be friends. A request the other way round is already pending: answer it instead. */
    async request(userId: string, target: FriendTarget): Promise<FriendRequestDto> {
      const addresseeId = await resolveTarget(userId, target);
      if (addresseeId === userId) throw new AppError(422, "CANNOT_FRIEND_SELF", "You can't send yourself a friend request");
      const existing = await pairRow(userId, addresseeId);
      if (existing?.status === "ACCEPTED") throw new AppError(409, "ALREADY_FRIENDS", "You are already friends");
      if (existing) throw new AppError(409, "FRIEND_REQUEST_PENDING", "A friend request between you is already pending");

      let id: string;
      try {
        const [row] = await db.insert(friendships).values({ requesterId: userId, addresseeId }).returning({ id: friendships.id });
        if (!row) throw new Error("Friend request insert returned no row");
        id = row.id;
      } catch (err) {
        // Two requests crossing at once: the first one wins.
        if (uniqueViolation(err) === "friendships_pair_unique") {
          throw new AppError(409, "FRIEND_REQUEST_PENDING", "A friend request between you is already pending");
        }
        throw err;
      }
      // The request stands even if telling the addressee fails; they still see it in their list.
      await notifications.friendRequested(id).catch((err: unknown) => console.error("Friend request notification failed", err instanceof Error ? err.name : "unknown"));
      const request = (await rowsFor(userId)).find((r) => r.id === id);
      if (!request) throw requestNotFound();
      return toRequest(request);
    },

    /** The addressee accepts. */
    async accept(userId: string, requestId: string): Promise<FriendDto> {
      const [updated] = await db
        .update(friendships)
        .set({ status: "ACCEPTED", acceptedAt: new Date() })
        .where(and(eq(friendships.id, requestId), eq(friendships.addresseeId, userId), eq(friendships.status, "PENDING")))
        .returning({ id: friendships.id });
      if (!updated) throw requestNotFound();
      const row = (await rowsFor(userId)).find((r) => r.id === requestId);
      if (!row) throw requestNotFound();
      return toFriend(row, userId);
    },

    /** The addressee rejects, or the requester withdraws: either way the request is gone. */
    async cancel(userId: string, requestId: string): Promise<void> {
      const deleted = await db
        .delete(friendships)
        .where(
          and(eq(friendships.id, requestId), eq(friendships.status, "PENDING"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))),
        )
        .returning({ id: friendships.id });
      if (deleted.length === 0) throw requestNotFound();
    },

    /** Either friend ends the friendship. */
    async remove(userId: string, friendId: string): Promise<void> {
      const deleted = await db
        .delete(friendships)
        .where(
          and(
            eq(friendships.status, "ACCEPTED"),
            or(
              and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, friendId)),
              and(eq(friendships.requesterId, friendId), eq(friendships.addresseeId, userId)),
            ),
          ),
        )
        .returning({ id: friendships.id });
      if (deleted.length === 0) throw new AppError(404, "FRIEND_NOT_FOUND", "Friend not found");
    },
  };
}

export type FriendService = ReturnType<typeof createFriendService>;
