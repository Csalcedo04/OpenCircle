import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import { verifyInteractHash } from "../src/lib/gnap-hash";
import { isAllowedOpenPaymentsUrl } from "../src/lib/open-payments";
import { createTokenCipher } from "../src/lib/token-cipher";
import { walletAddressInputSchema } from "../src/schemas/wallet-address.schema";
import { completeConsentSchema } from "../src/schemas/wallet-consent.schema";

describe("token cipher", () => {
  const cipher = createTokenCipher(randomBytes(32).toString("base64"));

  test("round-trips and never returns the plaintext", () => {
    const sealed = cipher.encrypt("access-token-value");
    assert.ok(!sealed.includes("access-token-value"));
    assert.equal(cipher.decrypt(sealed), "access-token-value");
  });

  test("uses a fresh IV per encryption", () => {
    assert.notEqual(cipher.encrypt("same"), cipher.encrypt("same"));
  });

  test("rejects tampered ciphertext and a different key", () => {
    const sealed = cipher.encrypt("access-token-value");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => cipher.decrypt(parts.join(".")));
    assert.throws(() => createTokenCipher(randomBytes(32).toString("base64")).decrypt(sealed));
  });

  test("requires a 32-byte key", () => {
    assert.throws(() => createTokenCipher(randomBytes(16).toString("base64")), /32 bytes/);
  });
});

describe("interact hash", () => {
  const input = {
    clientNonce: "client-nonce",
    finishNonce: "finish-nonce",
    interactRef: "interact-ref",
    grantEndpoint: "https://auth.interledger-test.dev/",
  };
  // Built independently from the spec: newline-joined, SHA-256, base64.
  const digest = createHash("sha256")
    .update("client-nonce\nfinish-nonce\ninteract-ref\nhttps://auth.interledger-test.dev/")
    .digest("base64");

  test("accepts the hash with or without padding, base64 or base64url", () => {
    assert.ok(verifyInteractHash(input, digest));
    assert.ok(verifyInteractHash(input, digest.replace(/=+$/, "")));
    assert.ok(verifyInteractHash(input, Buffer.from(digest, "base64").toString("base64url")));
  });

  test("rejects a hash for any other input", () => {
    assert.ok(!verifyInteractHash({ ...input, interactRef: "other" }, digest));
    assert.ok(!verifyInteractHash({ ...input, grantEndpoint: "https://evil.example/" }, digest));
    assert.ok(!verifyInteractHash(input, "short"));
  });
});

describe("wallet address input", () => {
  test("turns a payment pointer into its https URL", () => {
    assert.equal(
      walletAddressInputSchema.parse({ url: " $ilp.interledger-test.dev/alice " }).url,
      "https://ilp.interledger-test.dev/alice",
    );
  });

  test("rejects http and non-URLs", () => {
    assert.ok(!walletAddressInputSchema.safeParse({ url: "http://ilp.interledger-test.dev/alice" }).success);
    assert.ok(!walletAddressInputSchema.safeParse({ url: "alice" }).success);
  });
});

describe("test-network allowlist", () => {
  test("allows testnet hosts over https only", () => {
    assert.ok(isAllowedOpenPaymentsUrl("https://ilp.interledger-test.dev/alice"));
    assert.ok(isAllowedOpenPaymentsUrl("https://auth.interledger-test.dev/"));
    assert.ok(!isAllowedOpenPaymentsUrl("http://ilp.interledger-test.dev/alice"));
  });

  test("rejects lookalike and real-money hosts", () => {
    assert.ok(!isAllowedOpenPaymentsUrl("https://interledger-test.dev.evil.com/alice"));
    assert.ok(!isAllowedOpenPaymentsUrl("https://evilinterledger-test.dev/alice"));
    assert.ok(!isAllowedOpenPaymentsUrl("https://wallet.example.com/alice"));
  });
});

describe("complete consent input", () => {
  test("requires a well-formed state and no extra fields", () => {
    const ok = { state: randomBytes(32).toString("base64url"), interactRef: "ref", hash: "hash" };
    assert.ok(completeConsentSchema.safeParse(ok).success);
    assert.ok(!completeConsentSchema.safeParse({ ...ok, state: "short" }).success);
    assert.ok(!completeConsentSchema.safeParse({ ...ok, extra: 1 }).success);
  });
});
