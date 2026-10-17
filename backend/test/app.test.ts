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

const users: Services["users"] = {
  ...fakeServices().users,
  getPublicProfile: async () => ({ fullName: "Ana", walletAddress: "https://wallet.test/ana", ics: 87.34 }),
};

let server: TestServer;
let auth: TestAuth;

before(async () => {
  auth = await setupTestAuth();
  server = await startServer(fakeServices({ kyc, users }), { diditWebhookSecret: WEBHOOK_SECRET });
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
    ["GET", "/api/users/me/dashboard", undefined],
    ["POST", "/api/users/me/kyc/session", { locale: "es", returnPath: "/es/circles" }],
  ] as const) {
    const res = await server.request(path, { method, body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test("public profile routes require a token → 401", async () => {
  for (const path of [
    "/api/users/11111111-1111-4111-8111-111111111111/public",
    "/api/users/public?walletAddress=%24wallet.test%2Fx",
  ]) {
    const res = await server.request(path);
    assert.equal(res.status, 401, path);
  }
});

test("public profile routes validate the id and wallet address → 400", async () => {
  const token = await auth.token("33333333-3333-4333-8333-333333333333");
  for (const path of [
    "/api/users/not-a-uuid/public",
    "/api/users/public",
    "/api/users/public?walletAddress=http%3A%2F%2Fwallet.test%2Fx",
    "/api/users/public?walletAddress=%24wallet.test%2Fx&extra=1",
  ]) {
    const res = await server.request(path, { token });
    assert.equal(res.status, 400, path);
    assert.equal(errorCode(res.body), "VALIDATION_ERROR");
  }
});

test("public profile lookups are rate limited per user across both routes → 429", async () => {
  const token = await auth.token("44444444-4444-4444-8444-444444444444");
  const paths = ["/api/users/11111111-1111-4111-8111-111111111111/public", "/api/users/public?walletAddress=%24wallet.test%2Fx"];
  for (let i = 0; i < 30; i++) {
    const res = await server.request(paths[i % 2] ?? "", { token });
    assert.equal(res.status, 200, `request ${i + 1}`);
  }
  const limited = await server.request(paths[0] ?? "", { token });
  assert.equal(limited.status, 429);
  assert.equal(errorCode(limited.body), "RATE_LIMITED");

  // Another user keeps their own budget.
  const other = await server.request(paths[0] ?? "", { token: await auth.token("55555555-5555-4555-8555-555555555555") });
  assert.equal(other.status, 200);
});

test("circle application routes require a token → 401", async () => {
  const circle = "11111111-1111-4111-8111-111111111111";
  const app = "22222222-2222-4222-8222-222222222222";
  for (const [method, path, body] of [
    ["POST", `/api/circles/${circle}/applications`, {}],
    ["GET", `/api/circles/${circle}/applications`, undefined],
    ["POST", `/api/circles/${circle}/applications/${app}/votes`, { decision: "ACCEPT" }],
    ["PUT", `/api/circles/${circle}/approvers`, { memberIds: [] }],
  ] as const) {
    const res = await server.request(path, { method, body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test("circle application routes validate ids and bodies before reaching the service", async () => {
  const token = await auth.token("66666666-6666-4666-8666-666666666666");
  const circle = "11111111-1111-4111-8111-111111111111";
  const app = "22222222-2222-4222-8222-222222222222";
  for (const [method, path, body, status, code] of [
    ["POST", `/api/circles/${circle}/applications/${app}/votes`, { decision: "MAYBE" }, 400, "VALIDATION_ERROR"],
    ["POST", `/api/circles/${circle}/applications/${app}/votes`, { decision: "ACCEPT", extra: 1 }, 400, "VALIDATION_ERROR"],
    ["POST", `/api/circles/${circle}/applications/not-a-uuid/votes`, { decision: "ACCEPT" }, 404, "APPLICATION_NOT_FOUND"],
    ["POST", `/api/circles/not-a-uuid/applications/${app}/votes`, { decision: "ACCEPT" }, 404, "CIRCLE_NOT_FOUND"],
    ["GET", `/api/circles/${circle}/applications?status=DONE`, undefined, 400, "VALIDATION_ERROR"],
    ["GET", `/api/circles/not-a-uuid/applications`, undefined, 404, "CIRCLE_NOT_FOUND"],
    ["PUT", `/api/circles/${circle}/approvers`, { memberIds: ["x"] }, 400, "VALIDATION_ERROR"],
    ["PUT", `/api/circles/${circle}/approvers`, { memberIds: Array.from({ length: 51 }, () => app) }, 400, "VALIDATION_ERROR"],
  ] as const) {
    const res = await server.request(path, { method, token, body });
    assert.equal(res.status, status, `${method} ${path} ${JSON.stringify(body)}`);
    assert.equal(errorCode(res.body), code);
  }
});

test("POST /api/internal/circles/tick without CRON_SECRET configured → 503 CRON_DISABLED", async () => {
  const res = await server.request("/api/internal/circles/tick", { method: "POST" });
  assert.equal(res.status, 503);
  assert.equal(errorCode(res.body), "CRON_DISABLED");
});

test("POST /api/internal/circles/tick checks x-cron-secret and returns the run summary", async () => {
  const secret = "s".repeat(40);
  let runs = 0;
  const cron = await startServer(
    fakeServices({ circleTick: { run: async () => (runs++, { circles: 3, failed: 1, noticesResent: 2 }) } }),
    { diditWebhookSecret: undefined, cronSecret: secret },
  );
  try {
    const tick = (headers: Record<string, string>) =>
      fetch(`${cron.baseUrl}/api/internal/circles/tick`, { method: "POST", headers });

    for (const headers of [{}, { "x-cron-secret": "wrong" }, { "x-cron-secret": secret.slice(1) }, { authorization: `Bearer ${secret}` }]) {
      const res = await tick(headers);
      assert.equal(res.status, 401, JSON.stringify(headers));
      assert.equal(errorCode(await res.json()), "UNAUTHORIZED");
    }
    assert.equal(runs, 0);

    const ok = await tick({ "x-cron-secret": secret });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { circles: 3, failed: 1, noticesResent: 2 });
    assert.equal(runs, 1);

    // Only POST: other methods don't reach the job.
    const get = await fetch(`${cron.baseUrl}/api/internal/circles/tick`, { headers: { "x-cron-secret": secret } });
    assert.equal(get.status, 404);
  } finally {
    await cron.close();
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

test("test clock routes don't exist unless TEST_CLOCKS_ENABLED", async () => {
  const token = await auth.token("11111111-1111-4111-8111-111111111111");
  for (const [method, path] of [
    ["POST", "/api/test-clocks"],
    ["GET", "/api/test-clocks/11111111-1111-4111-8111-111111111111"],
    ["POST", "/api/test-clocks/11111111-1111-4111-8111-111111111111/advance"],
  ] as const) {
    const res = await server.request(path, { method, token, body: method === "POST" ? { name: "x" } : undefined });
    assert.equal(res.status, 404, path);
    assert.equal(errorCode(res.body), "NOT_FOUND");
  }
});

test("GET /api/circles/:id is optional-auth: anonymous, signed in, or 401 for a bad token", async () => {
  const seen: unknown[] = [];
  const circles: Services["circles"] = {
    ...fakeServices().circles,
    get: async (_id, viewer) => {
      seen.push(viewer);
      return {} as Awaited<ReturnType<Services["circles"]["get"]>>;
    },
  };
  const circleServer = await startServer(fakeServices({ circles }));
  try {
    const id = "22222222-2222-4222-8222-222222222222";
    assert.equal((await circleServer.request(`/api/circles/${id}?invite=abc`)).status, 200);
    const userId = "11111111-1111-4111-8111-111111111111";
    assert.equal((await circleServer.request(`/api/circles/${id}`, { token: await auth.token(userId) })).status, 200);
    assert.deepEqual(seen, [
      { userId: undefined, invite: "abc" },
      { userId, invite: undefined },
    ]);
    const bad = await circleServer.request(`/api/circles/${id}`, { token: "not-a-jwt" });
    assert.equal(bad.status, 401);
    assert.equal(seen.length, 2);
  } finally {
    await circleServer.close();
  }
});
