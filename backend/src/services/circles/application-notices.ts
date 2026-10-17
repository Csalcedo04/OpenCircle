import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/client";
import { APPROVAL_MODES, applicationVotes, circleApplications, circleMembers, circles, users } from "../../db/schema";
import { displayName } from "../display-name";
import { deliverOnce, type Outgoing } from "../notifications/deliver";
import type { NotificationSender } from "../notifications/sender";

type ApprovalMode = (typeof APPROVAL_MODES)[number];

export interface Decider {
  memberId: string;
  userId: string;
  isApprover: boolean;
}

/**
 * Pure: who decides on applications. DELEGATES: the creator and the delegated approvers.
 * MAJORITY: every member, since every member votes. `excludeMemberIds` leaves out, e.g.,
 * the approver who just accepted.
 */
export function decidersOf<T extends Decider>(mode: ApprovalMode, members: readonly T[], excludeMemberIds: readonly string[] = []): T[] {
  return members.filter((m) => (mode === "MAJORITY" || m.isApprover) && !excludeMemberIds.includes(m.memberId));
}

/**
 * Emails a circle's deciders when someone applies, and the other deciders when one of them
 * accepts ("Ana G. accepted Bob R."). Each email goes once per recipient; failures are
 * retried by retryRecent (run by the scheduler tick).
 */
export function createApplicationNotices({ db, sender }: { db: Db; sender: NotificationSender }) {
  const applicant = alias(users, "applicant");

  async function context(applicationId: string) {
    const [row] = await db
      .select({
        id: circleApplications.id,
        status: circleApplications.status,
        circleId: circles.id,
        circleName: circles.name,
        approvalMode: circles.approvalMode,
        poolWalletId: circles.poolWalletId,
        applicantUserId: applicant.id,
        applicantName: applicant.fullName,
      })
      .from(circleApplications)
      .innerJoin(circles, eq(circleApplications.circleId, circles.id))
      .innerJoin(applicant, eq(circleApplications.userId, applicant.id))
      .where(eq(circleApplications.id, applicationId))
      .limit(1);
    return row ?? null;
  }

  const membersOf = (circleId: string) =>
    db
      .select({
        memberId: circleMembers.id,
        userId: circleMembers.userId,
        isApprover: circleMembers.isApprover,
        email: users.email,
        fullName: users.fullName,
      })
      .from(circleMembers)
      .innerJoin(users, eq(circleMembers.userId, users.id))
      .where(eq(circleMembers.circleId, circleId));

  /** To who can decide: someone applied. Only while the application is pending. */
  async function received(applicationId: string): Promise<number> {
    const app = await context(applicationId);
    if (!app || app.status !== "PENDING") return 0;
    const recipients = decidersOf(app.approvalMode, await membersOf(app.circleId));
    const items: Outgoing[] = recipients.map((m) => ({
      key: `notification.sent:APPLICATION_RECEIVED:${app.id}:${m.memberId}:EMAIL`,
      walletId: app.poolWalletId,
      notification: {
        channel: "EMAIL",
        to: m.email,
        kind: "APPLICATION_RECEIVED",
        circleName: app.circleName,
        circleId: app.circleId,
        applicationId: app.id,
        applicantName: displayName(app.applicantName),
      },
    }));
    return deliverOnce(db, sender, items);
  }

  /** To the other deciders: who accepted whom. The acceptor is the last member who voted ACCEPT. */
  async function accepted(applicationId: string): Promise<number> {
    const app = await context(applicationId);
    if (!app || app.status !== "ACCEPTED") return 0;
    const [vote] = await db
      .select({ memberId: applicationVotes.memberId })
      .from(applicationVotes)
      .where(and(eq(applicationVotes.applicationId, app.id), eq(applicationVotes.decision, "ACCEPT")))
      .orderBy(desc(applicationVotes.createdAt))
      .limit(1);
    const members = await membersOf(app.circleId);
    const acceptor = members.find((m) => m.memberId === vote?.memberId);
    // The new member (just seated) is not a decider of their own application.
    const newcomer = members.find((m) => m.userId === app.applicantUserId);
    const exclude = [acceptor?.memberId, newcomer?.memberId].filter((id): id is string => id !== undefined);

    const items: Outgoing[] = decidersOf(app.approvalMode, members, exclude).map((m) => ({
      key: `notification.sent:APPLICATION_ACCEPTED:${app.id}:${m.memberId}:EMAIL`,
      walletId: app.poolWalletId,
      notification: {
        channel: "EMAIL",
        to: m.email,
        kind: "APPLICATION_ACCEPTED",
        circleName: app.circleName,
        circleId: app.circleId,
        applicationId: app.id,
        applicantName: displayName(app.applicantName),
        acceptedByName: displayName(acceptor?.fullName ?? null),
      },
    }));
    return deliverOnce(db, sender, items);
  }

  return {
    received,
    accepted,

    /** Re-sends what failed for applications created or decided since `since`. */
    async retryRecent(since: Date): Promise<number> {
      const recent = await db
        .select({ id: circleApplications.id, status: circleApplications.status })
        .from(circleApplications)
        .where(
          and(
            inArray(circleApplications.status, ["PENDING", "ACCEPTED"]),
            or(gte(circleApplications.createdAt, since), gte(circleApplications.decidedAt, since)),
          ),
        );
      let sent = 0;
      for (const a of recent) sent += a.status === "PENDING" ? await received(a.id) : await accepted(a.id);
      return sent;
    },
  };
}

export type ApplicationNotices = ReturnType<typeof createApplicationNotices>;
