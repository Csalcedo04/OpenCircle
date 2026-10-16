import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeServices } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

let server: TestServer;
let auth: TestAuth;

before(async () => {
  auth = await setupTestAuth();
  server = await startServer(fakeServices());
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
