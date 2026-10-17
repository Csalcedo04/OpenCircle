import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq, inArray, like, or, sql } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, consentChallenges, creditProfiles, kycVerifications, users, walletBalances, walletGrants, wallets } from "../src/db/schema";
import type { DiditClient } from "../src/services/didit/client";
import { createKycService } from "../src/services/kyc.service";
import type { OpenPaymentsGrantClient } from "../src/services/open-payments/client";
import { createTokenCipher } from "../src/services/open-payments/token-cipher";
import { createWalletConsentService } from "../src/services/wallet-consent.service";
import { createWalletAddressService } from "../src/services/open-payments/wallet-address.service";
import { createUserService } from "../src/services/user.service";
import { createWalletService, linkWalletInTx, walletInUse } from "../src/services/wallet.service";
import { createAccountService } from "../src/services/account.service";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeOpenPayments, fakeServices, TEST_WALLET_HOST } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

// Runs against the database in DATABASE_URL (Supabase). Every row it creates uses the
// "[test]" name prefix or a wallet under https://wallet.test/ and is deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const TEST_NAME_PREFIX = "[test] ";

let db: Db;
let server: TestServer;
let auth: TestAuth;
const createdUserIds: string[] = [];

async function deleteTestData(): Promise<void> {
  const testWallets = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(like(wallets.addressUrl, `https://${TEST_WALLET_HOST}/%`));
  const walletIds = testWallets.map((w) => w.id);

  // FK order: audit_events and users reference wallets without cascade.
  if (walletIds.length > 0) {
    await db.delete(auditEvents).where(inArray(auditEvents.walletId, walletIds));
  }
  // Consent, grant and KYC rows go with their user (ON DELETE CASCADE).
  const userFilters = [like(users.fullName, `${TEST_NAME_PREFIX}%`)];
  if (createdUserIds.length > 0) userFilters.push(inArray(users.id, createdUserIds));
  if (walletIds.length > 0) userFilters.push(inArray(users.opWallet, walletIds));
  await db.delete(users).where(or(...userFilters));
  if (walletIds.length > 0) {
    await db.delete(wallets).where(inArray(wallets.id, walletIds));
  }
}

async function newUser(): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  createdUserIds.push(id);
  return { id, token: await auth.token(id) };
}

// Random 10-digit number so parallel runs and reruns never collide on the document constraint.
const randomDocumentNumber = (): string => String(randomInt(1_000_000_000, 9_999_999_999));

const validProfile = () => ({
  fullName: `${TEST_NAME_PREFIX}Ana Gómez`,
  phone: "+573001234567",
  dob: "1995-04-12",
  nationality: "CO",
  documentType: "cc" as const,
  documentNumber: randomDocumentNumber(),
});

async function userWithProfile(): Promise<{ id: string; token: string }> {
  const user = await newUser();
  const res = await server.request("/api/users/me", { method: "POST", token: user.token, body: validProfile() });
  assert.equal(res.status, 201);
  return user;
}

const testWalletUrl = (name = "saver") => `https://${TEST_WALLET_HOST}/${name}-${randomUUID()}`;

// Links a test wallet the way consent completion does (the wallet server is faked as USD, scale 2).
async function link(userId: string, url: string) {
  try {
    return await db.transaction((tx) => linkWalletInTx(tx, userId, { id: url, assetCode: "USD", assetScale: 2 }));
  } catch (err) {
    throw walletInUse(err) ?? err;
  }
}

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (err: unknown) => (err as { code?: unknown }).code === code);

// External services these tests never reach.
const fail = async (): Promise<never> => {
  throw new Error("external service not used in this test");
};
const unusedGrantClient: OpenPaymentsGrantClient = {
  walletAddress: { get: fail, getKeys: fail, getDIDDocument: fail },
  grant: { request: fail, continue: fail, cancel: fail },
  token: { rotate: fail, revoke: fail },
};
const unusedDidit: DiditClient = { createSession: fail, getDecision: fail };

async function auditCount(walletId: string): Promise<number> {
  const rows = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.walletId, walletId));
  return rows.length;
}

describe("users API against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    auth = await setupTestAuth();
    db = createDb(databaseUrl ?? "");
    await deleteTestData();

    const userService = createUserService(db);
    server = await startServer({
      users: userService,
      wallets: createWalletService(db),
      account: createAccountService({ db }),
      debts: fakeServices().debts,
      walletAddresses: createWalletAddressService(fakeOpenPayments()),
      walletConsent: createWalletConsentService({
        db,
        client: unusedGrantClient,
        cipher: createTokenCipher(Buffer.alloc(32, 1).toString("base64")),
        users: userService,
        frontendUrl: "http://localhost:3001",
      }),
      kyc: createKycService({ db, didit: unusedDidit, frontendUrl: "http://localhost:3001" }),
      circles: fakeServices().circles,
      applications: fakeServices().applications,
      invites: fakeServices().invites,
      friends: fakeServices().friends,
      members: fakeServices().members,
      testClocks: null,
      circleTick: fakeServices().circleTick,
    });
  });

  after(async () => {
    await deleteTestData();
    await server.close();
    await db.$client.end();
  });

  describe("profile (onboarding)", () => {
    test("GET /me before onboarding → 404 PROFILE_NOT_FOUND", async () => {
      const { token } = await newUser();
      const res = await server.request("/api/users/me", { token });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
    });

    test("POST /me creates the profile keyed by the token subject, email from the token → 201", async () => {
      const { id, token } = await newUser();
      const body = validProfile();
      const res = await server.request("/api/users/me", { method: "POST", token, body });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body, { id, email: `${id}@example.test`, ...body, walletAddress: null });

      const again = await server.request("/api/users/me", { token });
      assert.deepEqual(again.body, res.body);
    });

    test("POST /me rejects an email in the body (it only comes from the token) → 400", async () => {
      const { token } = await newUser();
      const res = await server.request("/api/users/me", {
        method: "POST",
        token,
        body: { ...validProfile(), email: "someone-else@example.test" },
      });
      assert.equal(res.status, 400);
    });

    test("POST /me with a token that has no email → 400 EMAIL_REQUIRED, nothing stored", async () => {
      const id = randomUUID();
      createdUserIds.push(id);
      const token = await auth.token(id, { email: null });
      const res = await server.request("/api/users/me", { method: "POST", token, body: validProfile() });
      assert.equal(res.status, 400);
      assert.equal(errorCode(res.body), "EMAIL_REQUIRED");
      assert.equal((await db.select().from(users).where(eq(users.id, id))).length, 0);
    });

    test("email is stored lower-case and two accounts cannot share it → 409 EMAIL_IN_USE", async () => {
      const email = `Saver-${randomUUID()}@Example.TEST`;
      const firstId = randomUUID();
      const secondId = randomUUID();
      createdUserIds.push(firstId, secondId);

      const first = await server.request("/api/users/me", {
        method: "POST",
        token: await auth.token(firstId, { email }),
        body: validProfile(),
      });
      assert.equal(first.status, 201);
      assert.equal((first.body as { email: string }).email, email.toLowerCase());

      const second = await server.request("/api/users/me", {
        method: "POST",
        token: await auth.token(secondId, { email: email.toLowerCase() }),
        body: validProfile(),
      });
      assert.equal(second.status, 409);
      assert.equal(errorCode(second.body), "EMAIL_IN_USE");
    });

    describe("signing up again with the email of an existing profile", () => {
      const authIds: string[] = [];
      // A Supabase Auth user; deleting it (after) also deletes its profile (trigger on auth.users).
      async function authUser(email: string, confirmed: boolean): Promise<string> {
        const id = randomUUID();
        authIds.push(id);
        createdUserIds.push(id);
        await db.execute(sql`insert into auth.users (id, email, email_confirmed_at) values (${id}, ${email}, ${confirmed ? sql`now()` : null})`);
        return id;
      }
      after(async () => {
        if (authIds.length > 0) await db.execute(sql`delete from auth.users where id in ${authIds}`);
      });

      test("the profile's Auth user was deleted → the new Auth user takes it back (201)", async () => {
        const email = `saver-${randomUUID()}@example.test`;
        const oldId = randomUUID();
        createdUserIds.push(oldId);
        const original = validProfile();
        const first = await server.request("/api/users/me", { method: "POST", token: await auth.token(oldId, { email }), body: original });
        assert.equal(first.status, 201);

        const newId = await authUser(email, true);
        const res = await server.request("/api/users/me", {
          method: "POST",
          token: await auth.token(newId, { email }),
          body: { ...validProfile(), fullName: `${TEST_NAME_PREFIX}Someone Else` },
        });
        assert.equal(res.status, 201);
        // The stored profile, identity included, now under the new id.
        assert.deepEqual(res.body, { ...(first.body as object), id: newId });
        assert.equal((await db.select().from(users).where(eq(users.id, oldId))).length, 0);
      });

      test("the new Auth user has not confirmed the email → 409 EMAIL_IN_USE, profile untouched", async () => {
        const email = `saver-${randomUUID()}@example.test`;
        const oldId = randomUUID();
        createdUserIds.push(oldId);
        const first = await server.request("/api/users/me", { method: "POST", token: await auth.token(oldId, { email }), body: validProfile() });
        assert.equal(first.status, 201);

        const newId = await authUser(email, false);
        const res = await server.request("/api/users/me", { method: "POST", token: await auth.token(newId, { email }), body: validProfile() });
        assert.equal(res.status, 409);
        assert.equal(errorCode(res.body), "EMAIL_IN_USE");
        assert.equal((await db.select().from(users).where(eq(users.id, oldId))).length, 1);
      });

      test("the profile's Auth user still exists → 409 EMAIL_IN_USE, profile untouched", async () => {
        const email = `saver-${randomUUID()}@example.test`;
        const ownerId = await authUser(email, true);
        const first = await server.request("/api/users/me", { method: "POST", token: await auth.token(ownerId, { email }), body: validProfile() });
        assert.equal(first.status, 201);

        // Supabase keeps Auth emails unique, so the second account carries another address in auth.users.
        const otherId = await authUser(`other-${randomUUID()}@example.test`, true);
        const res = await server.request("/api/users/me", { method: "POST", token: await auth.token(otherId, { email }), body: validProfile() });
        assert.equal(res.status, 409);
        assert.equal(errorCode(res.body), "EMAIL_IN_USE");
        assert.equal((await db.select().from(users).where(eq(users.id, ownerId))).length, 1);
      });
    });

    test("the same document type and number cannot be registered twice → 409 DOCUMENT_IN_USE", async () => {
      const alice = await newUser();
      const bob = await newUser();
      const profile = validProfile();
      const first = await server.request("/api/users/me", { method: "POST", token: alice.token, body: profile });
      assert.equal(first.status, 201);

      const res = await server.request("/api/users/me", {
        method: "POST",
        token: bob.token,
        body: { ...validProfile(), documentType: profile.documentType, documentNumber: profile.documentNumber },
      });
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "DOCUMENT_IN_USE");
      assert.equal((await db.select().from(users).where(eq(users.id, bob.id))).length, 0);
    });

    test("the same number under a different document type is allowed → 201", async () => {
      const alice = await newUser();
      const bob = await newUser();
      const documentNumber = randomDocumentNumber();
      const first = await server.request("/api/users/me", {
        method: "POST",
        token: alice.token,
        body: { ...validProfile(), documentType: "cc", documentNumber },
      });
      const second = await server.request("/api/users/me", {
        method: "POST",
        token: bob.token,
        body: { ...validProfile(), documentType: "ce", documentNumber },
      });
      assert.deepEqual([first.status, second.status], [201, 201]);
    });

    test("passport numbers and nationality are normalized to upper case", async () => {
      const { token } = await newUser();
      const passport = `ab${randomInt(1_000_000, 9_999_999)}`;
      const res = await server.request("/api/users/me", {
        method: "POST",
        token,
        body: { ...validProfile(), documentType: "pp", documentNumber: passport, nationality: "ve" },
      });
      assert.equal(res.status, 201);
      const body = res.body as { documentNumber: string; nationality: string };
      assert.equal(body.documentNumber, passport.toUpperCase());
      assert.equal(body.nationality, "VE");
    });

    test("invalid identity fields → 400 on the offending field", async () => {
      const { token } = await newUser();
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ documentType: "cc", documentNumber: "12A456" }, "documentNumber"],
        [{ documentType: "ti", documentNumber: "12" }, "documentNumber"],
        [{ documentType: "pp", documentNumber: "AB1" }, "documentNumber"],
        [{ documentType: "xx" }, "documentType"],
        [{ nationality: "COL" }, "nationality"],
      ];
      for (const [override, path] of cases) {
        const res = await server.request("/api/users/me", {
          method: "POST",
          token,
          body: { ...validProfile(), ...override },
        });
        assert.equal(res.status, 400, JSON.stringify(override));
        const issues = (res.body as { error: { issues: Array<{ path: string }> } }).error.issues;
        assert.ok(
          issues.some((i) => i.path === path),
          `${JSON.stringify(override)} → ${JSON.stringify(issues)}`,
        );
      }
    });

    test("POST /me twice → 409 PROFILE_EXISTS", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me", { method: "POST", token, body: validProfile() });
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "PROFILE_EXISTS");
    });

    test("POST /me with invalid fields → 400 with one issue per field, nothing stored", async () => {
      const { id, token } = await newUser();
      const res = await server.request("/api/users/me", {
        method: "POST",
        token,
        body: { ...validProfile(), fullName: "   ", phone: "3001234567", dob: "2999-01-01" },
      });
      assert.equal(res.status, 400);
      assert.equal(errorCode(res.body), "VALIDATION_ERROR");
      const paths = (res.body as { error: { issues: Array<{ path: string }> } }).error.issues.map((i) => i.path);
      assert.deepEqual(paths.sort(), ["dob", "fullName", "phone"]);
      assert.equal((await db.select().from(users).where(eq(users.id, id))).length, 0);
    });

    test("POST /me rejects fields the user must not set (id, opWallet) → 400", async () => {
      const { token } = await newUser();
      for (const extra of [{ id: randomUUID() }, { opWallet: randomUUID() }]) {
        const res = await server.request("/api/users/me", {
          method: "POST",
          token,
          body: { ...validProfile(), ...extra },
        });
        assert.equal(res.status, 400, JSON.stringify(extra));
      }
    });

    test("PATCH /me updates only the given fields → 200", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me", { method: "PATCH", token, body: { phone: "+573109876543" } });
      assert.equal(res.status, 200);
      const body = res.body as { phone: string; fullName: string; dob: string };
      assert.equal(body.phone, "+573109876543");
      assert.equal(body.fullName, validProfile().fullName);
      assert.equal(body.dob, validProfile().dob);
    });

    test("PATCH /me can change nationality but not identity fields", async () => {
      const { token } = await userWithProfile();
      const ok = await server.request("/api/users/me", { method: "PATCH", token, body: { nationality: "EC" } });
      assert.equal(ok.status, 200);
      assert.equal((ok.body as { nationality: string }).nationality, "EC");

      for (const field of [
        { documentType: "pp" },
        { documentNumber: randomDocumentNumber() },
        { email: "new@example.test" },
      ]) {
        const res = await server.request("/api/users/me", { method: "PATCH", token, body: field });
        assert.equal(res.status, 400, JSON.stringify(field));
      }
    });

    test("PATCH /me with an empty body → 400", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me", { method: "PATCH", token, body: {} });
      assert.equal(res.status, 400);
    });

    test("PATCH /me before onboarding → 404 PROFILE_NOT_FOUND", async () => {
      const { token } = await newUser();
      const res = await server.request("/api/users/me", { method: "PATCH", token, body: { phone: "+573109876543" } });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
    });

    test("each user only sees their own profile", async () => {
      const alice = await userWithProfile();
      const bob = await userWithProfile();
      const res = await server.request("/api/users/me", { token: alice.token });
      assert.equal((res.body as { id: string }).id, alice.id);
      assert.notEqual(alice.id, bob.id);
    });
  });

  describe("wallet linking (linkWalletInTx, used by consent completion)", () => {
    test("before onboarding → PROFILE_NOT_FOUND, nothing stored", async () => {
      const { id } = await newUser();
      const url = testWalletUrl();
      await rejectsWith(link(id, url), "PROFILE_NOT_FOUND");
      assert.equal((await db.select().from(wallets).where(eq(wallets.addressUrl, url))).length, 0);
    });

    test("links the wallet with zero balance and one audit event", async () => {
      const { id, token } = await userWithProfile();
      const url = testWalletUrl();

      const { wallet, created } = await link(id, url);
      assert.equal(created, true);
      assert.equal(wallet.addressUrl, url);
      assert.equal(wallet.assetCode, "USD");
      assert.equal(wallet.assetScale, 2);

      const [user] = await db.select().from(users).where(eq(users.id, id));
      assert.equal(user?.opWallet, wallet.id);
      const [balance] = await db.select().from(walletBalances).where(eq(walletBalances.walletId, wallet.id));
      assert.equal(balance?.balance, 0n);
      const events = await db.select().from(auditEvents).where(eq(auditEvents.walletId, wallet.id));
      assert.equal(events.length, 1);
      assert.equal(events[0]?.eventType, "wallet.linked");
      assert.equal(events[0]?.amount, null);

      const profile = await server.request("/api/users/me", { token });
      assert.equal((profile.body as { walletAddress: string }).walletAddress, url);
    });

    test("linking the same wallet again is idempotent, no new audit event", async () => {
      const { id } = await userWithProfile();
      const url = testWalletUrl();
      const first = await link(id, url);
      const second = await link(id, url);
      assert.equal(second.created, false);
      assert.deepEqual(second.wallet, first.wallet);
      assert.equal(await auditCount(first.wallet.id), 1);
    });

    test("concurrent links for the same user and wallet create it once", async () => {
      const { id } = await userWithProfile();
      const url = testWalletUrl();
      const results = await Promise.all([1, 2, 3].map(() => link(id, url)));
      assert.deepEqual(results.map((r) => r.created).sort(), [false, false, true]);
      assert.equal(await auditCount(results[0]?.wallet.id ?? ""), 1);
    });

    test("a different wallet when one is already linked → WALLET_ALREADY_LINKED", async () => {
      const { id } = await userWithProfile();
      await link(id, testWalletUrl());
      await rejectsWith(link(id, testWalletUrl()), "WALLET_ALREADY_LINKED");
    });

    test("a wallet already linked to another user → WALLET_IN_USE", async () => {
      const alice = await userWithProfile();
      const bob = await userWithProfile();
      const url = testWalletUrl();
      await link(alice.id, url);

      await rejectsWith(link(bob.id, url), "WALLET_IN_USE");
      const [user] = await db.select().from(users).where(eq(users.id, bob.id));
      assert.equal(user?.opWallet, null);
    });
  });

  describe("deleting a user", () => {
    test("cascades to consent, grants and KYC; the wallet and its audit history stay", async () => {
      const { id } = await userWithProfile();
      const { wallet } = await link(id, testWalletUrl());
      const expiresAt = new Date(Date.now() + 600_000);
      await db.insert(consentChallenges).values({
        userId: id,
        state: randomUUID(),
        walletAddressUrl: wallet.addressUrl,
        grantEndpoint: `https://${TEST_WALLET_HOST}/auth`,
        clientNonce: "client-nonce",
        finishNonce: "finish-nonce",
        continueUri: `https://${TEST_WALLET_HOST}/continue`,
        continueTokenCiphertext: "ciphertext",
        expiresAt,
      });
      await db.insert(walletGrants).values({
        userId: id,
        walletId: wallet.id,
        accessTokenCiphertext: "ciphertext",
        manageUri: `https://${TEST_WALLET_HOST}/token`,
        continueUri: `https://${TEST_WALLET_HOST}/continue`,
      });
      await db.insert(kycVerifications).values({ userId: id, sessionId: randomUUID(), status: "Approved" });

      await db.delete(users).where(eq(users.id, id));

      assert.equal((await db.select().from(users).where(eq(users.id, id))).length, 0);
      assert.equal((await db.select().from(consentChallenges).where(eq(consentChallenges.userId, id))).length, 0);
      assert.equal((await db.select().from(walletGrants).where(eq(walletGrants.userId, id))).length, 0);
      assert.equal((await db.select().from(kycVerifications).where(eq(kycVerifications.userId, id))).length, 0);
      assert.equal((await db.select().from(wallets).where(eq(wallets.id, wallet.id))).length, 1);
      assert.equal(await auditCount(wallet.id), 1);
    });
  });

  describe("POST /me/wallet/consent", () => {
    test("PUT /me/wallet no longer exists → 404", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: testWalletUrl() } });
      assert.equal(res.status, 404);
    });

    test("before onboarding → 404 PROFILE_NOT_FOUND, nothing stored", async () => {
      const { id, token } = await newUser();
      const res = await server.request("/api/users/me/wallet/consent", {
        method: "POST",
        token,
        body: { walletAddress: "$ilp.interledger-test.dev/alice" },
      });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
      assert.equal((await db.select().from(consentChallenges).where(eq(consentChallenges.userId, id))).length, 0);
    });

    test("wallets outside the Interledger test network → 422 WALLET_NOT_ALLOWED", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me/wallet/consent", {
        method: "POST",
        token,
        body: { walletAddress: testWalletUrl() },
      });
      assert.equal(res.status, 422);
      assert.equal(errorCode(res.body), "WALLET_NOT_ALLOWED");
    });

    test("invalid wallet address → 400 VALIDATION_ERROR", async () => {
      const { token } = await userWithProfile();
      for (const walletAddress of ["http://wallet.test/alice", "alice", 42]) {
        const res = await server.request("/api/users/me/wallet/consent", { method: "POST", token, body: { walletAddress } });
        assert.equal(res.status, 400, String(walletAddress));
        assert.equal(errorCode(res.body), "VALIDATION_ERROR");
      }
    });

    test("completing an unknown or another user's consent → 404 CONSENT_NOT_FOUND", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me/wallet/consent/complete", {
        method: "POST",
        token,
        body: { state: "x".repeat(43), interactRef: "ref", hash: "hash" },
      });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "CONSENT_NOT_FOUND");
    });
  });

  describe("GET /wallet-addresses", () => {
    test("a payment pointer resolves to the wallet's public details → 200", async () => {
      const { token } = await userWithProfile();
      const url = testWalletUrl();
      const pointer = encodeURIComponent(`$${url.slice("https://".length)}`);
      const res = await server.request(`/api/wallet-addresses?url=${pointer}`, { token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        id: url,
        publicName: "Test wallet",
        assetCode: "USD",
        assetScale: 2,
        authServer: `https://auth.${TEST_WALLET_HOST}`,
        resourceServer: `https://${TEST_WALLET_HOST}`,
      });
    });

    test("without a token → 401", async () => {
      const res = await server.request(`/api/wallet-addresses?url=${encodeURIComponent(testWalletUrl())}`);
      assert.equal(res.status, 401);
    });

    test("wallet address unknown to its wallet server → 404 WALLET_ADDRESS_NOT_FOUND", async () => {
      const { token } = await userWithProfile();
      const url = encodeURIComponent(testWalletUrl("missing"));
      const res = await server.request(`/api/wallet-addresses?url=${url}`, { token });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "WALLET_ADDRESS_NOT_FOUND");
    });

    test("wallet server failure → 502 OPEN_PAYMENTS_ERROR", async () => {
      const { token } = await userWithProfile();
      const url = encodeURIComponent(testWalletUrl("down"));
      const res = await server.request(`/api/wallet-addresses?url=${url}`, { token });
      assert.equal(res.status, 502);
      assert.equal(errorCode(res.body), "OPEN_PAYMENTS_ERROR");
    });
  });

  describe("KYC", () => {
    test("GET /me/kyc before starting → not started, not approved", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me/kyc", { token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { status: null, approved: false });
    });

    test("starting KYC without a linked wallet → 409 ONBOARDING_REQUIRED", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me/kyc/session", {
        method: "POST",
        token,
        body: { locale: "es", returnPath: "/es/circles/new" },
      });
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "ONBOARDING_REQUIRED");
    });
  });

  describe("GET /me/savings", () => {
    test("before onboarding → 404 PROFILE_NOT_FOUND", async () => {
      const { token } = await newUser();
      const res = await server.request("/api/users/me/savings", { token });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
    });

    test("without a linked wallet → 404 WALLET_NOT_LINKED", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me/savings", { token });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "WALLET_NOT_LINKED");
    });

    test("after linking → zero balance as an integer string with its asset, no score yet", async () => {
      const { id, token } = await userWithProfile();
      const url = testWalletUrl();
      await link(id, url);

      const res = await server.request("/api/users/me/savings", { token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        walletAddress: url,
        balance: { value: "0", assetCode: "USD", assetScale: 2 },
        ics: null,
      });
    });

    test("exposes the ICS (0..100) but never the internal borrowing capacity", async () => {
      const { id, token } = await userWithProfile();
      const walletId = (await link(id, testWalletUrl())).wallet.id;
      await db.update(walletBalances).set({ balance: 1250075n }).where(eq(walletBalances.walletId, walletId));
      await db.insert(creditProfiles).values({ walletId, internalCreditScore: 0.8734, borrowingCapacity: 987654321n });

      const res = await server.request("/api/users/me/savings", { token });
      assert.equal(res.status, 200);
      const body = res.body as { balance: { value: string }; ics: number };
      assert.equal(body.balance.value, "1250075");
      assert.equal(body.ics, 87.34);
      assert.deepEqual(Object.keys(body).sort(), ["balance", "ics", "walletAddress"]);
      assert.ok(!res.text.includes("987654321"), "borrowing capacity leaked");
      assert.ok(!/credit|borrow/i.test(res.text), "credit wording leaked");
    });
  });

  // Who may see whom is covered in circles.integration.test.ts; here the user views themselves.
  describe("GET /:id/public and /public (savings-circle applicant)", () => {
    const byWallet = (walletAddress: string) => `/api/users/public?walletAddress=${encodeURIComponent(walletAddress)}`;

    test("by id and by wallet → only name, wallet and ICS on the 0..100 scale", async () => {
      const applicant = await userWithProfile();
      const url = testWalletUrl("applicant");
      const walletId = (await link(applicant.id, url)).wallet.id;
      await db.insert(creditProfiles).values({ walletId, internalCreditScore: 0.8734, borrowingCapacity: 987654321n });

      const expected = { fullName: `${TEST_NAME_PREFIX}Ana Gómez`, walletAddress: url, ics: 87.34 };
      for (const path of [`/api/users/${applicant.id}/public`, byWallet(url), byWallet(`$${url.slice("https://".length)}`)]) {
        const res = await server.request(path, { token: applicant.token });
        assert.equal(res.status, 200, path);
        assert.deepEqual(res.body, expected, path);
        assert.ok(!res.text.includes("987654321"), "borrowing capacity leaked");
      }
    });

    test("no score yet → ics is null", async () => {
      const applicant = await userWithProfile();
      await link(applicant.id, testWalletUrl("applicant"));

      const res = await server.request(`/api/users/${applicant.id}/public`, { token: applicant.token });
      assert.equal(res.status, 200);
      assert.equal((res.body as { ics: unknown }).ics, null);
    });

    test("unknown user, user without a wallet, or unknown wallet → 404 PROFILE_NOT_FOUND", async () => {
      const noWallet = await userWithProfile();
      for (const path of [`/api/users/${randomUUID()}/public`, `/api/users/${noWallet.id}/public`, byWallet(testWalletUrl("ghost"))]) {
        const res = await server.request(path, { token: noWallet.token });
        assert.equal(res.status, 404, path);
        assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
      }
    });
  });
});
