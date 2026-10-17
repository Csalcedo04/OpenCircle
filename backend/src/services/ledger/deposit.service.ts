import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { accountDeposits, auditEvents, ledgerAccounts } from "../../db/schema";
import { AppError } from "../../errors/app-error";
import type { MemberAccessService } from "../circles/member-access";
import { NoGrantError } from "../circles/member-access";
import { toAmountDto, type AmountDto } from "../money";
import { PaymentRefusedError, type ContributionPayments } from "../open-payments/payments";
import { userAccountInTx } from "./internal-account.service";
import { systemAccountInTx, transferInTx } from "./ledger.service";

/**
 * Deposits into an OpenCircle account from any wallet on the test network. OpenCircle cannot
 * create wallet addresses, so each deposit is a real Open Payments incoming payment on
 * OpenCircle's own wallet, one URL per deposit. The deposit completes only once OpenCircle reads
 * that payment as received (the same proof the period engine uses); the ledger then credits the
 * account from the OP_WALLET counterpart, keyed `deposit:<id>`, so it can never credit twice.
 */

export type DepositStatus = (typeof accountDeposits.$inferSelect)["status"];

export interface DepositDto {
  id: string;
  status: DepositStatus;
  /** Why it FAILED (EXPIRED); null otherwise. */
  failureCode: string | null;
  amount: AmountDto;
  /** Pay this from any test-network wallet. */
  incomingPaymentUrl: string;
  /** OpenCircle's wallet, where the payment lands. */
  receiverWalletAddress: string;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface DepositDeps {
  db: Db;
  payments: Pick<ContributionPayments, "createIncomingPayment" | "readIncomingPayment" | "payFromMember">;
  /** Pays a deposit with the user's own linked wallet, through their standing grant. */
  memberAccess: Pick<MemberAccessService, "withAccess">;
  receiverWalletAddress: string;
  realNow?: () => Date;
}

// How long the incoming payment stays open.
const DEPOSIT_TTL_MS = 30 * 60_000;

type DepositRow = typeof accountDeposits.$inferSelect;

const notFound = () => new AppError(404, "DEPOSIT_NOT_FOUND", "Deposit not found");
const depositKey = (id: string) => `deposit:${id}`;

export function createDepositService({ db, payments, memberAccess, receiverWalletAddress, realNow = () => new Date() }: DepositDeps) {
  const toDto = (row: DepositRow): DepositDto => ({
    id: row.id,
    status: row.status,
    failureCode: row.failureCode,
    amount: toAmountDto({ value: row.value, assetCode: row.assetCode, assetScale: row.assetScale }),
    incomingPaymentUrl: row.incomingPaymentUrl,
    receiverWalletAddress,
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });

  async function audit(accountId: string, eventType: string, depositId: string, amount?: bigint): Promise<void> {
    await db
      .insert(auditEvents)
      .values({ accountId, eventType, externalId: `${eventType}:${depositId}`, amount: amount ?? null })
      .onConflictDoNothing({ target: auditEvents.externalId });
  }

  /** The user's deposit, or 404: nobody can tell another user's deposits exist. */
  async function owned(userId: string, depositId: string): Promise<DepositRow> {
    const [row] = await db
      .select({ deposit: accountDeposits })
      .from(accountDeposits)
      .innerJoin(ledgerAccounts, eq(accountDeposits.accountId, ledgerAccounts.id))
      .where(and(eq(accountDeposits.id, depositId), eq(ledgerAccounts.ownerUserId, userId)))
      .limit(1);
    if (!row) throw notFound();
    return row.deposit;
  }

  // Credits the account exactly once: the compare-and-set and the transfer share one transaction.
  async function settle(row: DepositRow, now: Date): Promise<void> {
    const credited = await db.transaction(async (tx) => {
      const [done] = await tx
        .update(accountDeposits)
        .set({ status: "COMPLETED", completedAt: now })
        .where(and(eq(accountDeposits.id, row.id), eq(accountDeposits.status, "PENDING")))
        .returning({ id: accountDeposits.id });
      if (!done) return false;
      const asset = { assetCode: row.assetCode, assetScale: row.assetScale };
      const opWallet = await systemAccountInTx(tx, "OP_WALLET", asset);
      await transferInTx(tx, { key: depositKey(row.id), kind: "DEPOSIT", fromAccountId: opWallet.id, toAccountId: row.accountId, amount: { value: row.value, ...asset } });
      return true;
    });
    if (credited) await audit(row.accountId, "deposit.completed", row.id, row.value);
  }

  async function expire(row: DepositRow): Promise<void> {
    const [failed] = await db
      .update(accountDeposits)
      .set({ status: "FAILED", failureCode: "EXPIRED" })
      .where(and(eq(accountDeposits.id, row.id), eq(accountDeposits.status, "PENDING")))
      .returning({ id: accountDeposits.id });
    if (failed) await audit(row.accountId, "deposit.expired", row.id);
  }

  /** Reads the incoming payment while the deposit is PENDING and moves it on if it changed. */
  async function refresh(row: DepositRow): Promise<DepositRow> {
    if (row.status !== "PENDING") return row;
    const now = realNow();
    try {
      const { received } = await payments.readIncomingPayment(row.incomingPaymentUrl);
      if (received >= row.value) await settle(row, now);
      else if (row.expiresAt <= now) await expire(row);
    } catch {
      // Keep the stored status; the next read catches up.
      console.error("Deposit read failed", row.id);
    }
    const [fresh] = await db.select().from(accountDeposits).where(eq(accountDeposits.id, row.id)).limit(1);
    return fresh ?? row;
  }

  return {
    /** Opens a deposit: an incoming payment on OpenCircle's wallet for exactly `value`. */
    async create(userId: string, value: bigint): Promise<DepositDto> {
      const account = await userAccountInTx(db, userId);
      if (!account) throw new AppError(404, "INTERNAL_ACCOUNT_NOT_FOUND", "No OpenCircle account for this user");
      // The id is made first so the payment's metadata carries it (`deposit:<id>`).
      const id = randomUUID();
      const expiresAt = new Date(realNow().getTime() + DEPOSIT_TTL_MS);
      const { url } = await payments.createIncomingPayment({
        amount: { value: value.toString(), assetCode: account.assetCode, assetScale: account.assetScale },
        key: depositKey(id),
        expiresAt,
      });
      const [row] = await db
        .insert(accountDeposits)
        .values({ id, accountId: account.id, value, assetCode: account.assetCode, assetScale: account.assetScale, incomingPaymentUrl: url, expiresAt })
        .returning();
      if (!row) throw new Error("Deposit insert returned no row");
      await audit(account.id, "deposit.created", id, value);
      return toDto(row);
    },

    /** The deposit as it stands; a PENDING one is checked against the incoming payment first. */
    async get(userId: string, depositId: string): Promise<DepositDto> {
      return toDto(await refresh(await owned(userId, depositId)));
    },

    /**
     * Pays the deposit from the user's own linked wallet with their standing grant: a quote and
     * an outgoing payment to the incoming payment, keyed like the deposit so a retry never pays twice.
     */
    async payWithLinkedWallet(userId: string, depositId: string): Promise<DepositDto> {
      const row = await refresh(await owned(userId, depositId));
      if (row.status !== "PENDING") throw new AppError(409, "DEPOSIT_NOT_PENDING", "This deposit is already settled or expired");
      try {
        await memberAccess.withAccess(userId, (access) => payments.payFromMember(access, { incomingPaymentUrl: row.incomingPaymentUrl, key: depositKey(row.id) }));
      } catch (err) {
        if (err instanceof NoGrantError) throw new AppError(409, "WALLET_NOT_AUTHORIZED", "Link and authorize your wallet to pay from it");
        if (err instanceof PaymentRefusedError) throw new AppError(502, "PAYMENT_REFUSED", "Your wallet refused the payment");
        throw err;
      }
      await audit(row.accountId, "deposit.paid_from_wallet", row.id);
      return toDto(await refresh(row));
    },
  };
}

export type DepositService = ReturnType<typeof createDepositService>;
