import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, test } from "node:test";
import { and, eq, inArray, like, or } from "drizzle-orm";
import {
  OpenPaymentsClientError,
  type Grant,
  type GrantRequest,
  type PendingGrant,
  type WalletAddress,
} from "@interledger/open-payments";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, consentChallenges, kycVerifications, users, walletBalances, walletGrants, wallets } from "../src/db/schema";
import type { DiditClient, KycStatus } from "../src/services/didit/client";
import { createKycService } from "../src/services/kyc.service";
import type { OpenPaymentsGrantClient } from "../src/services/open-payments/client";
import { createTokenCipher } from "../src/services/open-payments/token-cipher";
import { createUserService } from "../src/services/user.service";
import { createWalletConsentService } from "../src/services/wallet-consent.service";
import { linkWalletInTx } from "../src/services/wallet.service";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeServices } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

// Runs against the database in DATABASE_URL (Supabase), faking only the outside services:
// the wallet's authorization server (Open Payments) and Didit. Rows use the "[test-consent] "
// name prefix and wallets under WALLET_PREFIX, and are deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "[test-consent] ";
// Test-network host (the consent flow only accepts these); the client is faked, nothing is called.
const WALLET_PREFIX = "https://ilp.interledger-test.dev/oc-test-";
const AUTH_SERVER = "https://auth.interledger-test.dev/oc-test-auth";
const FRONTEND_URL = "http://localhost:3001";
const WEBHOOK_SECRET = "consent-kyc-test-secret";
const cipher = createTokenCipher(randomBytes(32).toString("base64"));

let db: Db;
let server: TestServer;
let auth: TestAuth;
const createdUserIds: string[] = [];

// ── Fake wallet authorization server ────────────────────────────────────────
// Records what OpenCircle asked for and answers like a test-network wallet would.
interface FakeAuthServer {
  client: OpenPaymentsGrantClient;
  /** Each grant request, with the finish nonce the fake wallet answered (needed to build the hash). */
  requests: { url: string; body: Omit<GrantRequest, "client">; finishNonce: string }[];
  continues: { url: string; accessToken: string; interactRef: string | undefined }[];
  revoked: { url: string; accessToken: string }[];
  /** What grant.continue does next: issue a token, fail, or finish without a token. */
  nextContinue: "token" | "fail" | "no-token";
  /** What grant.request does next: ask for user consent, or grant straight away. */
  nextRequest: "interactive" | "immediate";
}

function fakeAuthServer(): FakeAuthServer {
  const fail = async (): Promise<never> => {
    throw new Error("not used in this test");
  };
  let n = 0;
  const server: FakeAuthServer = {
    requests: [],
    continues: [],
    revoked: [],
    nextContinue: "token",
    nextRequest: "interactive",
    client: {
      walletAddress: {
        get: async ({ url }): Promise<WalletAddress> => ({
          id: url,
          publicName: "Test wallet",
          assetCode: "COP",
          assetScale: 2,
          // A wallet whose auth server is off the test network is refused.
          authServer: url.includes("evil-auth") ? "https://auth.example.com" : AUTH_SERVER,
          resourceServer: "https://ilp.interledger-test.dev",
        }),
        getKeys: fail,
        getDIDDocument: fail,
      },
      grant: {
        request: async ({ url }, body): Promise<PendingGrant | Grant> => {
          n += 1;
          server.requests.push({ url, body, finishNonce: `finish-nonce-${n}` });
          const cont = { access_token: { value: `continue-token-${n}` }, uri: `${AUTH_SERVER}/continue/${n}` };
          if (server.nextRequest === "immediate") {
            return { continue: cont, access_token: { value: "x", manage: `${AUTH_SERVER}/token/x`, access: [] } };
          }
          return { interact: { redirect: `${AUTH_SERVER}/interact/${n}`, finish: `finish-nonce-${n}` }, continue: cont };
        },
        continue: async ({ url, accessToken }, args): Promise<Grant> => {
          server.continues.push({ url, accessToken, interactRef: args?.interact_ref });
          if (server.nextContinue === "fail") {
            throw new OpenPaymentsClientError("Could not continue grant", { description: "denied", status: 401 });
          }
          n += 1;
          const cont = { access_token: { value: `continue-token-${n}` }, uri: `${AUTH_SERVER}/continue/${n}` };
          if (server.nextContinue === "no-token") return { continue: cont };
          return {
            continue: cont,
            access_token: { value: `access-token-${n}`, manage: `${AUTH_SERVER}/token/${n}`, expires_in: 600, access: [] },
          };
        },
        cancel: fail,
      },
      token: {
        rotate: fail,
        revoke: async ({ url, accessToken }) => {
          server.revoked.push({ url, accessToken });
        },
      },
    },
  };
  return server;
}

// ── Fake Didit ──────────────────────────────────────────────────────────────
interface FakeDidit {
  client: DiditClient;
  created: Parameters<DiditClient["createSession"]>[0][];
  decisions: Map<string, { status: KycStatus; vendorData: string | null }>;
  /** When set, createSession returns this unfinished session again (Didit dedupes by vendor_data). */
  resume: string | null;
  down: boolean;
}

function fakeDidit(): FakeDidit {
  const didit: FakeDidit = {
    created: [],
    decisions: new Map(),
    resume: null,
    down: false,
    client: {
      createSession: async (args) => {
        didit.created.push(args);
        const sessionId = didit.resume ?? randomUUID();
        if (!didit.decisions.has(sessionId)) didit.decisions.set(sessionId, { status: "Not Started", vendorData: args.vendorData });
        return { sessionId, url: `https://verify.didit.me/session/${sessionId}`, status: "Not Started" };
      },
      getDecision: async (sessionId) => {
        if (didit.down) throw new Error("Didit unavailable");
        const decision = didit.decisions.get(sessionId);
        if (!decision) throw new Error("unknown session");
        return decision;
      },
    },
  };
  return didit;
}

let op: FakeAuthServer;
let didit: FakeDidit;

// ── Test data ───────────────────────────────────────────────────────────────
async function deleteTestData(): Promise<void> {
  const testUsers = (await db.select({ id: users.id }).from(users).where(like(users.fullName, `${PREFIX}%`))).map((u) => u.id);
  const userIds = [...new Set([...testUsers, ...createdUserIds])];
  const testWallets = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `${WALLET_PREFIX}%`))).map(
    (w) => w.id,
  );

  // FK order: grants/challenges/KYC → audit events → users → wallets (balances cascade).
  if (userIds.length > 0) {
    await db.delete(walletGrants).where(inArray(walletGrants.userId, userIds));
    await db.delete(consentChallenges).where(inArray(consentChallenges.userId, userIds));
    await db.delete(kycVerifications).where(inArray(kycVerifications.userId, userIds));
  }
  if (testWallets.length > 0) await db.delete(auditEvents).where(inArray(auditEvents.walletId, testWallets));
  if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
  if (testWallets.length > 0) await db.delete(wallets).where(inArray(wallets.id, testWallets));
}

async function member(): Promise<{ id: string; token: string; documentNumber: string }> {
  const id = randomUUID();
  createdUserIds.push(id);
  const documentNumber = String(randomInt(1_000_000_000, 9_999_999_999));
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    documentType: "cc",
    documentNumber,
    nationality: "CO",
    fullName: `${PREFIX}Ana Gómez`,
    dob: "1995-04-12",
  });
  return { id, token: await auth.token(id), documentNumber };
}

const walletUrl = () => `${WALLET_PREFIX}${randomUUID()}`;

/** The redirect values the wallet would send back after the user approves. */
function approval(index = op.requests.length - 1, overrides: { hash?: string; interactRef?: string } = {}) {
  const request = op.requests[index];
  const finish = request?.body.interact?.finish;
  assert.ok(request && finish, "no grant request recorded");
  const state = finish.uri.split("/").pop() ?? "";
  const interactRef = overrides.interactRef ?? `interact-ref-${randomUUID()}`;
  // Built from the spec (openpayments.dev hash verification), not from the code under test.
  const hash =
    overrides.hash ??
    createHash("sha256").update(`${finish.nonce}\n${request.finishNonce}\n${interactRef}\n${request.url}`).digest("base64");
  return { state, interactRef, hash };
}

const startConsent = (token: string, walletAddress: string) =>
  server.request("/api/users/me/wallet/consent", { method: "POST", token, body: { walletAddress } });

const completeConsent = (token: string, body: { state: string; interactRef: string; hash: string }) =>
  server.request("/api/users/me/wallet/consent/complete", { method: "POST", token, body });

const challengeByState = async (state: string) =>
  (await db.select().from(consentChallenges).where(eq(consentChallenges.state, state)))[0];

// ── Suite ───────────────────────────────────────────────────────────────────
describe("wallet consent and KYC against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    auth = await setupTestAuth();
    db = createDb(databaseUrl ?? "");
    await deleteTestData();
    op = fakeAuthServer();
    didit = fakeDidit();

    const userService = createUserService(db);
    server = await startServer(
      fakeServices({
        users: userService,
        walletConsent: createWalletConsentService({ db, client: op.client, cipher, users: userService, frontendUrl: FRONTEND_URL }),
        kyc: createKycService({ db, didit: didit.client, frontendUrl: FRONTEND_URL }),
      }),
      { diditWebhookSecret: WEBHOOK_SECRET },
    );
  });

  beforeEach(() => {
    op.nextContinue = "token";
    op.nextRequest = "interactive";
    didit.resume = null;
    didit.down = false;
  });

  after(async () => {
    await deleteTestData();
    await server.close();
    await db.$client.end();
  });

  describe("wallet consent: start", () => {
    test("asks the wallet for outgoing payments + quotes with no limits and stores a pending challenge", async () => {
      const { id, token } = await member();
      const url = walletUrl();
      const res = await startConsent(token, `$${url.slice("https://".length)}`);
      assert.equal(res.status, 201);
      assert.match((res.body as { redirectUrl: string }).redirectUrl, /^https:\/\/auth\.interledger-test\.dev\/oc-test-auth\/interact\//);

      const request = op.requests.at(-1);
      assert.equal(request?.url, AUTH_SERVER);
      assert.deepEqual(request?.body.access_token?.access, [
        { type: "outgoing-payment", actions: ["create", "read", "list"], identifier: url },
        { type: "quote", actions: ["create", "read"] },
      ]);
      const finish = request?.body.interact?.finish;
      assert.equal(finish?.method, "redirect");
      assert.match(finish?.uri ?? "", new RegExp(`^${FRONTEND_URL}/consent/callback/[\\w-]{43}$`));

      const challenge = await challengeByState(finish?.uri.split("/").pop() ?? "");
      assert.equal(challenge?.userId, id);
      assert.equal(challenge?.status, "PENDING");
      assert.equal(challenge?.walletAddressUrl, url);
      assert.equal(challenge?.grantEndpoint, AUTH_SERVER);
      assert.equal(challenge?.clientNonce, finish?.nonce);
      // The continue token is encrypted at rest.
      assert.ok(!challenge?.continueTokenCiphertext.includes("continue-token"));
      assert.match(cipher.decrypt(challenge?.continueTokenCiphertext ?? ""), /^continue-token-\d+$/);
      const ttl = (challenge?.expiresAt.getTime() ?? 0) - Date.now();
      assert.ok(ttl > 9 * 60_000 && ttl <= 10 * 60_000, `expiry ${ttl}ms`);
    });

    test("a wallet whose auth server is off the test network → 422 WALLET_NOT_ALLOWED", async () => {
      const { token } = await member();
      const res = await startConsent(token, `${WALLET_PREFIX}evil-auth-${randomUUID()}`);
      assert.equal(res.status, 422);
      assert.equal(errorCode(res.body), "WALLET_NOT_ALLOWED");
    });

    test("a wallet that grants without asking the user → 502 CONSENT_NOT_INTERACTIVE, nothing stored", async () => {
      const { id, token } = await member();
      op.nextRequest = "immediate";
      const res = await startConsent(token, walletUrl());
      assert.equal(res.status, 502);
      assert.equal(errorCode(res.body), "CONSENT_NOT_INTERACTIVE");
      assert.equal((await db.select().from(consentChallenges).where(eq(consentChallenges.userId, id))).length, 0);
    });
  });

  describe("wallet consent: complete", () => {
    test("approved → wallet linked, encrypted grant stored, audit events written", async () => {
      const { id, token } = await member();
      const url = walletUrl();
      assert.equal((await startConsent(token, url)).status, 201);
      const back = approval();

      const res = await completeConsent(token, back);
      assert.equal(res.status, 200, res.text);
      assert.equal((res.body as { walletAddress: string }).walletAddress, url);

      // grant.continue got the interact_ref and the decrypted continue token.
      const cont = op.continues.at(-1);
      assert.equal(cont?.interactRef, back.interactRef);
      assert.match(cont?.accessToken ?? "", /^continue-token-\d+$/);

      assert.equal((await challengeByState(back.state))?.status, "COMPLETED");
      const [grant] = await db.select().from(walletGrants).where(eq(walletGrants.userId, id));
      assert.equal(grant?.status, "ACTIVE");
      assert.ok(!grant?.accessTokenCiphertext.includes("access-token"));
      assert.match(cipher.decrypt(grant?.accessTokenCiphertext ?? ""), /^access-token-\d+$/);
      assert.match(grant?.manageUri ?? "", /\/token\/\d+$/);
      const expiresIn = (grant?.tokenExpiresAt?.getTime() ?? 0) - Date.now();
      assert.ok(expiresIn > 590_000 && expiresIn <= 600_000);

      const [user] = await db.select().from(users).where(eq(users.id, id));
      assert.equal(user?.opWallet, grant?.walletId);
      const [balance] = await db.select().from(walletBalances).where(eq(walletBalances.walletId, grant?.walletId ?? ""));
      assert.equal(balance?.balance, 0n);
      const events = (await db.select().from(auditEvents).where(eq(auditEvents.walletId, grant?.walletId ?? ""))).map((e) => e.eventType);
      assert.deepEqual(events.sort(), ["wallet.grant_active", "wallet.linked"]);
    });

    test("the same approval twice → 404 CONSENT_NOT_FOUND (single use)", async () => {
      const { token } = await member();
      await startConsent(token, walletUrl());
      const back = approval();
      assert.equal((await completeConsent(token, back)).status, 200);
      const again = await completeConsent(token, back);
      assert.equal(again.status, 404);
      assert.equal(errorCode(again.body), "CONSENT_NOT_FOUND");
    });

    test("a wrong hash → 400 CONSENT_INVALID, challenge cancelled, wallet never asked, nothing linked", async () => {
      const { id, token } = await member();
      await startConsent(token, walletUrl());
      const back = approval(undefined, { hash: createHash("sha256").update("forged").digest("base64") });
      const continuesBefore = op.continues.length;

      const res = await completeConsent(token, back);
      assert.equal(res.status, 400);
      assert.equal(errorCode(res.body), "CONSENT_INVALID");
      assert.equal(op.continues.length, continuesBefore);
      assert.equal((await challengeByState(back.state))?.status, "CANCELLED");
      assert.equal((await db.select().from(walletGrants).where(eq(walletGrants.userId, id))).length, 0);
      assert.equal((await db.select().from(users).where(eq(users.id, id)))[0]?.opWallet, null);
    });

    test("another user can't complete my consent; I still can afterwards", async () => {
      const alice = await member();
      const mallory = await member();
      await startConsent(alice.token, walletUrl());
      const back = approval();

      const stolen = await completeConsent(mallory.token, back);
      assert.equal(stolen.status, 404);
      assert.equal(errorCode(stolen.body), "CONSENT_NOT_FOUND");
      assert.equal((await challengeByState(back.state))?.status, "PENDING");

      assert.equal((await completeConsent(alice.token, back)).status, 200);
    });

    test("an expired challenge → 404 CONSENT_NOT_FOUND", async () => {
      const { token } = await member();
      await startConsent(token, walletUrl());
      const back = approval();
      await db
        .update(consentChallenges)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(consentChallenges.state, back.state));
      const res = await completeConsent(token, back);
      assert.equal(res.status, 404);
      assert.equal(errorCode(res.body), "CONSENT_NOT_FOUND");
    });

    test("the wallet refuses to continue → 502, challenge cancelled, nothing linked", async () => {
      const { id, token } = await member();
      await startConsent(token, walletUrl());
      const back = approval();
      op.nextContinue = "fail";
      const res = await completeConsent(token, back);
      assert.equal(res.status, 502);
      assert.equal(errorCode(res.body), "OPEN_PAYMENTS_ERROR");
      assert.equal((await challengeByState(back.state))?.status, "CANCELLED");
      assert.equal((await db.select().from(walletGrants).where(eq(walletGrants.userId, id))).length, 0);
    });

    test("the wallet finishes without a token → 502 CONSENT_NOT_GRANTED, challenge cancelled", async () => {
      const { token } = await member();
      await startConsent(token, walletUrl());
      const back = approval();
      op.nextContinue = "no-token";
      const res = await completeConsent(token, back);
      assert.equal(res.status, 502);
      assert.equal(errorCode(res.body), "CONSENT_NOT_GRANTED");
      assert.equal((await challengeByState(back.state))?.status, "CANCELLED");
    });

    test("a wallet linked to another user → 409 WALLET_IN_USE and the new token is revoked", async () => {
      const alice = await member();
      const bob = await member();
      const url = walletUrl();
      await startConsent(alice.token, url);
      assert.equal((await completeConsent(alice.token, approval())).status, 200);

      await startConsent(bob.token, url);
      const res = await completeConsent(bob.token, approval());
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "WALLET_IN_USE");
      // Bob's freshly issued token must not stay live at the wallet.
      assert.match(op.revoked.at(-1)?.accessToken ?? "", /^access-token-\d+$/);
      assert.equal((await db.select().from(walletGrants).where(eq(walletGrants.userId, bob.id))).length, 0);
    });

    test("consenting again on the same wallet renews the grant and revokes the old token", async () => {
      const { id, token } = await member();
      const url = walletUrl();
      await startConsent(token, url);
      await completeConsent(token, approval());
      const [first] = await db.select().from(walletGrants).where(eq(walletGrants.userId, id));
      const firstToken = cipher.decrypt(first?.accessTokenCiphertext ?? "");

      await startConsent(token, url);
      assert.equal((await completeConsent(token, approval())).status, 200);

      const grants = await db.select().from(walletGrants).where(eq(walletGrants.userId, id));
      assert.deepEqual(grants.map((g) => g.status).sort(), ["ACTIVE", "REVOKED"]);
      assert.equal(grants.find((g) => g.status === "REVOKED")?.id, first?.id);
      assert.ok(op.revoked.some((r) => r.accessToken === firstToken && r.url === first?.manageUri));
      const events = await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.walletId, first?.walletId ?? ""), eq(auditEvents.eventType, "wallet.grant_revoked")));
      assert.equal(events.length, 1);
    });

    test("a different wallet when one is linked → 409 WALLET_ALREADY_LINKED, new token revoked", async () => {
      const { token } = await member();
      await startConsent(token, walletUrl());
      await completeConsent(token, approval());
      await startConsent(token, walletUrl());
      const res = await completeConsent(token, approval());
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "WALLET_ALREADY_LINKED");
      assert.match(op.revoked.at(-1)?.accessToken ?? "", /^access-token-\d+$/);
    });
  });

  describe("KYC", () => {
    // KYC starts only after onboarding: give the user a linked wallet.
    async function onboarded() {
      const user = await member();
      await db.transaction((tx) => linkWalletInTx(tx, user.id, { id: walletUrl(), assetCode: "COP", assetScale: 2 }));
      return user;
    }
    const startKyc = (token: string) =>
      server.request("/api/users/me/kyc/session", { method: "POST", token, body: { locale: "es", returnPath: "/es/circles/new" } });
    const kycRows = (userId: string) => db.select().from(kycVerifications).where(eq(kycVerifications.userId, userId));

    test("start → Didit session for our user id with the onboarding document; only the status is stored", async () => {
      const { id, token, documentNumber } = await onboarded();
      const res = await startKyc(token);
      assert.equal(res.status, 201);
      assert.match((res.body as { url: string }).url, /^https:\/\/verify\.didit\.me\/session\//);

      assert.deepEqual(didit.created.at(-1), {
        vendorData: id,
        callback: `${FRONTEND_URL}/es/kyc/callback?next=%2Fes%2Fcircles%2Fnew`,
        language: "es",
        expected: { identificationNumber: documentNumber, dateOfBirth: "1995-04-12", documentTypes: ["ID"] },
      });
      const rows = await kycRows(id);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "Not Started");
      assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), ["createdAt", "id", "sessionId", "status", "updatedAt", "userId"]);
    });

    test("Didit resuming the same unfinished session doesn't duplicate it", async () => {
      const { id, token } = await onboarded();
      await startKyc(token);
      didit.resume = (await kycRows(id))[0]?.sessionId ?? null;
      assert.equal((await startKyc(token)).status, 201);
      assert.equal((await kycRows(id)).length, 1);
    });

    test("GET /me/kyc syncs a pending session from Didit; then starting again → 409 KYC_ALREADY_APPROVED", async () => {
      const { id, token } = await onboarded();
      await startKyc(token);
      const [row] = await kycRows(id);
      didit.decisions.set(row?.sessionId ?? "", { status: "Approved", vendorData: id });

      const res = await server.request("/api/users/me/kyc", { token });
      assert.deepEqual(res.body, { status: "Approved", approved: true });
      assert.equal((await kycRows(id))[0]?.status, "Approved");
      const [user] = await db.select().from(users).where(eq(users.id, id));
      const events = await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.walletId, user?.opWallet ?? ""), eq(auditEvents.eventType, "kyc.approved")));
      assert.equal(events.length, 1);

      const again = await startKyc(token);
      assert.equal(again.status, 409);
      assert.equal(errorCode(again.body), "KYC_ALREADY_APPROVED");
    });

    test("a decision for someone else's vendor_data is ignored", async () => {
      const { id, token } = await onboarded();
      await startKyc(token);
      const [row] = await kycRows(id);
      didit.decisions.set(row?.sessionId ?? "", { status: "Approved", vendorData: randomUUID() });
      const res = await server.request("/api/users/me/kyc", { token });
      assert.deepEqual(res.body, { status: "Not Started", approved: false });
    });

    test("Didit unreachable → the stored status is returned, no error", async () => {
      const { token } = await onboarded();
      await startKyc(token);
      didit.down = true;
      const res = await server.request("/api/users/me/kyc", { token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { status: "Not Started", approved: false });
    });

    test("after a decline the user can start a new session", async () => {
      const { id, token } = await onboarded();
      await startKyc(token);
      const [row] = await kycRows(id);
      didit.decisions.set(row?.sessionId ?? "", { status: "Declined", vendorData: id });
      await server.request("/api/users/me/kyc", { token });
      assert.equal((await startKyc(token)).status, 201);
      assert.equal((await kycRows(id)).length, 2);
    });

    describe("webhook → database", () => {
      const sign = (body: string, ts = Math.floor(Date.now() / 1000)) => ({
        "content-type": "application/json",
        "x-timestamp": String(ts),
        "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
      });
      const send = (event: Record<string, unknown>) => {
        const body = JSON.stringify(event);
        return fetch(`${server.baseUrl}/api/webhooks/didit`, { method: "POST", headers: sign(body), body });
      };

      test("a signed status event updates the session and is audited", async () => {
        const { id, token } = await onboarded();
        await startKyc(token);
        const sessionId = (await kycRows(id))[0]?.sessionId;
        const res = await send({ webhook_type: "status.updated", session_id: sessionId, status: "Approved", vendor_data: id });
        assert.deepEqual(await res.json(), { ok: true, result: "applied" });
        assert.equal((await kycRows(id))[0]?.status, "Approved");
        assert.deepEqual((await server.request("/api/users/me/kyc", { token })).body, { status: "Approved", approved: true });
      });

      test("late or replayed events can't undo a final status; Approved can still expire", async () => {
        const { id, token } = await onboarded();
        await startKyc(token);
        const sessionId = (await kycRows(id))[0]?.sessionId;
        await send({ session_id: sessionId, status: "Approved", vendor_data: id });

        await send({ session_id: sessionId, status: "In Progress", vendor_data: id });
        assert.equal((await kycRows(id))[0]?.status, "Approved");
        await send({ session_id: sessionId, status: "Declined", vendor_data: id });
        assert.equal((await kycRows(id))[0]?.status, "Approved");

        await send({ session_id: sessionId, status: "Kyc Expired", vendor_data: id });
        assert.equal((await kycRows(id))[0]?.status, "Kyc Expired");
      });

      test("an event whose vendor_data isn't the session's owner is ignored", async () => {
        const { id, token } = await onboarded();
        await startKyc(token);
        const sessionId = (await kycRows(id))[0]?.sessionId;
        const res = await send({ session_id: sessionId, status: "Approved", vendor_data: randomUUID() });
        assert.deepEqual(await res.json(), { ok: true, result: "ignored" });
        assert.equal((await kycRows(id))[0]?.status, "Not Started");
      });

      test("an unknown session is acknowledged and ignored", async () => {
        const res = await send({ session_id: randomUUID(), status: "Approved", vendor_data: randomUUID() });
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true, result: "ignored" });
      });
    });
  });

  test("no test rows leak outside this suite's prefix", async () => {
    const stray = await db
      .select({ id: users.id })
      .from(users)
      .where(or(like(users.fullName, `${PREFIX}%`), inArray(users.id, createdUserIds.length > 0 ? createdUserIds : [randomUUID()])));
    assert.ok(stray.every((u) => createdUserIds.includes(u.id)));
  });
});
