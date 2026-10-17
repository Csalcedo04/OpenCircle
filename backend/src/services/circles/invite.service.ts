import { and, desc, eq, getTableColumns, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/client";
import { auditEvents, circleInvites, circleMembers, circles, users } from "../../db/schema";
import { AppError } from "../../errors/app-error";
import type { CircleService, CircleSummaryDto } from "../circle.service";
import { displayName } from "../display-name";
import { findUserIdByEmail, profileVisibleTo } from "../user.service";
import type { Tx } from "../wallet.service";
import { circleNotFound, lockCircle, requireManager, type CircleRow } from "./circle-access";
import { inviteUrl, newInviteToken, shownStatus, usableAt, type InviteRow, type InviteShownStatus } from "./invite-access";
import type { InviteNotices } from "./invite-notices";
import type { NotificationService } from "../notification.service";

export type InviteStatus = InviteShownStatus;

interface InviteBase {
  id: string;
  circleId: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string | null;
  // "Ana G.", never the full legal name.
  createdByName: string;
}

/** A shareable link: anyone with it may join until it expires or runs out of uses. */
export interface CodeInviteDto extends InviteBase {
  kind: "CODE";
  inviteUrl: string;
  uses: number;
  maxUses: number | null;
}

/** For one person. The link is in their email and in their own invitations; managers never see it. */
export interface DirectInviteDto extends InviteBase {
  kind: "DIRECT";
  invitee: { userId: string | null; displayName: string | null; email: string | null };
}

export type InviteDto = CodeInviteDto | DirectInviteDto;

/** A direct invite as its addressee sees it. */
export interface MyInvitationDto {
  id: string;
  circle: CircleSummaryDto;
  invitedByName: string;
  expiresAt: string | null;
  createdAt: string;
  inviteUrl: string;
}

export type InviteTarget = { userId: string } | { email: string };

export type CreateInviteInput =
  | { kind: "CODE"; expiresInHours: number | null; maxUses: number | null }
  | { kind: "DIRECT"; targets: readonly InviteTarget[]; expiresInDays: number };

export interface InviteServiceDeps {
  db: Db;
  circles: Pick<CircleService, "summariesOf">;
  notices: Pick<InviteNotices, "created">;
  /** In-app notifications for invitees who have an account. */
  notifications: Pick<NotificationService, "invited">;
  frontendUrl: string;
  now?: () => Date;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const inviteNotFound = () => new AppError(404, "INVITE_NOT_FOUND", "Invite not found");
const notOpen = () => new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");

// Emails go out after the commit; a failure never fails the request (the tick retries them).
async function notify(send: () => Promise<number>): Promise<void> {
  await send().catch((err: unknown) => console.error("Invite notice failed", err instanceof Error ? err.name : "unknown"));
}

export function createInviteService({ db, circles: circleService, notices, notifications, frontendUrl, now = () => new Date() }: InviteServiceDeps) {
  const creator = alias(users, "creator");
  const invitee = alias(users, "invitee");

  type Row = InviteRow & { creatorName: string | null; inviteeName: string | null };

  const toDto = (r: Row, at: Date): InviteDto => {
    const base: InviteBase = {
      id: r.id,
      circleId: r.circleId,
      status: shownStatus(r, at),
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdByName: displayName(r.creatorName),
    };
    if (r.kind === "CODE") return { ...base, kind: "CODE", inviteUrl: inviteUrl(frontendUrl, r.circleId, r.token), uses: r.uses, maxUses: r.maxUses };
    return {
      ...base,
      kind: "DIRECT",
      invitee: { userId: r.userId, displayName: r.userId === null ? null : displayName(r.inviteeName), email: r.email },
    };
  };

  async function find(executor: Db | Tx, where: ReturnType<typeof and>): Promise<InviteDto[]> {
    const at = now();
    const rows = await executor
      .select({ ...getTableColumns(circleInvites), creatorName: creator.fullName, inviteeName: invitee.fullName })
      .from(circleInvites)
      .innerJoin(creator, eq(circleInvites.createdBy, creator.id))
      .leftJoin(invitee, eq(circleInvites.userId, invitee.id))
      .where(where)
      .orderBy(desc(circleInvites.createdAt));
    return rows.map((r) => toDto(r, at));
  }

  // The circle, for a manager; to anyone else it doesn't exist.
  async function managedCircle(circleId: string, userId: string): Promise<CircleRow> {
    const [circle] = await db.select().from(circles).where(eq(circles.id, circleId)).limit(1);
    if (!circle) throw circleNotFound();
    await requireManager(db, circle, userId);
    return circle;
  }

  interface Resolved {
    userId: string | null;
    email: string | null;
  }

  // A target as a row to insert: a visible user by id, or an email (with its account, if any).
  async function resolve(tx: Tx, inviterId: string, target: InviteTarget): Promise<Resolved> {
    if ("userId" in target) {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, target.userId), profileVisibleTo(tx, inviterId)))
        .limit(1);
      if (!user) throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found");
      return { userId: user.id, email: null };
    }
    return { userId: await findUserIdByEmail(tx, target.email), email: target.email };
  }

  async function createDirect(tx: Tx, circle: CircleRow, inviterId: string, targets: readonly InviteTarget[], expiresAt: Date): Promise<string[]> {
    const resolved: Resolved[] = [];
    for (const target of targets) {
      const r = await resolve(tx, inviterId, target);
      // The same person twice in one request is one invite.
      if (!resolved.some((x) => (r.userId !== null ? x.userId === r.userId : x.email === r.email))) resolved.push(r);
    }
    const userIds = resolved.map((r) => r.userId).filter((id): id is string => id !== null);
    const emails = resolved.map((r) => r.email).filter((e): e is string => e !== null);

    if (userIds.length > 0) {
      const [seated] = await tx
        .select({ id: circleMembers.id })
        .from(circleMembers)
        .where(and(eq(circleMembers.circleId, circle.id), inArray(circleMembers.userId, userIds)))
        .limit(1);
      if (seated) throw new AppError(409, "ALREADY_MEMBER", "That person already has a seat in this circle");
    }
    const [pending] = await tx
      .select({ id: circleInvites.id })
      .from(circleInvites)
      .where(
        and(
          eq(circleInvites.circleId, circle.id),
          eq(circleInvites.kind, "DIRECT"),
          usableAt(now()),
          or(userIds.length > 0 ? inArray(circleInvites.userId, userIds) : undefined, emails.length > 0 ? inArray(circleInvites.email, emails) : undefined),
        ),
      )
      .limit(1);
    if (pending) throw new AppError(409, "INVITE_PENDING", "That person already has a pending invitation");

    const inserted = await tx
      .insert(circleInvites)
      .values(resolved.map((r) => ({ circleId: circle.id, kind: "DIRECT" as const, token: newInviteToken(), createdBy: inviterId, userId: r.userId, email: r.email, expiresAt })))
      .returning({ id: circleInvites.id });
    return inserted.map((i) => i.id);
  }

  async function audit(tx: Tx, circle: CircleRow, event: "created" | "revoked", inviteIds: readonly string[]): Promise<void> {
    await tx
      .insert(auditEvents)
      .values(inviteIds.map((id) => ({ walletId: circle.poolWalletId, eventType: `invite.${event}`, externalId: `invite.${event}:${id}` })));
  }

  return {
    /** Creator or approver, while the circle is OPEN. Direct invites are emailed after the commit. */
    async create(userId: string, circleId: string, input: CreateInviteInput): Promise<InviteDto[]> {
      const ids = await db.transaction(async (tx) => {
        const circle = await lockCircle(tx, circleId);
        await requireManager(tx, circle, userId);
        if (circle.status !== "OPEN") throw notOpen();
        const at = now();
        let created: string[];
        if (input.kind === "CODE") {
          const expiresAt = input.expiresInHours === null ? null : new Date(at.getTime() + input.expiresInHours * HOUR);
          const [row] = await tx
            .insert(circleInvites)
            .values({ circleId, kind: "CODE", token: newInviteToken(), createdBy: userId, expiresAt, maxUses: input.maxUses })
            .returning({ id: circleInvites.id });
          created = row ? [row.id] : [];
        } else {
          created = await createDirect(tx, circle, userId, input.targets, new Date(at.getTime() + input.expiresInDays * DAY));
        }
        await audit(tx, circle, "created", created);
        return created;
      });
      if (input.kind === "DIRECT") {
        await notify(() => notices.created(ids));
        await notifications.invited(ids).catch((err: unknown) => console.error("Invite notification failed", err instanceof Error ? err.name : "unknown"));
      }
      return find(db, and(inArray(circleInvites.id, ids)));
    },

    /** The circle's invites, newest first; creator or approver only. */
    async list(userId: string, circleId: string, status?: InviteStatus | undefined): Promise<InviteDto[]> {
      await managedCircle(circleId, userId);
      const invites = await find(db, and(eq(circleInvites.circleId, circleId)));
      return status === undefined ? invites : invites.filter((i) => i.status === status);
    },

    /** Stops an active invite (a code or a direct one). Creator or approver. */
    async revoke(userId: string, circleId: string, inviteId: string): Promise<InviteDto> {
      await db.transaction(async (tx) => {
        const circle = await lockCircle(tx, circleId);
        await requireManager(tx, circle, userId);
        const [invite] = await tx
          .select({ id: circleInvites.id, status: circleInvites.status })
          .from(circleInvites)
          .where(and(eq(circleInvites.id, inviteId), eq(circleInvites.circleId, circleId)))
          .for("update");
        if (!invite) throw inviteNotFound();
        if (invite.status !== "ACTIVE") throw new AppError(409, "INVITE_NOT_ACTIVE", "This invitation is no longer active");
        await tx.update(circleInvites).set({ status: "REVOKED" }).where(eq(circleInvites.id, inviteId));
        await audit(tx, circle, "revoked", [inviteId]);
      });
      const [dto] = await find(db, and(eq(circleInvites.id, inviteId)));
      if (!dto) throw inviteNotFound();
      return dto;
    },

    /** Usable direct invites addressed to the user, by id or by the email on their profile. */
    async listMine(userId: string): Promise<MyInvitationDto[]> {
      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (!me) return [];
      const at = now();
      const rows = await db
        .select({ ...getTableColumns(circleInvites), creatorName: creator.fullName })
        .from(circleInvites)
        .innerJoin(creator, eq(circleInvites.createdBy, creator.id))
        .where(
          and(
            eq(circleInvites.kind, "DIRECT"),
            usableAt(at),
            or(eq(circleInvites.userId, userId), and(isNull(circleInvites.userId), eq(circleInvites.email, me.email))),
          ),
        )
        .orderBy(desc(circleInvites.createdAt));
      const summaries = new Map((await circleService.summariesOf(rows.map((r) => r.circleId))).map((c) => [c.id, c]));
      const mine: MyInvitationDto[] = [];
      for (const r of rows) {
        const circle = summaries.get(r.circleId);
        if (!circle) continue;
        mine.push({
          id: r.id,
          circle,
          invitedByName: displayName(r.creatorName),
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          inviteUrl: inviteUrl(frontendUrl, r.circleId, r.token),
        });
      }
      return mine;
    },
  };
}

export type InviteService = ReturnType<typeof createInviteService>;
