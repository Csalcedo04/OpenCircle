import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { uniqueViolation } from "../../db/errors";
import {
  APPLICATION_STATUSES,
  VOTE_DECISIONS,
  applicationVotes,
  auditEvents,
  circleApplications,
  circleMembers,
  circles,
  creditProfiles,
  users,
  wallets,
} from "../../db/schema";
import { AppError } from "../../errors/app-error";
import type { CircleDto, CircleService, SeatInput } from "../circle.service";
import { publicProfileColumns, toPublicProfile, type PublicProfileDto } from "../user.service";
import type { Tx } from "../wallet.service";
import type { ApplicationNotices } from "./application-notices";

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type VoteDecision = (typeof VOTE_DECISIONS)[number];

export interface ApplicationDto {
  id: string;
  status: ApplicationStatus;
  // Name, wallet and ICS only: what members need to accept or reject the applicant.
  applicant: PublicProfileDto;
  votes: { accept: number; reject: number };
  createdAt: string;
  decidedAt: string | null;
}

const circleNotFound = () => new AppError(404, "CIRCLE_NOT_FOUND", "Circle not found");
// Non-members can't tell an unknown application from one they may not see.
const applicationNotFound = () => new AppError(404, "APPLICATION_NOT_FOUND", "Application not found");

type CircleRow = typeof circles.$inferSelect;

/** Pure: the decision a set of votes reaches under MAJORITY, or null while it is still open. */
export function majorityOutcome(votes: { accept: number; reject: number }, members: number): VoteDecision | null {
  if (votes.accept * 2 > members) return "ACCEPT";
  // Acceptance needs more than half; once half or more rejected, it can no longer happen.
  if (votes.reject * 2 >= members) return "REJECT";
  return null;
}

export interface ApplicationServiceDeps {
  db: Db;
  circles: Pick<CircleService, "get" | "takeSeat" | "afterStarted">;
  notices: Pick<ApplicationNotices, "received" | "accepted">;
}

// Emails go out after the commit; a failure never fails the request (the tick retries them).
async function notify(send: () => Promise<number>): Promise<void> {
  await send().catch((err: unknown) => console.error("Application notice failed", err instanceof Error ? err.name : "unknown"));
}

export function createApplicationService({ db, circles: circleService, notices }: ApplicationServiceDeps) {
  const voteCount = (decision: VoteDecision) =>
    sql<number>`(select count(*)::int from ${applicationVotes} where ${applicationVotes.applicationId} = ${circleApplications.id} and ${applicationVotes.decision} = ${decision})`;

  async function find(where: ReturnType<typeof and>): Promise<ApplicationDto[]> {
    const rows = await db
      .select({
        id: circleApplications.id,
        status: circleApplications.status,
        createdAt: circleApplications.createdAt,
        decidedAt: circleApplications.decidedAt,
        accept: voteCount("ACCEPT"),
        reject: voteCount("REJECT"),
        ...publicProfileColumns,
      })
      .from(circleApplications)
      .innerJoin(users, eq(circleApplications.userId, users.id))
      .innerJoin(wallets, eq(users.opWallet, wallets.id))
      .leftJoin(creditProfiles, eq(creditProfiles.walletId, wallets.id))
      .where(where)
      .orderBy(asc(circleApplications.createdAt));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      applicant: toPublicProfile(r),
      votes: { accept: r.accept, reject: r.reject },
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
    }));
  }

  async function findOne(id: string): Promise<ApplicationDto> {
    const [application] = await find(and(eq(circleApplications.id, id)));
    if (!application) throw applicationNotFound();
    return application;
  }

  async function membership(executor: Db | Tx, circleId: string, userId: string) {
    const [member] = await executor
      .select({ id: circleMembers.id, isApprover: circleMembers.isApprover })
      .from(circleMembers)
      .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)));
    return member ?? null;
  }

  async function lockCircle(tx: Tx, circleId: string): Promise<CircleRow> {
    const [circle] = await tx.select().from(circles).where(eq(circles.id, circleId)).for("update");
    if (!circle) throw circleNotFound();
    return circle;
  }

  async function decide(tx: Tx, circle: CircleRow, applicationId: string, decision: VoteDecision, now: Date): Promise<void> {
    const status: ApplicationStatus = decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
    await tx.update(circleApplications).set({ status, decidedAt: now }).where(eq(circleApplications.id, applicationId));
    await tx.insert(auditEvents).values({
      walletId: circle.poolWalletId,
      eventType: `application.${status.toLowerCase()}`,
      externalId: `application.${status.toLowerCase()}:${applicationId}`,
    });
  }

  return {
    /**
     * Applies for a seat in an OPEN public circle; members then accept or reject it.
     * Private circles are joined through their invite link instead, and to anyone
     * else they don't exist.
     */
    async apply(userId: string, circleId: string, seat: SeatInput): Promise<ApplicationDto> {
      const id = await db.transaction(async (tx) => {
        const circle = await lockCircle(tx, circleId);
        if (circle.visibility !== "PUBLIC") throw circleNotFound();
        if (circle.status !== "OPEN") throw new AppError(409, "CIRCLE_NOT_OPEN", "This circle is no longer taking members");
        if (await membership(tx, circleId, userId)) {
          throw new AppError(409, "ALREADY_MEMBER", "You already have a seat in this circle");
        }
        const [user] = await tx.select({ opWallet: users.opWallet }).from(users).where(eq(users.id, userId));
        if (!user) throw new AppError(404, "PROFILE_NOT_FOUND", "User profile not found");
        if (user.opWallet === null) throw new AppError(409, "WALLET_REQUIRED", "Link a wallet before applying to a circle");

        try {
          const [created] = await tx
            .insert(circleApplications)
            .values({ circleId, userId, ...seat })
            .returning({ id: circleApplications.id });
          if (!created) throw new Error("Application insert returned no row");
          await tx.insert(auditEvents).values({
            walletId: circle.poolWalletId,
            eventType: "application.created",
            externalId: `application.created:${created.id}`,
          });
          return created.id;
        } catch (err) {
          if (uniqueViolation(err) === "circle_applications_pending_unique") {
            throw new AppError(409, "APPLICATION_PENDING", "You already have a pending application to this circle");
          }
          throw err;
        }
      });
      await notify(() => notices.received(id));
      return findOne(id);
    },

    /** Applications to a circle, for its members only. */
    async list(viewerId: string, circleId: string, status: ApplicationStatus | undefined): Promise<ApplicationDto[]> {
      if (!(await membership(db, circleId, viewerId))) throw circleNotFound();
      return find(
        and(eq(circleApplications.circleId, circleId), status ? eq(circleApplications.status, status) : undefined),
      );
    },

    /**
     * Records a member's decision. DELEGATES: an approver's first decision settles it.
     * MAJORITY: settled once the votes make the outcome certain. Accepting seats the
     * applicant and, if that fills the circle, starts it and rejects the other pending ones.
     */
    async vote(viewerId: string, circleId: string, applicationId: string, decision: VoteDecision): Promise<ApplicationDto> {
      const now = new Date();
      const result = await db.transaction(async (tx): Promise<{ accepted: boolean; started: boolean }> => {
        // Lock order: circle, then application (same as apply), so concurrent votes serialize.
        const circle = await lockCircle(tx, circleId);
        const voter = await membership(tx, circleId, viewerId);
        if (!voter) throw applicationNotFound();

        const [application] = await tx
          .select()
          .from(circleApplications)
          .where(and(eq(circleApplications.id, applicationId), eq(circleApplications.circleId, circleId)))
          .for("update");
        if (!application) throw applicationNotFound();
        if (application.status !== "PENDING") {
          throw new AppError(409, "APPLICATION_DECIDED", "This application was already decided");
        }
        if (circle.approvalMode === "DELEGATES" && !voter.isApprover) {
          throw new AppError(403, "NOT_APPROVER", "Only the circle's approvers can decide on applications");
        }

        try {
          await tx.insert(applicationVotes).values({ applicationId, memberId: voter.id, decision });
        } catch (err) {
          if (uniqueViolation(err) === "application_votes_pkey") {
            throw new AppError(409, "ALREADY_VOTED", "You already voted on this application");
          }
          throw err;
        }

        let outcome: VoteDecision | null = decision;
        if (circle.approvalMode === "MAJORITY") {
          const tally = await tx
            .select({ decision: applicationVotes.decision, n: count() })
            .from(applicationVotes)
            .where(eq(applicationVotes.applicationId, applicationId))
            .groupBy(applicationVotes.decision);
          const votes = {
            accept: tally.find((t) => t.decision === "ACCEPT")?.n ?? 0,
            reject: tally.find((t) => t.decision === "REJECT")?.n ?? 0,
          };
          const [{ members } = { members: 0 }] = await tx
            .select({ members: count() })
            .from(circleMembers)
            .where(eq(circleMembers.circleId, circleId));
          outcome = majorityOutcome(votes, members);
        }
        if (outcome === null) return { accepted: false, started: false };

        if (outcome === "ACCEPT") {
          const filled = await circleService.takeSeat(tx, circle, application.userId, application);
          await decide(tx, circle, applicationId, "ACCEPT", now);
          if (filled) {
            const others = await tx
              .select({ id: circleApplications.id })
              .from(circleApplications)
              .where(
                and(
                  eq(circleApplications.circleId, circleId),
                  eq(circleApplications.status, "PENDING"),
                  ne(circleApplications.id, applicationId),
                ),
              );
            for (const other of others) await decide(tx, circle, other.id, "REJECT", now);
          }
          return { accepted: true, started: filled };
        }
        await decide(tx, circle, applicationId, "REJECT", now);
        return { accepted: false, started: false };
      });
      if (result.started) await circleService.afterStarted(circleId);
      // The other deciders learn who accepted whom.
      if (result.accepted) await notify(() => notices.accepted(applicationId));
      return findOne(applicationId);
    },

    /** The creator picks which members (besides themselves) approve applicants. */
    async setApprovers(creatorId: string, circleId: string, memberIds: readonly string[]): Promise<CircleDto> {
      await db.transaction(async (tx) => {
        const circle = await lockCircle(tx, circleId);
        if (circle.createdBy !== creatorId) {
          if (!(await membership(tx, circleId, creatorId))) throw circleNotFound();
          throw new AppError(403, "NOT_CREATOR", "Only the circle's creator can choose approvers");
        }
        const ids = [...new Set(memberIds)];
        const found =
          ids.length === 0
            ? []
            : await tx
                .select({ id: circleMembers.id })
                .from(circleMembers)
                .where(and(eq(circleMembers.circleId, circleId), inArray(circleMembers.id, ids)));
        if (found.length !== ids.length) throw new AppError(422, "NOT_MEMBERS", "Approvers must be members of the circle");

        await tx
          .update(circleMembers)
          .set({ isApprover: sql`${circleMembers.userId} = ${creatorId} or ${ids.length > 0 ? inArray(circleMembers.id, ids) : sql`false`}` })
          .where(eq(circleMembers.circleId, circleId));
      });
      return circleService.get(circleId, { userId: creatorId });
    },
  };
}

export type ApplicationService = ReturnType<typeof createApplicationService>;
