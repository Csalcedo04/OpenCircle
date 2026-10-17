import type { AmountDto } from "../wallet.service";

export const NOTIFICATION_CHANNELS = ["EMAIL", "SMS", "WHATSAPP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// DUE_SOON: the pay date is close. DUE_TODAY: it is the pay date. LATE: the pay date passed unpaid.
export const REMINDER_KINDS = ["DUE_SOON", "DUE_TODAY", "LATE"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

interface Delivery {
  channel: NotificationChannel;
  // Email address or phone number. Providers use it to deliver; it is never logged or stored.
  to: string;
  circleName: string;
}

/** A member hasn't paid a contribution yet. */
export interface PaymentReminder extends Delivery {
  kind: ReminderKind;
  deadline: Date;
  amount: AmountDto;
  contributionId: string;
}

/** Someone applied to a circle; sent to who can decide. Names are display names ("Ana G."). */
export interface ApplicationReceived extends Delivery {
  kind: "APPLICATION_RECEIVED";
  circleId: string;
  applicationId: string;
  applicantName: string;
}

/** An approver accepted an applicant; sent to the other deciders. */
export interface ApplicationAccepted extends Delivery {
  kind: "APPLICATION_ACCEPTED";
  circleId: string;
  applicationId: string;
  applicantName: string;
  acceptedByName: string;
}

/** Someone was invited to a circle; sent to the invitee. The link carries the invite's secret. */
export interface CircleInvite extends Delivery {
  kind: "CIRCLE_INVITE";
  circleId: string;
  inviteId: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: Date | null;
}

export type Notification = PaymentReminder | ApplicationReceived | ApplicationAccepted | CircleInvite;
export type NotificationKind = Notification["kind"];

/** Delivers one notification; throws when it could not, so the caller retries later. */
export interface NotificationSender {
  send(notification: Notification): Promise<void>;
}

/** Development sender: logs what would be sent, without contact data or names. */
export function createLogSender(log: (message: string, data: Record<string, string>) => void = console.info): NotificationSender {
  return {
    async send(n) {
      const subject =
        "contributionId" in n ? { contributionId: n.contributionId } : "inviteId" in n ? { inviteId: n.inviteId } : { applicationId: n.applicationId };
      log("Notification", { kind: n.kind, channel: n.channel, ...subject });
    },
  };
}
