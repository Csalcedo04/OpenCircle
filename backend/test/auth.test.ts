import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeServices } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

const USER_ID = "5f0c6f43-58b4-4bd3-9f0e-7c2b9b0f6d11";

let server: TestServer;
let auth: TestAuth;

before(async () => {
  auth = await setupTestAuth();
  server = await startServer(
    fakeServices({
      users: {
        ...fakeServices().users,
        // Echoes the caller id so tests can see which identity reached the service.
        getProfile: async (id) => ({
          id,
          email: `${id}@example.test`,
          documentType: "cc",
          documentNumber: "1000000000",
          nationality: "CO",
          fullName: null,
          phone: null,
          dob: null,
          walletAddress: null,
          internalAccount: null,
        }),
        createProfile: async () => {
          throw new Error("not used");
        },
        updateProfile: async () => {
          throw new Error("not used");
        },
      },
    }),
  );
});

after(() => server.close());

describe("protected routes reject requests without a valid Supabase JWT", () => {
  const cases: Array<[string, () => Promise<string | undefined>]> = [
    ["no Authorization header", async () => undefined],
    ["a token that is not a JWT", async () => "not-a-jwt"],
    ["a token signed by a key outside the JWKS", () => auth.token(USER_ID, { foreignKey: true })],
    ["an expired token", () => auth.token(USER_ID, { expiresAt: Math.floor(Date.now() / 1000) - 60 })],
    ["a token without a kid header", () => auth.token(USER_ID, { withoutKid: true })],
  ];

  for (const [name, makeToken] of cases) {
    test(`${name} → 401`, async () => {
      const token = await makeToken();
      const res = await server.request("/api/users/me", token === undefined ? {} : { token });
      assert.equal(res.status, 401);
      assert.deepEqual(Object.keys(res.body as object), ["error"]);
      assert.equal((res.body as { error: { message: string } }).error.message, "Unauthorized");
    });
  }

  test("every user and wallet-address route is protected", async () => {
    const routes: Array<[string, string]> = [
      ["GET", "/api/users/me"],
      ["POST", "/api/users/me"],
      ["PATCH", "/api/users/me"],
      ["PUT", "/api/users/me/wallet"],
      ["GET", "/api/users/me/savings"],
      ["GET", "/api/wallet-addresses?url=https://wallet.test/alice"],
    ];
    for (const [method, path] of routes) {
      const res = await server.request(path, { method });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });
});

describe("valid Supabase JWT", () => {
  test("reaches the handler with the token subject as the user id", async () => {
    const res = await server.request("/api/users/me", { token: await auth.token(USER_ID) });
    assert.equal(res.status, 200);
    assert.equal((res.body as { id: string }).id, USER_ID);
  });

  test("the user id comes only from the token, never from the request", async () => {
    const other = "0b1f4c9e-1111-4a4a-9b9b-222222222222";
    const res = await server.request(`/api/users/me?id=${other}`, { token: await auth.token(USER_ID) });
    assert.equal((res.body as { id: string }).id, USER_ID);
  });

  test("authenticated request with invalid input still gets validated (400)", async () => {
    const res = await server.request("/api/wallet-addresses?url=http://wallet.test/alice", {
      token: await auth.token(USER_ID),
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), "VALIDATION_ERROR");
  });
});
