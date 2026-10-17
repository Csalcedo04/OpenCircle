import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq, inArray, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { accountDeposits, auditEvents, kycVerifications, ledgerAccounts, ledgerTransfers, users } from "../src/db/schema";
import { createAccountService } from "../src/services/account.service";
import { NoGrantError } from "../src/services/circles/member-access";
import type { DiditClient } from "../src/services/didit/client";
import { createKycService } from "../src/services/kyc.service";
import { createDepositService } from "../src/services/ledger/deposit.service";
import { createInternalAccountService } from "../src/services/ledger/internal-account.service";
import { createUserService } from "../src/services/user.service";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakePayments, fakeServices, TEST_WALLET_HOST, type FakePayments } from "./helpers/fakes";
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
// Each test may swap `payments`; the deposit service always calls the current one.
let payments: FakePayments = fakePayments({ settle: "later" });
let realClock = Date.parse("2026-10-17T12:00:00Z");
// Users in this set have a linked, authorized wallet; others get NoGrantError.
const authorizedWallets = new Set<string>();
const RECEIVER = `https://${TEST_WALLET_HOST}/opencircle`;

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
    await db.delete(accountDeposits).where(inArray(accountDeposits.accountId, accounts));
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
  const current = {
    createIncomingPayment: (a: Parameters<FakePayments["createIncomingPayment"]>[0]) => payments.createIncomingPayment(a),
    readIncomingPayment: (url: string) => payments.readIncomingPayment(url),
    payFromMember: (a: Parameters<FakePayments["payFromMember"]>[0], b: Parameters<FakePayments["payFromMember"]>[1]) => payments.payFromMember(a, b),
  };
  return {
    ...fakeServices(),
    users: userService,
    account: createAccountService({ db }),
    internalAccounts: createInternalAccountService({ db, resolveAsset: async () => ASSET, seedValue }),
    deposits: createDepositService({
      db,
      payments: current,
      memberAccess: {
        async withAccess(userId, call) {
          if (!authorizedWallets.has(userId)) throw new NoGrantError();
          return call({ walletAddressUrl: `https://${TEST_WALLET_HOST}/${userId}`, accessToken: "token" });
        },
      },
      receiverWalletAddress: RECEIVER,
      realNow: () => new Date(realClock),
    }),
    kyc: createKycService({ db, didit: fakeDidit, frontendUrl: FRONTEND_URL }),
  };
}

const DEPOSIT = "/api/users/me/internal-account/deposits";
type DepositBody = { id: string; status: string; failureCode: string | null; amount: { value: string }; incomingPaymentUrl: string; receiverWalletAddress: string };

async function balanceOf(token: string, server: TestServer): Promise<string> {
  return ((await server.request("/api/users/me/internal-account", { token })).body as { balance: { value: string } }).balance.value;
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

  test("a deposit is an incoming payment on OpenCircle's wallet; it credits the account once, when received", async () => {
    payments = fakePayments({ settle: "later" });
    const { token } = await newUser(unseeded);
    await unseeded.request("/api/users/me/internal-account", { method: "POST", token });

    const created = await unseeded.request(DEPOSIT, { method: "POST", token, body: { value: "25000" } });
    assert.equal(created.status, 201, created.text);
    const deposit = created.body as DepositBody;
    assert.equal(deposit.status, "PENDING");
    assert.equal(deposit.receiverWalletAddress, RECEIVER);
    const incoming = payments.incoming.get(deposit.incomingPaymentUrl);
    assert.deepEqual([incoming?.key, incoming?.value], [`deposit:${deposit.id}`, 25_000n]);

    // Not paid yet: still PENDING, nothing credited.
    const pending = await unseeded.request(`${DEPOSIT}/${deposit.id}`, { token });
    assert.equal((pending.body as DepositBody).status, "PENDING");
    assert.equal(await balanceOf(token, unseeded), "0");

    // The payer sends the money; OpenCircle reads it as received and credits exactly once.
    if (incoming) incoming.received = incoming.value;
    for (let i = 0; i < 2; i++) {
      const done = await unseeded.request(`${DEPOSIT}/${deposit.id}`, { token });
      assert.equal((done.body as DepositBody).status, "COMPLETED");
      assert.equal(await balanceOf(token, unseeded), "25000");
    }
    const movements = (await unseeded.request("/api/users/me/internal-account/movements", { token })).body as Array<{ kind: string; counterparty: unknown }>;
    assert.deepEqual(movements.map((m) => [m.kind, m.counterparty]), [["DEPOSIT", { kind: "SYSTEM", code: "OP_WALLET" }]]);
  });

  test("an unpaid deposit expires; a stranger or a bad id gets 404; the amount must be a positive integer", async () => {
    payments = fakePayments({ settle: "later" });
    const owner = await newUser(unseeded);
    const stranger = await newUser(unseeded);
    await unseeded.request("/api/users/me/internal-account", { method: "POST", token: owner.token });

    for (const body of [{ value: "0" }, { value: "12.5" }, { value: 100 }, {}]) {
      const bad = await unseeded.request(DEPOSIT, { method: "POST", token: owner.token, body });
      assert.equal(bad.status, 400, JSON.stringify(body));
    }

    const deposit = (await unseeded.request(DEPOSIT, { method: "POST", token: owner.token, body: { value: "1000" } })).body as DepositBody;
    assert.equal((await unseeded.request(`${DEPOSIT}/${deposit.id}`, { token: stranger.token })).status, 404);
    assert.equal((await unseeded.request(`${DEPOSIT}/not-a-uuid`, { token: owner.token })).status, 404);

    realClock += 31 * 60_000;
    const expired = (await unseeded.request(`${DEPOSIT}/${deposit.id}`, { token: owner.token })).body as DepositBody;
    assert.deepEqual([expired.status, expired.failureCode], ["FAILED", "EXPIRED"]);
    // Money arriving late is not credited: the deposit is closed.
    const incoming = payments.incoming.get(deposit.incomingPaymentUrl);
    if (incoming) incoming.received = incoming.value;
    assert.equal(((await unseeded.request(`${DEPOSIT}/${deposit.id}`, { token: owner.token })).body as DepositBody).status, "FAILED");
    assert.equal(await balanceOf(owner.token, unseeded), "0");
    assert.equal((await unseeded.request(`${DEPOSIT}/${deposit.id}/pay`, { method: "POST", token: owner.token })).status, 409);
  });

  test("a linked wallet pays the deposit through its grant; without one the API says so", async () => {
    payments = fakePayments({ settle: "now" });
    const { id, token } = await newUser(unseeded);
    await unseeded.request("/api/users/me/internal-account", { method: "POST", token });
    const deposit = (await unseeded.request(DEPOSIT, { method: "POST", token, body: { value: "7000" } })).body as DepositBody;

    const unauthorized = await unseeded.request(`${DEPOSIT}/${deposit.id}/pay`, { method: "POST", token });
    assert.equal(unauthorized.status, 409);
    assert.equal(errorCode(unauthorized.body), "WALLET_NOT_AUTHORIZED");

    authorizedWallets.add(id);
    const paid = await unseeded.request(`${DEPOSIT}/${deposit.id}/pay`, { method: "POST", token });
    assert.equal(paid.status, 200, paid.text);
    assert.equal((paid.body as DepositBody).status, "COMPLETED");
    assert.equal(payments.outgoing.length, 1);
    assert.equal(payments.outgoing[0]?.key, `deposit:${deposit.id}`);
    assert.equal(await balanceOf(token, unseeded), "7000");
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
