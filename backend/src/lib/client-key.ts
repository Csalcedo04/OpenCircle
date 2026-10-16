import { createPrivateKey, type KeyObject } from "node:crypto";

/**
 * Loads OpenCircle's Open Payments signing key from base64. Accepts base64 of
 * the PEM file the test wallet downloads (`private.key`) or of raw PKCS#8 DER.
 */
export function loadPrivateKey(base64: string): KeyObject {
  const decoded = Buffer.from(base64.trim(), "base64");
  const pem = decoded.toString("utf8");
  const key = pem.includes("-----BEGIN")
    ? createPrivateKey(pem)
    : createPrivateKey({ key: decoded, format: "der", type: "pkcs8" });
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("OP_PRIVATE_KEY must be an Ed25519 key");
  }
  return key;
}
