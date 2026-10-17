import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq, inArray, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { auditEvents, ledgerAccounts, ledgerTransfers, users } from "../src/db/schema";
import {
  AssetMismatchError,
  IdempotencyConflictError,
  InsufficientFundsError,
  movementsOf,
  systemAccountInTx,
  transferInTx,
} from "../src/services/ledger/ledger.service";
import type { Asset, Money } from "../src/services/money";

// Runs against the database in DATABASE_URL (Supabase). Accounts are created in a test-only asset
// so they never mix with real data. SYSTEM accounts in that asset are shared by every run and kept.
const databaseUrl = process.env.DATABASE_URL;

// Made-up assets: the ledger only requires that accounts and transfers agree on one.
const ASSET: Asset = { assetCode: "TLD", assetScale: 2 };
const OTHER_ASSET: Asset = { assetCode: "TLX", assetScale: 2 };
const money = (value: bigint, asset: Asset = ASSET): Money => ({ value, ...asset });

let db: Db;
const createdUserIds: string[] = [];
const createdAccountIds: string[] = [];

// A USER account needs an owner row; identity fields are random so parallel runs never collide.
async function newUserAccount(asset: Asset = ASSET): Promise<string> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@ledger.test`,
    documentType: "cc",
    documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
    nationality: "CO",
    fullName: "[test] ledger",
  });
  createdUserIds.push(userId);
  const [row] = await db
    .insert(ledgerAccounts)
    .values({ kind: "USER", ownerUserId: userId, assetCode: asset.assetCode, assetScale: asset.assetScale })
    .returning({ id: ledgerAccounts.id });
  if (!row) throw new Error("Account insert returned no row");
  createdAccountIds.push(row.id);
  return row.id;
}

async function balanceOf(id: string): Promise<bigint> {
  const [row] = await db.select({ balance: ledgerAccounts.balance }).from(ledgerAccounts).where(eq(ledgerAccounts.id, id));
  if (!row) throw new Error("Account missing");
  return row.balance;
}

async function fund(accountId: string, value: bigint): Promise<void> {
  await db.transaction(async (tx) => {
    const seed = await systemAccountInTx(tx, "DEMO_SEED", ASSET);
    await transferInTx(tx, { key: `test-seed:${randomUUID()}`, kind: "SEED", fromAccountId: seed.id, toAccountId: accountId, amount: money(value) });
  });
}

async function deleteTestData(): Promise<void> {
  if (createdAccountIds.length > 0) {
    const touching = or(inArray(ledgerTransfers.fromAccountId, createdAccountIds), inArray(ledgerTransfers.toAccountId, createdAccountIds));
    const keys = (await db.select({ key: ledgerTransfers.idempotencyKey }).from(ledgerTransfers).where(touching)).map((r) => r.key);
    // Both legs' audit rows are keyed by the transfer; the SYSTEM leg has no account of ours.
    if (keys.length > 0) {
      await db.delete(auditEvents).where(inArray(auditEvents.externalId, keys.flatMap((k) => [`ledger.debit:${k}`, `ledger.credit:${k}`])));
    }
    await db.delete(auditEvents).where(inArray(auditEvents.accountId, createdAccountIds));
    await db.delete(ledgerTransfers).where(touching);
    // SYSTEM accounts are shared; only this suite's USER accounts go.
    await db.delete(ledgerAccounts).where(inArray(ledgerAccounts.id, createdAccountIds));
  }
  if (createdUserIds.length > 0) await db.delete(users).where(inArray(users.id, createdUserIds));
}

describe("internal ledger against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(() => {
    db = createDb(databaseUrl ?? "");
  });

  after(async () => {
    await deleteTestData();
  });

  test("a transfer moves the exact amount and leaves two audit rows", async () => {
    const a = await newUserAccount();
    const b = await newUserAccount();
    await fund(a, 1_000n);

    const key = `t:${randomUUID()}`;
    const result = await db.transaction((tx) => transferInTx(tx, { key, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: b, amount: money(250n) }));
    assert.equal(result.created, true);
    assert.equal(await balanceOf(a), 750n);
    assert.equal(await balanceOf(b), 250n);

    const audits = await db
      .select({ accountId: auditEvents.accountId, amount: auditEvents.amount })
      .from(auditEvents)
      .where(inArray(auditEvents.externalId, [`ledger.debit:${key}`, `ledger.credit:${key}`]));
    assert.deepEqual(
      audits.sort((x, y) => Number(x.amount) - Number(y.amount)),
      [
        { accountId: a, amount: -250n },
        { accountId: b, amount: 250n },
      ],
    );
  });

  test("the same key twice moves nothing; the same key with another amount is a conflict", async () => {
    const a = await newUserAccount();
    const b = await newUserAccount();
    await fund(a, 500n);
    const key = `t:${randomUUID()}`;
    const first = await db.transaction((tx) => transferInTx(tx, { key, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: b, amount: money(100n) }));
    const again = await db.transaction((tx) => transferInTx(tx, { key, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: b, amount: money(100n) }));
    assert.equal(again.created, false);
    assert.equal(again.id, first.id);
    assert.equal(await balanceOf(a), 400n);
    assert.equal(await balanceOf(b), 100n);

    await assert.rejects(
      db.transaction((tx) => transferInTx(tx, { key, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: b, amount: money(1n) })),
      IdempotencyConflictError,
    );
  });

  test("a USER account can't go below zero, and the failed transaction leaves nothing behind", async () => {
    const a = await newUserAccount();
    const b = await newUserAccount();
    await fund(a, 10n);
    const key = `t:${randomUUID()}`;
    await assert.rejects(
      db.transaction((tx) => transferInTx(tx, { key, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: b, amount: money(11n) })),
      InsufficientFundsError,
    );
    assert.equal(await balanceOf(a), 10n);
    assert.equal(await balanceOf(b), 0n);
    assert.equal((await db.select().from(ledgerTransfers).where(eq(ledgerTransfers.idempotencyKey, key))).length, 0);
  });

  test("SYSTEM accounts go negative as the counterpart of money entering the ledger", async () => {
    const a = await newUserAccount();
    const seedBefore = await db.transaction((tx) => systemAccountInTx(tx, "DEMO_SEED", ASSET));
    await fund(a, 300n);
    assert.equal(await balanceOf(seedBefore.id), seedBefore.balance - 300n);
  });

  test("accounts and amount must share one asset", async () => {
    const a = await newUserAccount();
    const other = await newUserAccount(OTHER_ASSET);
    await fund(a, 100n);
    for (const amount of [money(1n), money(1n, OTHER_ASSET)]) {
      await assert.rejects(
        db.transaction((tx) => transferInTx(tx, { key: `t:${randomUUID()}`, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: other, amount })),
        AssetMismatchError,
      );
    }
  });

  test("concurrent transfers never overdraw: funds for 10, 20 attempts, exactly 10 succeed", async () => {
    const a = await newUserAccount();
    const b = await newUserAccount();
    await fund(a, 10n);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        db.transaction((tx) => transferInTx(tx, { key: `race:${a}:${i}`, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: b, amount: money(1n) })),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 10);
    assert.equal(results.filter((r) => r.status === "rejected" && r.reason instanceof InsufficientFundsError).length, 10);
    assert.equal(await balanceOf(a), 0n);
    assert.equal(await balanceOf(b), 10n);
  });

  test("balances equal the sum of transfers, and a statement reads both directions", async () => {
    const a = await newUserAccount();
    const b = await newUserAccount();
    await fund(a, 1_000n);
    await db.transaction((tx) => transferInTx(tx, { key: `t:${randomUUID()}`, kind: "CONTRIBUTION", fromAccountId: a, toAccountId: b, amount: money(400n) }));
    await db.transaction((tx) => transferInTx(tx, { key: `t:${randomUUID()}`, kind: "CONTRIBUTION", fromAccountId: b, toAccountId: a, amount: money(150n) }));

    for (const id of [a, b]) {
      const rows = await db.select().from(ledgerTransfers).where(or(eq(ledgerTransfers.fromAccountId, id), eq(ledgerTransfers.toAccountId, id)));
      const sum = rows.reduce((acc, r) => acc + (r.toAccountId === id ? r.value : -r.value), 0n);
      assert.equal(await balanceOf(id), sum);
    }

    const statement = await movementsOf(db, a, 10);
    assert.deepEqual(
      statement.map((m) => [m.kind, m.direction, m.amount.value]),
      [
        ["CONTRIBUTION", "IN", "150"],
        ["CONTRIBUTION", "OUT", "400"],
        ["SEED", "IN", "1000"],
      ],
    );
    assert.deepEqual(statement[0]?.counterparty, { kind: "USER" });
    assert.deepEqual(statement[2]?.counterparty, { kind: "SYSTEM", code: "DEMO_SEED" });
  });
});
