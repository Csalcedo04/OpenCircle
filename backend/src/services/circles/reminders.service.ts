import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../../db/client";
import { CONTRIBUTION_STATUSES, circleMembers, circles, contributions, rounds, users } from "../../db/schema";
import { deliverOnce, type Outgoing } from "../notifications/deliver";
import type { NotificationChannel, NotificationSender, ReminderKind } from "../notifications/sender";
import { penaltyAt } from "./scoring.service";

const DAY_MS = 86_400_000;
const DUE_SOON_DAYS = 3;

type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/**
 * Pure: which reminder an unpaid contribution needs at `now`. DUE_SOON from 3 days before the
 * deadline, DUE_TODAY in its last 24 hours, LATE once it passed and until the score penalty.
 */
export function reminderKind(status: ContributionStatus, deadline: Date, penalty: Date, now: Date): ReminderKind | null {
  if (status === "COMPLETED" || status === "CANCELLED") return null;
  const t = now.getTime();
  const d = deadline.getTime();
  if (t < d) {
    if (t >= d - DAY_MS) return "DUE_TODAY";
    if (t >= d - DUE_SOON_DAYS * DAY_MS) return "DUE_SOON";
    return null;
  }
  return t < penalty.getTime() ? "LATE" : null;
}

/**
 * Pure: whether a contribution gets the COLLECTING notice at `now`: its round is collecting
 * (the caller only passes open rounds) and its deadline hasn't passed. Paid ones too, so every
 * member hears that the round's money is being collected.
 */
export function collectingNotice(status: ContributionStatus, deadline: Date, now: Date): boolean {
  return status !== "CANCELLED" && now.getTime() < deadline.getTime();
}

/**
 * Tells members a round started collecting, and reminds who hasn't paid: by email, and by
 * WhatsApp when they have a phone.
 */
export function createReminders({ db, sender }: { db: Db; sender: NotificationSender }) {
  return {
    /**
     * At circle time `now`. Each notice is sent once per channel; a failed send is retried
     * on the next run (see deliverOnce).
     */
    async remindCircle(circleId: string, now: Date): Promise<number> {
      const roundRows = await db
        .select({ number: rounds.number, deadline: rounds.deadline })
        .from(rounds)
        .where(eq(rounds.circleId, circleId));
      const deadlineOf = new Map(roundRows.map((r) => [r.number, r.deadline]));

      const rows = await db
        .select({
          id: contributions.id,
          status: contributions.status,
          value: contributions.value,
          assetCode: contributions.assetCode,
          assetScale: contributions.assetScale,
          roundNumber: rounds.number,
          deadline: rounds.deadline,
          circleName: circles.name,
          poolWalletId: circles.poolWalletId,
          email: users.email,
          phone: users.phone,
        })
        .from(contributions)
        .innerJoin(rounds, eq(contributions.roundId, rounds.id))
        .innerJoin(circles, eq(rounds.circleId, circles.id))
        .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
        .innerJoin(users, eq(circleMembers.userId, users.id))
        .where(and(eq(rounds.circleId, circleId), ne(rounds.state, "UPCOMING")));

      const due: Outgoing[] = rows.flatMap((r) => {
        const reminder = reminderKind(r.status, r.deadline, penaltyAt(r.deadline, deadlineOf.get(r.roundNumber + 1) ?? null), now);
        const kinds: ReminderKind[] = [];
        if (collectingNotice(r.status, r.deadline, now)) kinds.push("COLLECTING");
        if (reminder) kinds.push(reminder);
        const targets: [NotificationChannel, string][] = [["EMAIL", r.email]];
        if (r.phone) targets.push(["WHATSAPP", r.phone]);
        return kinds.flatMap((kind) => targets.map(([channel, to]) => ({
          key: `notification.sent:${kind}:${r.id}:${channel}`,
          walletId: r.poolWalletId,
          notification: {
            channel,
            to,
            kind,
            circleName: r.circleName,
            deadline: r.deadline,
            amount: { value: r.value.toString(), assetCode: r.assetCode, assetScale: r.assetScale },
            contributionId: r.id,
          },
        })));
      });
      return deliverOnce(db, sender, due);
    },
  };
}

export type RemindersService = ReturnType<typeof createReminders>;
