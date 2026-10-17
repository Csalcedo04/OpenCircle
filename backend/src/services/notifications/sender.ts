import type { AmountDto } from "../wallet.service";

export const NOTIFICATION_CHANNELS = ["EMAIL", "SMS", "WHATSAPP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// DUE_SOON: the pay date is close. DUE_TODAY: it is the pay date. LATE: the pay date passed unpaid.
export const NOTIFICATION_KINDS = ["DUE_SOON", "DUE_TODAY", "LATE"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  channel: NotificationChannel;
  // Email address or phone number. Providers use it to deliver; it is never logged or stored.
  to: string;
  kind: NotificationKind;
  circleName: string;
  deadline: Date;
  amount: AmountDto;
  contributionId: string;
}

/** Delivers one notification; throws when it could not, so the caller retries later. */
export interface NotificationSender {
  send(notification: Notification): Promise<void>;
}

/** Development sender: logs what would be sent, without contact data. */
export function createLogSender(log: (message: string, data: Record<string, string>) => void = console.info): NotificationSender {
  return {
    async send({ channel, kind, contributionId }) {
      log("Notification", { kind, channel, contributionId });
    },
  };
}
