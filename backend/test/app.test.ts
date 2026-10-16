import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { createHmac } from "node:crypto";
import type { Services } from "../src/routes";

const WEBHOOK_SECRET = "test-webhook-secret";
const webhookEvents: Parameters<Services["kyc"]["handleWebhook"]>[0][] = [];

const services: Services = {
  users: {
    findById: async () => null,
    updateProfile: async () => {
      throw new Error("not called in these tests");
    },
    getById: async () => {
      throw new Error("not called in these tests");
    },
  },
  walletConsent: {
    start: async () => {
      throw new Error("not called in these tests");
    },
    complete: async () => {
      throw new Error("not called in these tests");
    },
  },
  kyc: {
    getStatus: async () => {
      throw new Error("not called in these tests");
    },
    startSession: async () => {
      throw new Error("not called in these tests");
    },
    handleWebhook: async (event) => {
      webhookEvents.push(event);
      return event.vendorData === "11111111-1111-4111-8111-111111111111" ? "applied" : "ignored";
    },
  },
  walletAddresses: {
    getByUrl: async () => {
      throw new Error("not called in these tests");
    },
  },
};

let server: Server;
let baseUrl: string;

before(async () => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  server = createApp(services, { diditWebhookSecret: WEBHOOK_SECRET }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

test("GET /api/health returns ok", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("unknown route returns 404", async () => {
  const res = await fetch(`${baseUrl}/api/nope`);
  assert.equal(res.status, 404);
});

test("GET /api/users/me without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/users/me`);
  assert.equal(res.status, 401);
});

test("GET /api/wallet-addresses without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/wallet-addresses?url=https://example.com/alice`);
  assert.equal(res.status, 401);
});

test("PATCH /api/users/me without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/users/me`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: "Ana" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/users/me/wallet/consent without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/users/me/wallet/consent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "$ilp.interledger-test.dev/alice" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/users/me/wallet/consent/complete without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/users/me/wallet/consent/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: "x".repeat(43), interactRef: "ref", hash: "hash" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/users/me/kyc without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/users/me/kyc`);
  assert.equal(res.status, 401);
});

function signed(body: string, timestamp = Math.floor(Date.now() / 1000)) {
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

test("Didit webhook applies a correctly signed status event", async () => {
  const res = await fetch(`${baseUrl}/api/webhooks/didit`, { method: "POST", headers: signed(statusEvent), body: statusEvent });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, result: "applied" });
  assert.deepEqual(webhookEvents.at(-1), {
    sessionId: "22222222-2222-4222-8222-222222222222",
    status: "Approved",
    vendorData: "11111111-1111-4111-8111-111111111111",
  });
});

test("Didit webhook rejects a bad signature, a changed body and a stale timestamp", async () => {
  const count = webhookEvents.length;
  const tampered = statusEvent.replace("Approved", "Declined");
  for (const [headers, body] of [
    [{ ...signed(statusEvent), "x-signature": "00".repeat(32) }, statusEvent],
    [signed(statusEvent), tampered],
    [signed(statusEvent, Math.floor(Date.now() / 1000) - 301), statusEvent],
    [{ "content-type": "application/json" }, statusEvent],
  ] as const) {
    const res = await fetch(`${baseUrl}/api/webhooks/didit`, { method: "POST", headers, body });
    assert.equal(res.status, 401);
  }
  assert.equal(webhookEvents.length, count);
});

test("Didit webhook acknowledges signed events it doesn't act on", async () => {
  const other = JSON.stringify({ webhook_type: "data.updated", session_id: "not-a-uuid" });
  const res = await fetch(`${baseUrl}/api/webhooks/didit`, { method: "POST", headers: signed(other), body: other });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, result: "ignored" });
});

test("Didit webhook answers 503 when no secret is configured", async () => {
  const app = createApp(services, { diditWebhookSecret: undefined }).listen(0);
  await new Promise<void>((resolve) => app.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/webhooks/didit`;
    const res = await fetch(url, { method: "POST", headers: signed(statusEvent), body: statusEvent });
    assert.equal(res.status, 503);
  } finally {
    app.close();
  }
});
