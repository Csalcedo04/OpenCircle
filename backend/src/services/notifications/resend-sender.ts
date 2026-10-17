import { renderEmail } from "./email-templates";
import type { NotificationSender } from "./sender";

export interface ResendSenderDeps {
  apiKey: string;
  // "OpenCircle <hola@opencircle.co>": a sender on a domain verified in Resend.
  from: string;
  fetch?: typeof globalThis.fetch;
}

const RESEND_EMAILS = "https://api.resend.com/emails";

/**
 * Emails through Resend's API (one POST per message). Only EMAIL notifications; throws on any
 * failure so the caller retries later. Error messages carry the status, never the address or
 * Resend's response body.
 */
export function createResendSender({ apiKey, from, fetch = globalThis.fetch }: ResendSenderDeps): NotificationSender {
  return {
    async send(n) {
      if (n.channel !== "EMAIL") throw new Error(`Resend can't deliver ${n.channel}`);
      const { subject, text } = renderEmail(n);
      const res = await fetch(RESEND_EMAILS, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [n.to], subject, text }),
      });
      if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    },
  };
}
