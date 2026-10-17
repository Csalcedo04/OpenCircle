import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import { diditSignatureFailure, verifyDiditSignature } from "../src/services/didit/signature";

describe("Didit signature", () => {
  const secret = "s3cret";
  const rawBody = Buffer.from('{"session_id":"x","status":"Approved"}');
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  const now = 1_800_000_000;

  test("accepts the raw-body HMAC inside the 300 s window", () => {
    assert.ok(verifyDiditSignature({ rawBody, signature, timestamp: String(now - 300), secret, nowSeconds: now }));
    assert.ok(verifyDiditSignature({ rawBody, signature: signature.toUpperCase(), timestamp: String(now), secret, nowSeconds: now }));
  });

  test("rejects other bodies, secrets, stale or missing timestamps", () => {
    const ts = String(now);
    assert.ok(!verifyDiditSignature({ rawBody: Buffer.from("{}"), signature, timestamp: ts, secret, nowSeconds: now }));
    assert.ok(!verifyDiditSignature({ rawBody, signature, timestamp: ts, secret: "other", nowSeconds: now }));
    assert.ok(!verifyDiditSignature({ rawBody, signature, timestamp: String(now - 301), secret, nowSeconds: now }));
    assert.ok(!verifyDiditSignature({ rawBody, signature, timestamp: undefined, secret, nowSeconds: now }));
    assert.ok(!verifyDiditSignature({ rawBody, signature: undefined, timestamp: ts, secret, nowSeconds: now }));
  });

  test("names why a signature fails", () => {
    const args = { rawBody, signature, timestamp: String(now), secret, nowSeconds: now };
    assert.equal(diditSignatureFailure(args), null);
    assert.equal(diditSignatureFailure({ ...args, signature: undefined }), "MISSING_SIGNATURE");
    assert.equal(diditSignatureFailure({ ...args, timestamp: undefined }), "MISSING_TIMESTAMP");
    assert.equal(diditSignatureFailure({ ...args, timestamp: "soon" }), "INVALID_TIMESTAMP");
    assert.equal(diditSignatureFailure({ ...args, timestamp: String(now - 301) }), "STALE_TIMESTAMP");
    assert.equal(diditSignatureFailure({ ...args, secret: "other" }), "MISMATCH");
  });
});
