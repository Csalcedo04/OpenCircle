import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq, inArray, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, kycVerifications, ledgerAccounts, ledgerTransfers, users } from "../src/db/schema";
import { createAccountService } from "../src/services/account.service";
import type { DiditClient } from "../src/services/didit/client";
import { createKycService } from "../src/services/kyc.service";
import { createInternalAccountService } from "../src/services/ledger/internal-account.service";
import { createUserService } from "../src/services/user.service";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeServices } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

// Runs against the database in DATABASE_URL (Supabase). Accounts use a test-only asset so they
// never mix with real balances; the SYSTEM accounts in that asset are shared across runs and kept.
const databaseUrl = process.env.DATABASE_URL;
const TEST_NAME_PREFIX = "[test] ";
const ASSET = { assetCode: "TIA", assetScale: 2 };
const SEED = 50_000n;
const FRONTEND_URL = "http://localhost:3001";

let db: Db;
let auth: TestAuth;
let seeded: TestServer;
let unseeded: TestServer;
const createdUserIds: string[] = [];
let diditSessions = 0;

const fakeDidit: DiditClient = {
  async createSession() {
    diditSessions++;
    return { sessionId: randomUUID(), status: "Not Started", url: "https://didit.test/session" };
  },
  async getDecision() {
    throw new Error("not used in this test");
  },
};

async function deleteTestData(): Promise<void> {
  if (createdUserIds.length === 0) return;
  const accounts = (await db.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(inArray(ledgerAccounts.ownerUserId, createdUserIds))).map((a) => a.id);
  if (accounts.length > 0) {
    const touching = or(inArray(ledgerTransfers.fromAccountId, accounts), inArray(ledgerTransfers.toAccountId, accounts));
    const keys = (await db.select({ key: ledgerTransfers.idempotencyKey }).from(ledgerTransfers).where(touching)).map((r) => r.key);
    if (keys.length > 0) {
      await db.delete(auditEvents).where(inArray(auditEvents.externalId, keys.flatMap((k) => [`ledger.debit:${k}`, `ledger.credit:${k}`])));
    }
    await db.delete(auditEvents).where(inArray(auditEvents.accountId, accounts));
    await db.delete(ledgerTransfers).where(touching);
    await db.delete(ledgerAccounts).where(inArray(ledgerAccounts.id, accounts));
  }
  // KYC rows cascade with the user.
  await db.delete(users).where(inArray(users.id, createdUserIds));
}

async function newUser(server: TestServer, withProfile = true): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  createdUserIds.push(id);
  const token = await auth.token(id);
  if (withProfile) {
    const res = await server.request("/api/users/me", {
      method: "POST",
      token,
      body: {
        fullName: `${TEST_NAME_PREFIX}Ana Gómez`,
        phone: "+573001234567",
        dob: "1995-04-12",
        nationality: "CO",
        documentType: "cc",
        documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
      },
    });
    assert.equal(res.status, 201);
  }
  return { id, token };
}

function services(seedValue: bigint) {
  const userService = createUserService(db);
  return {
    ...fakeServices(),
    users: userService,
    account: createAccountService({ db }),
    internalAccounts: createInternalAccountService({ db, resolveAsset: async () => ASSET, seedValue }),
    kyc: createKycService({ db, didit: fakeDidit, frontendUrl: FRONTEND_URL }),
  };
}

describe("internal accounts API against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    auth = await setupTestAuth();
    db = createDb(databaseUrl ?? "");
    seeded = await startServer(services(SEED));
    unseeded = await startServer(services(0n));
  });

  after(async () => {
    await deleteTestData();
    await seeded.close();
    await unseeded.close();
    await db.$client.end();
  });

  test("creating an account without a profile → 404 PROFILE_NOT_FOUND", async () => {
    const { token } = await newUser(seeded, false);
    const res = await seeded.request("/api/users/me/internal-account", { method: "POST", token });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), "PROFILE_NOT_FOUND");
  });

  test("without seeding: a new account starts at zero with no movements", async () => {
    const { token } = await newUser(unseeded);
    const res = await unseeded.request("/api/users/me/internal-account", { method: "POST", token });
    assert.equal(res.status, 201);
    const body = res.body as { id: string; balance: { value: string; assetCode: string; assetScale: number } };
    assert.deepEqual(body.balance, { value: "0", ...ASSET });

    const movements = await unseeded.request("/api/users/me/internal-account/movements", { token });
    assert.equal(movements.status, 200);
    assert.deepEqual(movements.body, []);
  });

  test("with seeding: the account is credited once, as a SEED movement from DEMO_SEED, and audited", async () => {
    const { token } = await newUser(seeded);
    const res = await seeded.request("/api/users/me/internal-account", { method: "POST", token });
    assert.equal(res.status, 201);
    const account = res.body as { id: string; balance: { value: string } };
    assert.equal(account.balance.value, SEED.toString());

    const movements = (await seeded.request("/api/users/me/internal-account/movements", { token })).body as Array<{
      kind: string;
      direction: string;
      amount: { value: string };
      counterparty: unknown;
    }>;
    assert.equal(movements.length, 1);
    assert.equal(movements[0]?.kind, "SEED");
    assert.equal(movements[0]?.direction, "IN");
    assert.equal(movements[0]?.amount.value, SEED.toString());
    assert.deepEqual(movements[0]?.counterparty, { kind: "SYSTEM", code: "DEMO_SEED" });

    const audits = await db.select({ type: auditEvents.eventType }).from(auditEvents).where(eq(auditEvents.accountId, account.id));
    assert.deepEqual(audits.map((a) => a.type).sort(), ["account.created", "account.seeded", "ledger.credit"]);
  });

  test("a second create → 409 INTERNAL_ACCOUNT_EXISTS, and the balance does not change", async () => {
    const { token } = await newUser(seeded);
    await seeded.request("/api/users/me/internal-account", { method: "POST", token });
    const again = await seeded.request("/api/users/me/internal-account", { method: "POST", token });
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.body), "INTERNAL_ACCOUNT_EXISTS");
    const current = (await seeded.request("/api/users/me/internal-account", { token })).body as { balance: { value: string } };
    assert.equal(current.balance.value, SEED.toString());
  });

  test("GET before creating → 404 INTERNAL_ACCOUNT_NOT_FOUND; another user never sees it", async () => {
    const owner = await newUser(seeded);
    const stranger = await newUser(seeded);
    const missing = await seeded.request("/api/users/me/internal-account", { token: owner.token });
    assert.equal(missing.status, 404);
    assert.equal(errorCode(missing.body), "INTERNAL_ACCOUNT_NOT_FOUND");

    await seeded.request("/api/users/me/internal-account", { method: "POST", token: owner.token });
    const other = await seeded.request("/api/users/me/internal-account", { token: stranger.token });
    assert.equal(other.status, 404);
  });

  test("the profile and the dashboard report the internal account", async () => {
    const { token } = await newUser(seeded);
    const created = (await seeded.request("/api/users/me/internal-account", { method: "POST", token })).body as { id: string };

    const profile = (await seeded.request("/api/users/me", { token })).body as { walletAddress: unknown; internalAccount: { id: string; balance: { value: string } } | null };
    assert.equal(profile.walletAddress, null);
    assert.equal(profile.internalAccount?.id, created.id);
    assert.equal(profile.internalAccount?.balance.value, SEED.toString());

    const dashboard = (await seeded.request("/api/users/me/dashboard", { token })).body as {
      wallet: unknown;
      internalAccount: { id: string; movements: unknown[] } | null;
    };
    assert.equal(dashboard.wallet, null);
    assert.equal(dashboard.internalAccount?.id, created.id);
    assert.equal(dashboard.internalAccount?.movements.length, 1);
  });

  test("an internal account counts as onboarded for KYC, and the KYC audit lands on the account", async () => {
    const { id, token } = await newUser(seeded);
    const before = await seeded.request("/api/users/me/kyc/session", { method: "POST", token, body: { locale: "es", returnPath: "/es/circles/new" } });
    assert.equal(before.status, 409);
    assert.equal(errorCode(before.body), "ONBOARDING_REQUIRED");

    const account = (await seeded.request("/api/users/me/internal-account", { method: "POST", token })).body as { id: string };
    const sessions = diditSessions;
    const started = await seeded.request("/api/users/me/kyc/session", { method: "POST", token, body: { locale: "es", returnPath: "/es/circles/new" } });
    assert.equal(started.status, 200);
    assert.equal(diditSessions, sessions + 1);

    const [row] = await db.select({ status: kycVerifications.status }).from(kycVerifications).where(eq(kycVerifications.userId, id));
    assert.equal(row?.status, "Not Started");
    const kycAudit = await db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.accountId, account.id));
    assert.ok(kycAudit.some((a) => a.type === "kyc.not_started"));
  });
});
