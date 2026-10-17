import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { auditEvents, ledgerAccounts, users } from "../../db/schema";
import { AppError } from "../../errors/app-error";
import { toAmountDto, type AmountDto, type Asset } from "../money";
import type { Tx } from "../wallet.service";
import { movementsOf, systemAccountInTx, transferInTx, type LedgerAccountRow, type MovementDto } from "./ledger.service";

/**
 * A user's OpenCircle account: a USER row on the internal ledger, denominated in OpenCircle's
 * wallet asset. It is not an Open Payments wallet address (OpenCircle can't create those) and
 * never pretends to be one; it is identified by an opaque id.
 */

export interface InternalAccountDto {
  id: string;
  balance: AmountDto;
  createdAt: string;
}

export interface InternalAccountDeps {
  db: Db;
  /** OpenCircle's wallet asset: every internal account is in it. Network I/O, so called outside transactions. */
  resolveAsset: () => Promise<Asset>;
  /** Demo funds credited to every new account, in minor units. 0n: no seeding (production). */
  seedValue: bigint;
}

const notFound = () => new AppError(404, "INTERNAL_ACCOUNT_NOT_FOUND", "No OpenCircle account for this user");

export const toInternalAccountDto = (row: LedgerAccountRow): InternalAccountDto => ({
  id: row.id,
  balance: toAmountDto({ value: row.balance, assetCode: row.assetCode, assetScale: row.assetScale }),
  createdAt: row.createdAt.toISOString(),
});

/** The user's internal account row, or null when they never created one. */
export async function userAccountInTx(db: Db | Tx, userId: string): Promise<LedgerAccountRow | null> {
  const [row] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.ownerUserId, userId)).limit(1);
  return row ?? null;
}

/** A circle's pot on the ledger. Created with the circle (and backfilled), so missing means a bug. */
export async function poolAccountInTx(db: Db | Tx, circleId: string): Promise<LedgerAccountRow> {
  const [row] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.circleId, circleId)).limit(1);
  if (!row) throw new Error(`Circle ${circleId} has no pool account`);
  return row;
}

export function createInternalAccountService({ db, resolveAsset, seedValue }: InternalAccountDeps) {
  async function get(userId: string): Promise<InternalAccountDto> {
    const row = await userAccountInTx(db, userId);
    if (!row) throw notFound();
    return toInternalAccountDto(row);
  }

  return {
    get,

    /** Creates the user's account, seeding demo funds when configured. One per user. */
    async create(userId: string): Promise<InternalAccountDto> {
      const asset = await resolveAsset();
      await db.transaction(async (tx) => {
        // Lock the user row so two concurrent creates serialize on the unique owner.
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!user) throw new AppError(404, "PROFILE_NOT_FOUND", "User profile not found");

        const [created] = await tx
          .insert(ledgerAccounts)
          .values({ kind: "USER", ownerUserId: userId, assetCode: asset.assetCode, assetScale: asset.assetScale })
          .onConflictDoNothing({ target: ledgerAccounts.ownerUserId })
          .returning({ id: ledgerAccounts.id });
        if (!created) throw new AppError(409, "INTERNAL_ACCOUNT_EXISTS", "This user already has an OpenCircle account");

        await tx.insert(auditEvents).values({ accountId: created.id, eventType: "account.created", externalId: `account.created:${created.id}` });

        if (seedValue > 0n) {
          // Demo money: its counterpart is the DEMO_SEED system account, so it is never mistaken
          // for funds that reached OpenCircle's wallet.
          const seed = await systemAccountInTx(tx, "DEMO_SEED", asset);
          await transferInTx(tx, {
            key: `seed:${created.id}`,
            kind: "SEED",
            fromAccountId: seed.id,
            toAccountId: created.id,
            amount: { value: seedValue, ...asset },
          });
          await tx
            .insert(auditEvents)
            .values({ accountId: created.id, eventType: "account.seeded", externalId: `account.seeded:${created.id}`, amount: seedValue });
        }
      });
      return get(userId);
    },

    /** The account's statement, newest first. */
    async movements(userId: string, limit: number): Promise<MovementDto[]> {
      const row = await userAccountInTx(db, userId);
      if (!row) throw notFound();
      return movementsOf(db, row.id, limit);
    },
  };
}

export type InternalAccountService = ReturnType<typeof createInternalAccountService>;
