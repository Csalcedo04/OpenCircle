import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import type { Services } from "../src/routes";

const services: Services = {
  users: { findById: async () => null },
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
  server = createApp(services).listen(0);
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
