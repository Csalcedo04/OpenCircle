import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, test } from "node:test";
import { inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { users, walletGrants, wallets } from "../src/db/schema";
import { createMemberAccess } from "../src/services/circles/member-access";
import { createPoolAccess, hasPoolGrant, NoPoolGrantError } from "../src/services/circles/pool-access";
import type { MemberAccess } from "../src/services/open-payments/payments";
import { createTokenCipher } from "../src/services/open-payments/token-cipher";

// Runs against DATABASE_URL like the other integration suites. Rows use the "[test-pool] " name
// prefix and wallets under https://pool-access.test/, and are deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "[test-pool] ";
const HOST = "pool-access.test";
const cipher = createTokenCipher(randomBytes(32).toString("base64"));

let db: Db;
let poolUrl: string;

async function deleteTestData(): Promise<void> {
  const testWallets = (await db.select({ id: wallets.id }).from(wallets).where(like(wallets.addressUrl, `https://${HOST}/%`))).map((w) => w.id);
  if (testWallets.length > 0) await db.delete(walletGrants).where(inArray(walletGrants.walletId, testWallets));
  await db.delete(users).where(or(like(users.fullName, `${PREFIX}%`), testWallets.length > 0 ? inArray(users.opWallet, testWallets) : undefined));
  if (testWallets.length > 0) await db.delete(wallets).where(inArray(wallets.id, testWallets));
}

async function wallet(url: string): Promise<string> {
  const [row] = await db.insert(wallets).values({ addressUrl: url, assetCode: "COP", assetScale: 2 }).returning({ id: wallets.id });
  if (!row) throw new Error("wallet insert");
  return row.id;
}

// A user who linked `walletId`, with an ACTIVE grant on `grantWalletId` (the same one by default).
async function owner(walletId: string, grant: { walletId?: string; status?: "ACTIVE" | "REVOKED"; token?: string } | null = {}) {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    documentType: "cc",
    documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
    nationality: "CO",
    fullName: `${PREFIX}Operadora`,
    opWallet: walletId,
  });
  if (grant) {
    await db.insert(walletGrants).values({
      userId: id,
      walletId: grant.walletId ?? walletId,
      accessTokenCiphertext: cipher.encrypt(grant.token ?? "pool-token"),
      manageUri: "https://auth.pool-access.test/token/1",
      continueUri: "https://auth.pool-access.test/continue/1",
      status: grant.status ?? "ACTIVE",
    });
  }
  return id;
}

const rotateToken = async () => assert.fail("no rotation expected");

describe("pool access (payouts from the pool wallet)", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    db = createDb(databaseUrl ?? "");
    await deleteTestData();
  });

  beforeEach(() => {
    // A fresh pool per test, so tests don't see each other's owners.
    poolUrl = `https://${HOST}/pool-${randomUUID()}`;
  });

  after(async () => {
    await deleteTestData();
    await db.$client.end();
  });

  const poolAccess = () => createPoolAccess({ db, memberAccess: createMemberAccess({ db, cipher, payments: { rotateToken } }), poolWalletAddressUrl: poolUrl });

  test("uses the grant of whoever linked the pool wallet, decrypted", async () => {
    await owner(await wallet(poolUrl), { token: "secret-pool-token" });
    const seen: MemberAccess[] = [];
    const result = await poolAccess().withAccess(async (access) => (seen.push(access), "paid"));
    assert.equal(result, "paid");
    assert.deepEqual(seen, [{ walletAddressUrl: poolUrl, accessToken: "secret-pool-token" }]);
    assert.equal(await hasPoolGrant(db, poolUrl), true);
  });

  test("nobody linked the pool wallet → NoPoolGrantError, nothing called", async () => {
    await wallet(poolUrl);
    let called = false;
    await assert.rejects(poolAccess().withAccess(async () => (called = true)), NoPoolGrantError);
    assert.equal(called, false);
    assert.equal(await hasPoolGrant(db, poolUrl), false);
  });

  test("the owner has no active grant (none, or revoked) → NoPoolGrantError", async () => {
    await owner(await wallet(poolUrl), null);
    await assert.rejects(poolAccess().withAccess(async () => true), NoPoolGrantError);
    assert.equal(await hasPoolGrant(db, poolUrl), false);

    poolUrl = `https://${HOST}/pool-${randomUUID()}`;
    await owner(await wallet(poolUrl), { status: "REVOKED" });
    await assert.rejects(poolAccess().withAccess(async () => true), NoPoolGrantError);
    assert.equal(await hasPoolGrant(db, poolUrl), false);
  });

  test("the owner's active grant is on another wallet → refused, never spends from it", async () => {
    const other = await wallet(`https://${HOST}/other-${randomUUID()}`);
    await owner(await wallet(poolUrl), { walletId: other });
    let called = false;
    await assert.rejects(poolAccess().withAccess(async () => (called = true)), NoPoolGrantError);
    assert.equal(called, false);
    assert.equal(await hasPoolGrant(db, poolUrl), false);
  });

  test("errors from the payment itself pass through unchanged", async () => {
    await owner(await wallet(poolUrl));
    await assert.rejects(
      poolAccess().withAccess(async () => {
        throw new RangeError("wallet said no");
      }),
      RangeError,
    );
  });
});
