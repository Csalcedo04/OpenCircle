import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { walletGrants, wallets } from "../../db/schema";
import { AccessTokenExpiredError, type ContributionPayments, type MemberAccess } from "../open-payments/payments";
import type { TokenCipher } from "../open-payments/token-cipher";

export class NoGrantError extends Error {
  constructor() {
    super("Member has no active wallet grant");
    this.name = "NoGrantError";
  }
}

export interface MemberAccessDeps {
  db: Db;
  cipher: TokenCipher;
  payments: Pick<ContributionPayments, "rotateToken">;
  /** Real time: token expiry is the wallet's clock, never a test clock. */
  now?: () => Date;
}

/**
 * Runs Open Payments calls with a member's standing grant. Rotates the access token
 * when it has expired (or the wallet answers 401) and stores the new one encrypted;
 * tokens never leave this module in plain text except to the call itself.
 */
export function createMemberAccess({ db, cipher, payments, now = () => new Date() }: MemberAccessDeps) {
  // Row-locked so two contributions of the same member can't rotate the same token twice
  // (a rotation invalidates the previous token).
  async function rotate(grantId: string, usedCiphertext: string): Promise<string> {
    return db.transaction(async (tx) => {
      const [grant] = await tx.select().from(walletGrants).where(eq(walletGrants.id, grantId)).for("update");
      if (!grant || grant.status !== "ACTIVE") throw new NoGrantError();
      // Someone else rotated it meanwhile: use theirs.
      if (grant.accessTokenCiphertext !== usedCiphertext) return cipher.decrypt(grant.accessTokenCiphertext);

      const rotated = await payments.rotateToken({ manageUri: grant.manageUri, accessToken: cipher.decrypt(grant.accessTokenCiphertext) });
      await tx
        .update(walletGrants)
        .set({
          accessTokenCiphertext: cipher.encrypt(rotated.accessToken),
          manageUri: rotated.manageUri,
          tokenExpiresAt: rotated.expiresIn === null ? null : new Date(now().getTime() + rotated.expiresIn * 1000),
        })
        .where(eq(walletGrants.id, grantId));
      return rotated.accessToken;
    });
  }

  return {
    async withAccess<T>(userId: string, call: (access: MemberAccess) => Promise<T>): Promise<T> {
      const [grant] = await db
        .select({
          id: walletGrants.id,
          ciphertext: walletGrants.accessTokenCiphertext,
          expiresAt: walletGrants.tokenExpiresAt,
          walletAddressUrl: wallets.addressUrl,
        })
        .from(walletGrants)
        .innerJoin(wallets, eq(walletGrants.walletId, wallets.id))
        .where(and(eq(walletGrants.userId, userId), eq(walletGrants.status, "ACTIVE")))
        .limit(1);
      if (!grant) throw new NoGrantError();

      const expired = grant.expiresAt !== null && grant.expiresAt <= now();
      const accessToken = expired ? await rotate(grant.id, grant.ciphertext) : cipher.decrypt(grant.ciphertext);
      try {
        return await call({ walletAddressUrl: grant.walletAddressUrl, accessToken });
      } catch (err) {
        if (!(err instanceof AccessTokenExpiredError) || expired) throw err;
        // Expired early at the wallet: rotate once and retry.
        return call({ walletAddressUrl: grant.walletAddressUrl, accessToken: await rotate(grant.id, grant.ciphertext) });
      }
    },
  };
}

export type MemberAccessService = ReturnType<typeof createMemberAccess>;
