import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { users, walletGrants, wallets } from "../../db/schema";
import type { MemberAccess } from "../open-payments/payments";
import { NoGrantError, type MemberAccessService } from "./member-access";

/** Nobody has authorized payments from the pool wallet (or the grant is on another wallet). */
export class NoPoolGrantError extends Error {
  constructor() {
    super("The pool wallet has no active outgoing-payment grant");
    this.name = "NoPoolGrantError";
  }
}

/**
 * Open Payments access to spend from the pool wallet, for payouts to members.
 *
 * Outgoing-payment grants are always interactive, so the pool's comes from the normal
 * wallet-linking flow: whoever owns the pool wallet links it from their OpenCircle account and
 * approves the grant in the wallet. users.op_wallet is unique, so that account is the only one
 * that can hold it; the grant is stored, encrypted and rotated like any member's.
 */
export function createPoolAccess({
  db,
  memberAccess,
  poolWalletAddressUrl,
}: {
  db: Db;
  memberAccess: Pick<MemberAccessService, "withAccess">;
  poolWalletAddressUrl: string;
}) {
  async function ownerId(): Promise<string> {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(wallets, eq(users.opWallet, wallets.id))
      .where(eq(wallets.addressUrl, poolWalletAddressUrl))
      .limit(1);
    if (!owner) throw new NoPoolGrantError();
    return owner.id;
  }

  async function withAccess<T>(call: (access: MemberAccess) => Promise<T>): Promise<T> {
    const owner = await ownerId();
    try {
      return await memberAccess.withAccess(owner, (access) => {
        // Never spend from a wallet other than the pool, whatever the owner's grant points at.
        if (access.walletAddressUrl !== poolWalletAddressUrl) throw new NoPoolGrantError();
        return call(access);
      });
    } catch (err) {
      throw err instanceof NoGrantError ? new NoPoolGrantError() : err;
    }
  }

  return { withAccess };
}

/** Whether the pool wallet's owner has an active grant on it; a database read, for setup checks. */
export async function hasPoolGrant(db: Db, poolWalletAddressUrl: string): Promise<boolean> {
  const [grant] = await db
    .select({ id: walletGrants.id })
    .from(users)
    .innerJoin(wallets, eq(users.opWallet, wallets.id))
    .innerJoin(walletGrants, and(eq(walletGrants.userId, users.id), eq(walletGrants.walletId, wallets.id)))
    .where(and(eq(wallets.addressUrl, poolWalletAddressUrl), eq(walletGrants.status, "ACTIVE")))
    .limit(1);
  return grant !== undefined;
}

export type PoolAccessService = ReturnType<typeof createPoolAccess>;
