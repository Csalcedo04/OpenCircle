import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../../db/client";
import { CONTRIBUTION_STATUSES, auditEvents, circleMembers, circles, contributions, rounds, users } from "../../db/schema";
import type { NotificationChannel, NotificationKind, NotificationSender } from "../notifications/sender";
import { penaltyAt } from "./scoring.service";

const DAY_MS = 86_400_000;
const DUE_SOON_DAYS = 3;

type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/**
 * Pure: which reminder an unpaid contribution needs at `now`. DUE_SOON from 3 days before the
 * deadline, DUE_TODAY in its last 24 hours, LATE once it passed and until the score penalty.
 */
export function reminderKind(status: ContributionStatus, deadline: Date, penalty: Date, now: Date): NotificationKind | null {
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

const externalId = (kind: NotificationKind, contributionId: string, channel: NotificationChannel) =>
  `notification.sent:${kind}:${contributionId}:${channel}`;

/** Reminds members who haven't paid: by email, and by WhatsApp when they have a phone. */
export function createReminders({ db, sender }: { db: Db; sender: NotificationSender }) {
  return {
    /**
     * At circle time `now`. Each reminder is sent once per channel: it is recorded after it was
     * sent, so a failed send is retried on the next run (at least once, never silently dropped).
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

      const due = rows.flatMap((r) => {
        const kind = reminderKind(r.status, r.deadline, penaltyAt(r.deadline, deadlineOf.get(r.roundNumber + 1) ?? null), now);
        if (!kind) return [];
        const targets: [NotificationChannel, string][] = [["EMAIL", r.email]];
        if (r.phone) targets.push(["WHATSAPP", r.phone]);
        return targets.map(([channel, to]) => ({ r, kind, channel, to, key: externalId(kind, r.id, channel) }));
      });
      if (due.length === 0) return 0;

      const sent = new Set(
        (
          await db
            .select({ id: auditEvents.externalId })
            .from(auditEvents)
            .where(
              inArray(
                auditEvents.externalId,
                due.map((d) => d.key),
              ),
            )
        ).map((e) => e.id),
      );

      let count = 0;
      for (const { r, kind, channel, to, key } of due) {
        if (sent.has(key)) continue;
        try {
          await sender.send({
            channel,
            to,
            kind,
            circleName: r.circleName,
            deadline: r.deadline,
            amount: { value: r.value.toString(), assetCode: r.assetCode, assetScale: r.assetScale },
            contributionId: r.id,
          });
        } catch (err) {
          console.error("Notification failed", kind, channel, r.id, err instanceof Error ? err.name : "unknown");
          continue;
        }
        await db
          .insert(auditEvents)
          .values({ walletId: r.poolWalletId, eventType: "notification.sent", externalId: key })
          .onConflictDoNothing({ target: auditEvents.externalId });
        count++;
      }
      return count;
    },
  };
}

export type RemindersService = ReturnType<typeof createReminders>;
