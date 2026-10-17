import { inArray } from "drizzle-orm";
import type { Db } from "../../db/client";
import { auditEvents } from "../../db/schema";
import type { Notification, NotificationSender } from "./sender";

export interface Outgoing {
  // Unique per notification and recipient, without contact data, e.g. notification.sent:LATE:<id>:EMAIL.
  key: string;
  // Wallet the audit row belongs to (audit_events requires one).
  walletId: string;
  notification: Notification;
}

/**
 * Sends each notification not sent before and records it in audit_events afterwards, so a
 * failed send is retried by the next call (at least once, never silently dropped).
 * Returns how many were sent.
 */
export async function deliverOnce(db: Db, sender: NotificationSender, items: readonly Outgoing[]): Promise<number> {
  if (items.length === 0) return 0;
  const sent = new Set(
    (
      await db
        .select({ id: auditEvents.externalId })
        .from(auditEvents)
        .where(
          inArray(
            auditEvents.externalId,
            items.map((i) => i.key),
          ),
        )
    ).map((e) => e.id),
  );

  let count = 0;
  for (const { key, walletId, notification } of items) {
    if (sent.has(key)) continue;
    try {
      await sender.send(notification);
    } catch (err) {
      console.error("Notification failed", notification.kind, notification.channel, key, err instanceof Error ? err.name : "unknown");
      continue;
    }
    await db
      .insert(auditEvents)
      .values({ walletId, eventType: "notification.sent", externalId: key })
      .onConflictDoNothing({ target: auditEvents.externalId });
    count++;
  }
  return count;
}
