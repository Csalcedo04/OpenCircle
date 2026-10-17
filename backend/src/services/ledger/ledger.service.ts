import { alias } from "drizzle-orm/pg-core";
import { desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../../db/client";
import {
  auditEvents,
  ledgerAccounts,
  ledgerTransfers,
  type LEDGER_TRANSFER_KINDS,
  type SYSTEM_ACCOUNT_CODES,
} from "../../db/schema";
import { sameAsset, toAmountDto, type AmountDto, type Asset, type Money } from "../money";
import type { Tx } from "../wallet.service";

/**
 * The internal ledger. Every movement is one `ledger_transfers` row (debit `from`, credit `to`)
 * posted inside the caller's transaction under row locks, idempotent by key, and audited.
 * Balances are cached on the accounts and updated in the same transaction.
 */

export type LedgerAccountRow = typeof ledgerAccounts.$inferSelect;
export type SystemAccountCode = (typeof SYSTEM_ACCOUNT_CODES)[number];
export type TransferKind = (typeof LEDGER_TRANSFER_KINDS)[number];

/** The debited account has less than the transfer value (SYSTEM accounts may go negative). */
export class InsufficientFundsError extends Error {
  constructor(readonly accountId: string) {
    super("Insufficient funds");
    this.name = "InsufficientFundsError";
  }
}

/** The two accounts and the amount are not all in the same asset. */
export class AssetMismatchError extends Error {
  constructor() {
    super("Transfer and accounts must share one asset");
    this.name = "AssetMismatchError";
  }
}

/** The idempotency key was used before for a different transfer. */
export class IdempotencyConflictError extends Error {
  constructor(readonly key: string) {
    super("Idempotency key reused with different legs or value");
    this.name = "IdempotencyConflictError";
  }
}

export interface TransferInput {
  /** Deterministic per business event, e.g. `contribution:<round>:<member>`, `seed:<account>`, `deposit:<id>`. */
  key: string;
  kind: TransferKind;
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
}

export interface TransferResult {
  id: string;
  /** False when the key had been posted before: nothing moved this time. */
  created: boolean;
}

/** Get-or-create the SYSTEM counterpart account for a code and asset, in the caller's transaction. */
export async function systemAccountInTx(tx: Tx, code: SystemAccountCode, asset: Asset): Promise<LedgerAccountRow> {
  await tx
    .insert(ledgerAccounts)
    .values({ kind: "SYSTEM", systemCode: code, assetCode: asset.assetCode, assetScale: asset.assetScale })
    .onConflictDoNothing({ target: [ledgerAccounts.systemCode, ledgerAccounts.assetCode, ledgerAccounts.assetScale] });
  const [row] = await tx
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.systemCode, code))
    .then((rows) => rows.filter((r) => sameAsset(r, asset)));
  if (!row) throw new Error(`System account ${code} missing after upsert`);
  return row;
}

/**
 * Posts one balanced transfer. Locks both accounts (ordered by id, so two transfers between the
 * same accounts never deadlock), checks the asset and the balance, inserts the row and updates
 * both cached balances. Idempotent: a repeat with the same key returns the stored transfer.
 */
export async function transferInTx(tx: Tx, input: TransferInput): Promise<TransferResult> {
  const { key, kind, fromAccountId, toAccountId, amount } = input;
  if (fromAccountId === toAccountId) throw new Error("A transfer needs two distinct accounts");
  if (amount.value <= 0n) throw new RangeError("Transfer value must be positive");

  const ids = [fromAccountId, toAccountId].sort();
  const locked = await tx.select().from(ledgerAccounts).where(inArray(ledgerAccounts.id, ids)).orderBy(ledgerAccounts.id).for("update");
  const from = locked.find((a) => a.id === fromAccountId);
  const to = locked.find((a) => a.id === toAccountId);
  if (!from || !to) throw new Error("Ledger account not found");
  if (!sameAsset(from, amount) || !sameAsset(to, amount)) throw new AssetMismatchError();
  if (from.kind !== "SYSTEM" && from.balance < amount.value) throw new InsufficientFundsError(from.id);

  const [inserted] = await tx
    .insert(ledgerTransfers)
    .values({ idempotencyKey: key, kind, fromAccountId, toAccountId, value: amount.value, assetCode: amount.assetCode, assetScale: amount.assetScale })
    .onConflictDoNothing({ target: ledgerTransfers.idempotencyKey })
    .returning({ id: ledgerTransfers.id });

  if (!inserted) {
    const [existing] = await tx.select().from(ledgerTransfers).where(eq(ledgerTransfers.idempotencyKey, key)).limit(1);
    if (!existing) throw new Error("Transfer missing after conflict");
    const same = existing.fromAccountId === fromAccountId && existing.toAccountId === toAccountId && existing.value === amount.value;
    if (!same) throw new IdempotencyConflictError(key);
    return { id: existing.id, created: false };
  }

  await tx
    .update(ledgerAccounts)
    .set({ balance: from.balance - amount.value })
    .where(eq(ledgerAccounts.id, from.id));
  await tx
    .update(ledgerAccounts)
    .set({ balance: to.balance + amount.value })
    .where(eq(ledgerAccounts.id, to.id));

  await tx
    .insert(auditEvents)
    .values([
      { accountId: from.id, eventType: "ledger.debit", externalId: `ledger.debit:${key}`, amount: -amount.value },
      { accountId: to.id, eventType: "ledger.credit", externalId: `ledger.credit:${key}`, amount: amount.value },
    ])
    .onConflictDoNothing({ target: auditEvents.externalId });

  return { id: inserted.id, created: true };
}

export type Counterparty =
  | { kind: "SYSTEM"; code: SystemAccountCode }
  | { kind: "CIRCLE_POOL"; circleId: string }
  | { kind: "USER" };

/** One transfer as seen from one account's statement. */
export interface MovementDto {
  id: string;
  kind: TransferKind;
  direction: "IN" | "OUT";
  amount: AmountDto;
  counterparty: Counterparty;
  createdAt: string;
}

function counterpartyOf(row: { kind: LedgerAccountRow["kind"]; systemCode: SystemAccountCode | null; circleId: string | null }): Counterparty {
  if (row.kind === "SYSTEM" && row.systemCode) return { kind: "SYSTEM", code: row.systemCode };
  if (row.kind === "CIRCLE_POOL" && row.circleId) return { kind: "CIRCLE_POOL", circleId: row.circleId };
  return { kind: "USER" };
}

/** Transfers touching an account, newest first. */
export async function movementsOf(db: Db | Tx, accountId: string, limit: number): Promise<MovementDto[]> {
  const fromAcc = alias(ledgerAccounts, "from_acc");
  const toAcc = alias(ledgerAccounts, "to_acc");
  const rows = await db
    .select({
      transfer: ledgerTransfers,
      from: { kind: fromAcc.kind, systemCode: fromAcc.systemCode, circleId: fromAcc.circleId },
      to: { kind: toAcc.kind, systemCode: toAcc.systemCode, circleId: toAcc.circleId },
    })
    .from(ledgerTransfers)
    .innerJoin(fromAcc, eq(ledgerTransfers.fromAccountId, fromAcc.id))
    .innerJoin(toAcc, eq(ledgerTransfers.toAccountId, toAcc.id))
    .where(or(eq(ledgerTransfers.fromAccountId, accountId), eq(ledgerTransfers.toAccountId, accountId)))
    .orderBy(desc(ledgerTransfers.createdAt), desc(ledgerTransfers.id))
    .limit(limit);

  return rows.map(({ transfer, from, to }) => {
    const incoming = transfer.toAccountId === accountId;
    return {
      id: transfer.id,
      kind: transfer.kind,
      direction: incoming ? "IN" : "OUT",
      amount: toAmountDto({ value: transfer.value, assetCode: transfer.assetCode, assetScale: transfer.assetScale }),
      counterparty: counterpartyOf(incoming ? from : to),
      createdAt: transfer.createdAt.toISOString(),
    };
  });
}
