import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { uniqueViolation } from "../db/errors";
import { auditEvents, creditProfiles, users, walletBalances, wallets } from "../db/schema";
import { AppError } from "../errors/app-error";

export interface WalletDto {
  id: string;
  addressUrl: string;
  assetCode: string;
  assetScale: number;
}

// Monetary amount: integer in the asset's minor unit, serialized as a string.
export interface AmountDto {
  value: string;
  assetCode: string;
  assetScale: number;
}

// User-facing savings summary. The borrowing capacity is internal and never exposed here.
export interface SavingsDto {
  walletAddress: string;
  balance: AmountDto;
  // How reliably the user pays in savings rounds, 0..1; null until it is first computed.
  paymentScore: string | null;
}

const profileNotFound = () => new AppError(404, "PROFILE_NOT_FOUND", "User profile not found");

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Canonical wallet data, as resolved from the wallet address server. */
export interface ResolvedWallet {
  id: string;
  assetCode: string;
  assetScale: number;
}

/**
 * Links a resolved Open Payments wallet to the user inside the caller's transaction.
 * Linking the same wallet again is a no-op; a user keeps one wallet. Callers map the
 * `users_op_wallet_unique` violation (wallet owned by another user) with `walletInUse`.
 */
export async function linkWalletInTx(tx: Tx, userId: string, remote: ResolvedWallet): Promise<{ wallet: WalletDto; created: boolean }> {
  // Lock the user row so concurrent link requests for the same user serialize.
  const [user] = await tx.select({ opWallet: users.opWallet }).from(users).where(eq(users.id, userId)).for("update");
  if (!user) throw profileNotFound();

  // The SDK's canonical id dedupes "$host/path" and "https://host/path".
  await tx
    .insert(wallets)
    .values({ addressUrl: remote.id, assetCode: remote.assetCode, assetScale: remote.assetScale })
    .onConflictDoNothing({ target: wallets.addressUrl });
  const [wallet] = await tx
    .select({ id: wallets.id, addressUrl: wallets.addressUrl, assetCode: wallets.assetCode, assetScale: wallets.assetScale })
    .from(wallets)
    .where(eq(wallets.addressUrl, remote.id));
  if (!wallet) throw new Error("Wallet row missing after upsert");

  if (user.opWallet === wallet.id) return { wallet, created: false };
  if (user.opWallet !== null) {
    throw new AppError(409, "WALLET_ALREADY_LINKED", "User already has a different wallet linked");
  }

  await tx.update(users).set({ opWallet: wallet.id }).where(eq(users.id, userId));
  await tx.insert(walletBalances).values({ walletId: wallet.id }).onConflictDoNothing();
  await tx.insert(auditEvents).values({ walletId: wallet.id, eventType: "wallet.linked" });
  return { wallet, created: true };
}

/** Maps a unique violation on users.op_wallet to a 409; returns null for any other error. */
export function walletInUse(err: unknown): AppError | null {
  return uniqueViolation(err) === "users_op_wallet_unique"
    ? new AppError(409, "WALLET_IN_USE", "Wallet is linked to another user")
    : null;
}

export function createWalletService(db: Db) {
  return {
    async getSavings(userId: string): Promise<SavingsDto> {
      const [row] = await db
        .select({
          walletAddress: wallets.addressUrl,
          assetCode: wallets.assetCode,
          assetScale: wallets.assetScale,
          balance: walletBalances.balance,
          paymentScore: creditProfiles.internalCreditScore,
        })
        .from(users)
        .leftJoin(wallets, eq(users.opWallet, wallets.id))
        .leftJoin(walletBalances, eq(walletBalances.walletId, wallets.id))
        .leftJoin(creditProfiles, eq(creditProfiles.walletId, wallets.id))
        .where(eq(users.id, userId))
        .limit(1);

      if (!row) throw profileNotFound();
      if (row.walletAddress === null || row.assetCode === null || row.assetScale === null) {
        throw new AppError(404, "WALLET_NOT_LINKED", "No wallet linked to this user");
      }
      return {
        walletAddress: row.walletAddress,
        balance: {
          value: (row.balance ?? 0n).toString(),
          assetCode: row.assetCode,
          assetScale: row.assetScale,
        },
        paymentScore: row.paymentScore,
      };
    },
  };
}

export type WalletService = ReturnType<typeof createWalletService>;
