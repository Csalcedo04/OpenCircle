import { createHash, timingSafeEqual } from "node:crypto";

export interface InteractHashInput {
  /** Nonce OpenCircle sent in `interact.finish.nonce`. */
  clientNonce: string;
  /** Nonce the authorization server returned in `interact.finish`. */
  finishNonce: string;
  interactRef: string;
  /** Grant endpoint URL the initial request was sent to. */
  grantEndpoint: string;
}

const normalize = (b64: string) => b64.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");

/**
 * Verifies the `hash` on the interaction-finish redirect:
 * SHA-256 over `clientNonce \n finishNonce \n interactRef \n grantEndpoint`, base64.
 * https://openpayments.dev/identity/hash-verification/
 * Padding and base64url vs base64 are normalized, since servers differ on both.
 */
export function verifyInteractHash(input: InteractHashInput, receivedHash: string): boolean {
  const base = [input.clientNonce, input.finishNonce, input.interactRef, input.grantEndpoint].join("\n");
  const expected = Buffer.from(normalize(createHash("sha256").update(base, "ascii").digest("base64")));
  const received = Buffer.from(normalize(receivedHash));
  return expected.length === received.length && timingSafeEqual(expected, received);
}
