import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { auditEvents, circleInvites, circleMembers } from "../../db/schema";
import { sameSecret } from "../secret-compare";
import type { Tx } from "../wallet.service";

// Low-level invite rules shared by the circle service (see, join) and the invite service.

export type InviteRow = typeof circleInvites.$inferSelect;
/** What the API shows: a stored status, or EXPIRED for an ACTIVE invite that is past its date or uses. */
export type InviteShownStatus = InviteRow["status"] | "EXPIRED";

// 32 random bytes: unguessable, and short enough for a link.
export const newInviteToken = () => randomBytes(32).toString("base64url");

// Spanish is the default locale; the frontend redirects to the visitor's language.
export function inviteUrl(frontendUrl: string, circleId: string, token: string): string {
  const url = new URL(`/es/circles/${circleId}`, frontendUrl);
  url.searchParams.set("invite", token);
  return url.toString();
}

/** SQL: an invite that can still be used at `now`. */
export const usableAt = (now: Date) =>
  and(
    eq(circleInvites.status, "ACTIVE"),
    or(isNull(circleInvites.expiresAt), gt(circleInvites.expiresAt, now)),
    or(isNull(circleInvites.maxUses), lt(circleInvites.uses, circleInvites.maxUses)),
  );

/** Pure: the status the API shows for an invite. */
export function shownStatus(invite: Pick<InviteRow, "status" | "expiresAt" | "maxUses" | "uses">, now: Date): InviteShownStatus {
  if (invite.status !== "ACTIVE") return invite.status;
  if (invite.expiresAt !== null && invite.expiresAt <= now) return "EXPIRED";
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "EXPIRED";
  return "ACTIVE";
}

/** Pure: whether a user may join with this invite. Codes are for anyone; direct invites for their addressee. */
export function addressedTo(invite: Pick<InviteRow, "kind" | "userId" | "email">, user: { id: string; email: string }): boolean {
  if (invite.kind === "CODE") return true;
  return invite.userId !== null ? invite.userId === user.id : invite.email === user.email.toLowerCase();
}

/**
 * The circle's usable invite matching the given token, or null. Tokens are compared in constant
 * time against each candidate (a circle has few invites), never looked up by equality.
 */
export async function matchedInvite(executor: Db | Tx, circleId: string, given: string | undefined, now: Date): Promise<InviteRow | null> {
  if (given === undefined) return null;
  const candidates = await executor
    .select()
    .from(circleInvites)
    .where(and(eq(circleInvites.circleId, circleId), usableAt(now)));
  return candidates.find((invite) => sameSecret(given, invite.token)) ?? null;
}

/** The newest usable standing code (no expiry, no use limit), or null. */
export async function standingCodeOf(executor: Db | Tx, circleId: string, now: Date): Promise<string | null> {
  const [row] = await executor
    .select({ token: circleInvites.token })
    .from(circleInvites)
    .where(and(eq(circleInvites.circleId, circleId), eq(circleInvites.kind, "CODE"), isNull(circleInvites.expiresAt), isNull(circleInvites.maxUses), usableAt(now)))
    .orderBy(desc(circleInvites.createdAt))
    .limit(1);
  return row?.token ?? null;
}

export async function insertStandingCode(tx: Tx, circleId: string, createdBy: string): Promise<void> {
  await tx.insert(circleInvites).values({ circleId, kind: "CODE", token: newInviteToken(), createdBy });
}

/** Records a join made with an invite: a code counts a use, a direct invite is accepted by the new seat. */
export async function consumeInvite(tx: Tx, invite: InviteRow, circle: { id: string; poolWalletId: string }, userId: string): Promise<void> {
  if (invite.kind === "CODE") {
    await tx
      .update(circleInvites)
      .set({ uses: sql`${circleInvites.uses} + 1` })
      .where(eq(circleInvites.id, invite.id));
    return;
  }
  const [seat] = await tx
    .select({ id: circleMembers.id })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circle.id), eq(circleMembers.userId, userId)));
  if (!seat) throw new Error("Seat missing after join");
  await tx.update(circleInvites).set({ status: "ACCEPTED", userId, acceptedMemberId: seat.id }).where(eq(circleInvites.id, invite.id));
  await tx.insert(auditEvents).values({ walletId: circle.poolWalletId, eventType: "invite.accepted", externalId: `invite.accepted:${invite.id}` });
}
