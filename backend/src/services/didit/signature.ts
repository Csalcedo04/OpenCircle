import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 300;

export type SignatureFailure = "MISSING_SIGNATURE" | "MISSING_TIMESTAMP" | "INVALID_TIMESTAMP" | "STALE_TIMESTAMP" | "MISMATCH";

interface SignatureArgs {
  rawBody: Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string;
  nowSeconds?: number;
}

/**
 * Didit `X-Signature`: hex HMAC-SHA256 of the exact raw request body, plus an
 * `X-Timestamp` within ±300 s. https://docs.didit.me/integration/webhooks
 * Returns why the signature fails, or null when it is valid (the reason is only logged).
 */
export function diditSignatureFailure(args: SignatureArgs): SignatureFailure | null {
  const { rawBody, signature, timestamp, secret, nowSeconds = Math.floor(Date.now() / 1000) } = args;
  if (!signature) return "MISSING_SIGNATURE";
  if (!timestamp) return "MISSING_TIMESTAMP";
  if (!/^\d+$/.test(timestamp)) return "INVALID_TIMESTAMP";
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return "STALE_TIMESTAMP";

  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(signature.trim().toLowerCase());
  return expected.length === received.length && timingSafeEqual(expected, received) ? null : "MISMATCH";
}

export function verifyDiditSignature(args: SignatureArgs): boolean {
  return diditSignatureFailure(args) === null;
}
