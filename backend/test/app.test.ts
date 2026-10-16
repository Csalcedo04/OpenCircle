import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHmac } from "node:crypto";
import type { Services } from "../src/routes";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeServices } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

const WEBHOOK_SECRET = "test-webhook-secret";
const webhookEvents: Parameters<Services["kyc"]["handleWebhook"]>[0][] = [];

const kyc: Services["kyc"] = {
  ...fakeServices().kyc,
  handleWebhook: async (event) => {
    webhookEvents.push(event);
    return event.vendorData === "11111111-1111-4111-8111-111111111111" ? "applied" : "ignored";
  },
};

let server: TestServer;
let auth: TestAuth;

before(async () => {
  auth = await setupTestAuth();
  server = await startServer(fakeServices({ kyc }), { diditWebhookSecret: WEBHOOK_SECRET });
});

after(() => server.close());

test("GET /api/health returns ok without authentication", async () => {
  const res = await server.request("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("unknown route returns 404 NOT_FOUND", async () => {
  const res = await server.request("/api/nope");
  assert.equal(res.status, 404);
  assert.equal(errorCode(res.body), "NOT_FOUND");
});

test("malformed JSON body returns 400 INVALID_REQUEST_BODY", async () => {
  const token = await auth.token("8a6e0804-2bd0-4672-b79d-d97027f9071a");
  const res = await fetch(`${server.baseUrl}/api/users/me`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  assert.equal(errorCode(await res.json()), "INVALID_REQUEST_BODY");
});

test("body over the size limit returns 413", async () => {
  const token = await auth.token("8a6e0804-2bd0-4672-b79d-d97027f9071a");
  const res = await server.request("/api/users/me", {
    method: "POST",
    token,
    body: { fullName: "x".repeat(200 * 1024) },
  });
  assert.equal(res.status, 413);
  assert.equal(errorCode(res.body), "INVALID_REQUEST_BODY");
});

test("consent and KYC routes require a token → 401", async () => {
  for (const [method, path, body] of [
    ["POST", "/api/users/me/wallet/consent", { walletAddress: "$ilp.interledger-test.dev/alice" }],
    ["POST", "/api/users/me/wallet/consent/complete", { state: "x".repeat(43), interactRef: "ref", hash: "hash" }],
    ["GET", "/api/users/me/kyc", undefined],
    ["POST", "/api/users/me/kyc/session", { locale: "es", returnPath: "/es/circles" }],
  ] as const) {
    const res = await server.request(path, { method, body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test("PUT /api/users/me/wallet is gone: wallets are linked only through consent", async () => {
  const token = await auth.token("33333333-3333-4333-8333-333333333333");
  const res = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: "$wallet.test/x" } });
  assert.equal(res.status, 404);
});

test("KYC session rejects return paths outside the app → 400", async () => {
  const token = await auth.token("33333333-3333-4333-8333-333333333333");
  for (const returnPath of ["https://evil.example", "//evil.example", "/es/../x", "/fr/circles", "/es/circles?x=1"]) {
    const res = await server.request("/api/users/me/kyc/session", { method: "POST", token, body: { locale: "es", returnPath } });
    assert.equal(res.status, 400, returnPath);
    assert.equal(errorCode(res.body), "VALIDATION_ERROR");
  }
});

function signed(body: string, timestamp = Math.floor(Date.now() / 1000)): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-timestamp": String(timestamp),
    "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
  };
}

const statusEvent = JSON.stringify({
  webhook_type: "status.updated",
  session_id: "22222222-2222-4222-8222-222222222222",
  status: "Approved",
  vendor_data: "11111111-1111-4111-8111-111111111111",
  decision: { id_verification: { first_name: "never stored" } },
});

const postWebhook = (baseUrl: string, headers: Record<string, string>, body: string) =>
  fetch(`${baseUrl}/api/webhooks/didit`, { method: "POST", headers, body });

test("Didit webhook applies a correctly signed status event", async () => {
  const res = await postWebhook(server.baseUrl, signed(statusEvent), statusEvent);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, result: "applied" });
  assert.deepEqual(webhookEvents.at(-1), {
    sessionId: "22222222-2222-4222-8222-222222222222",
    status: "Approved",
    vendorData: "11111111-1111-4111-8111-111111111111",
  });
});

test("Didit webhook rejects a bad signature, a changed body and a stale timestamp → 401", async () => {
  const count = webhookEvents.length;
  const tampered = statusEvent.replace("Approved", "Declined");
  const cases: [Record<string, string>, string][] = [
    [{ ...signed(statusEvent), "x-signature": "00".repeat(32) }, statusEvent],
    [signed(statusEvent), tampered],
    [signed(statusEvent, Math.floor(Date.now() / 1000) - 301), statusEvent],
    [{ "content-type": "application/json" }, statusEvent],
  ];
  for (const [headers, body] of cases) {
    const res = await postWebhook(server.baseUrl, headers, body);
    assert.equal(res.status, 401);
  }
  assert.equal(webhookEvents.length, count);
});

test("Didit webhook acknowledges signed events it doesn't act on", async () => {
  const other = JSON.stringify({ webhook_type: "data.updated", session_id: "not-a-uuid" });
  const res = await postWebhook(server.baseUrl, signed(other), other);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, result: "ignored" });
});

test("Didit webhook answers 503 when no secret is configured", async () => {
  const unconfigured = await startServer(fakeServices({ kyc }));
  try {
    const res = await postWebhook(unconfigured.baseUrl, signed(statusEvent), statusEvent);
    assert.equal(res.status, 503);
  } finally {
    await unconfigured.close();
  }
});
