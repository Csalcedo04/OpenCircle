import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq, inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, creditProfiles, users, walletBalances, wallets } from "../src/db/schema";
import { createWalletAddressService } from "../src/services/open-payments/wallet-address.service";
import { createUserService } from "../src/services/user.service";
import { createWalletService } from "../src/services/wallet.service";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeOpenPayments, TEST_WALLET_HOST } from "./helpers/fakes";
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

async function auditCount(walletId: string): Promise<number> {
  const rows = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.walletId, walletId));
  return rows.length;
}

describe("users API against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    auth = await setupTestAuth();
    db = createDb(databaseUrl ?? "");
    await deleteTestData();

    const walletAddresses = createWalletAddressService(fakeOpenPayments());
    server = await startServer({
      users: createUserService(db),
      wallets: createWalletService(db, walletAddresses),
      walletAddresses,
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

  describe("PUT /me/wallet (link Open Payments wallet)", () => {
    test("before onboarding → 404 PROFILE_NOT_FOUND, nothing stored", async () => {
      const { token } = await newUser();
      const url = testWalletUrl();
      const res = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: url } });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
      assert.equal((await db.select().from(wallets).where(eq(wallets.addressUrl, url))).length, 0);
    });

    test("payment pointer links the wallet → 201 with zero balance and one audit event", async () => {
      const { id, token } = await userWithProfile();
      const url = testWalletUrl();
      const pointer = `$${url.slice("https://".length)}`;

      const res = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: pointer } });
      assert.equal(res.status, 201);
      const wallet = res.body as { id: string; addressUrl: string; assetCode: string; assetScale: number };
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

    test("linking the same wallet again (pointer or URL) is idempotent → 200, no new audit event", async () => {
      const { token } = await userWithProfile();
      const url = testWalletUrl();
      const first = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: url } });
      assert.equal(first.status, 201);
      const walletId = (first.body as { id: string }).id;

      const pointer = `$${url.slice("https://".length)}`;
      const second = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: pointer } });
      assert.equal(second.status, 200);
      assert.deepEqual(second.body, first.body);
      assert.equal(await auditCount(walletId), 1);
    });

    test("concurrent link requests for the same user and wallet create it once", async () => {
      const { token } = await userWithProfile();
      const url = testWalletUrl();
      const results = await Promise.all(
        [1, 2, 3].map(() => server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: url } })),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 201]);
      assert.equal(await auditCount((results[0]?.body as { id: string }).id), 1);
    });

    test("a different wallet when one is already linked → 409 WALLET_ALREADY_LINKED", async () => {
      const { token } = await userWithProfile();
      await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: testWalletUrl() } });
      const res = await server.request("/api/users/me/wallet", {
        method: "PUT",
        token,
        body: { walletAddress: testWalletUrl() },
      });
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "WALLET_ALREADY_LINKED");
    });

    test("a wallet already linked to another user → 409 WALLET_IN_USE", async () => {
      const alice = await userWithProfile();
      const bob = await userWithProfile();
      const url = testWalletUrl();
      await server.request("/api/users/me/wallet", { method: "PUT", token: alice.token, body: { walletAddress: url } });

      const res = await server.request("/api/users/me/wallet", { method: "PUT", token: bob.token, body: { walletAddress: url } });
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "WALLET_IN_USE");
      const [user] = await db.select().from(users).where(eq(users.id, bob.id));
      assert.equal(user?.opWallet, null);
    });

    test("invalid wallet address → 400 VALIDATION_ERROR", async () => {
      const { token } = await userWithProfile();
      for (const walletAddress of ["http://wallet.test/alice", "alice", 42]) {
        const res = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress } });
        assert.equal(res.status, 400, String(walletAddress));
        assert.equal(errorCode(res.body), "VALIDATION_ERROR");
      }
    });

    test("wallet address unknown to its wallet server → 404 WALLET_ADDRESS_NOT_FOUND, nothing stored", async () => {
      const { token } = await userWithProfile();
      const url = testWalletUrl("missing");
      const res = await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: url } });
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "WALLET_ADDRESS_NOT_FOUND");
      assert.equal((await db.select().from(wallets).where(eq(wallets.addressUrl, url))).length, 0);
    });

    test("wallet server failure → 502 OPEN_PAYMENTS_ERROR", async () => {
      const { token } = await userWithProfile();
      const res = await server.request("/api/users/me/wallet", {
        method: "PUT",
        token,
        body: { walletAddress: testWalletUrl("down") },
      });
      assert.equal(res.status, 502);
      assert.equal(errorCode(res.body), "OPEN_PAYMENTS_ERROR");
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
      const { token } = await userWithProfile();
      const url = testWalletUrl();
      await server.request("/api/users/me/wallet", { method: "PUT", token, body: { walletAddress: url } });

      const res = await server.request("/api/users/me/savings", { token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        walletAddress: url,
        balance: { value: "0", assetCode: "USD", assetScale: 2 },
        paymentScore: null,
      });
    });

    test("exposes the payment score but never the internal borrowing capacity", async () => {
      const { token } = await userWithProfile();
      const linked = await server.request("/api/users/me/wallet", {
        method: "PUT",
        token,
        body: { walletAddress: testWalletUrl() },
      });
      const walletId = (linked.body as { id: string }).id;
      await db.update(walletBalances).set({ balance: 1250075n }).where(eq(walletBalances.walletId, walletId));
      await db.insert(creditProfiles).values({ walletId, internalCreditScore: "0.8734", borrowingCapacity: 987654321n });

      const res = await server.request("/api/users/me/savings", { token });
      assert.equal(res.status, 200);
      const body = res.body as { balance: { value: string }; paymentScore: string };
      assert.equal(body.balance.value, "1250075");
      assert.equal(body.paymentScore, "0.8734");
      assert.deepEqual(Object.keys(body).sort(), ["balance", "paymentScore", "walletAddress"]);
      assert.ok(!res.text.includes("987654321"), "borrowing capacity leaked");
      assert.ok(!/credit|borrow/i.test(res.text), "credit wording leaked");
    });
  });
});
