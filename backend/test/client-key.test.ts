import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { loadPrivateKey } from "../src/lib/client-key";

const { privateKey } = generateKeyPairSync("ed25519");

test("loads base64 of a PEM private key", () => {
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  assert.equal(loadPrivateKey(Buffer.from(pem).toString("base64")).asymmetricKeyType, "ed25519");
});

test("loads base64 of a PKCS#8 DER private key", () => {
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  assert.equal(loadPrivateKey(der.toString("base64")).asymmetricKeyType, "ed25519");
});

test("rejects non-Ed25519 keys", () => {
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const pem = rsa.export({ format: "pem", type: "pkcs8" }).toString();
  assert.throws(() => loadPrivateKey(Buffer.from(pem).toString("base64")), /Ed25519/);
});
