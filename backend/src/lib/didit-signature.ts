import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 300;

/**
 * Didit `X-Signature`: hex HMAC-SHA256 of the exact raw request body, plus an
 * `X-Timestamp` within ±300 s. https://docs.didit.me/integration/webhooks
 */
export function verifyDiditSignature(args: {
  rawBody: Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const { rawBody, signature, timestamp, secret, nowSeconds = Math.floor(Date.now() / 1000) } = args;
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(signature.trim().toLowerCase());
  return expected.length === received.length && timingSafeEqual(expected, received);
}
