import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { users, wallets } from "../db/schema";
import { AppError } from "../errors/app-error";
import type { UpdateProfileInput } from "../schemas/user.schema";

export interface LinkedWalletDto {
  addressUrl: string;
  assetCode: string;
  assetScale: number;
}

export interface ProfileDto {
  id: string;
  fullName: string | null;
  phone: string | null;
  dob: string | null;
  wallet: LinkedWalletDto | null;
}

export function createUserService(db: Db) {
  async function findById(id: string): Promise<ProfileDto | null> {
    const [row] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
        dob: users.dob,
        addressUrl: wallets.addressUrl,
        assetCode: wallets.assetCode,
        assetScale: wallets.assetScale,
      })
      .from(users)
      .leftJoin(wallets, eq(users.opWallet, wallets.id))
      .where(eq(users.id, id))
      .limit(1);
    if (!row) return null;

    const { addressUrl, assetCode, assetScale, ...profile } = row;
    const wallet = addressUrl !== null && assetCode !== null && assetScale !== null ? { addressUrl, assetCode, assetScale } : null;
    return { ...profile, wallet };
  }

  async function getById(id: string): Promise<ProfileDto> {
    const profile = await findById(id);
    if (!profile) throw new AppError(404, "USER_NOT_FOUND", "User profile not found");
    return profile;
  }

  return {
    findById,

    // Upsert: the profile row may not exist yet for a freshly signed-up Supabase user.
    async updateProfile(id: string, patch: UpdateProfileInput): Promise<ProfileDto> {
      await db.insert(users).values({ id, ...patch }).onConflictDoUpdate({ target: users.id, set: patch });
      return getById(id);
    },

    // `wallet.addressUrl` must be the canonical id returned by Open Payments, not raw user input.
    async linkWallet(id: string, wallet: LinkedWalletDto): Promise<ProfileDto> {
      await db.transaction(async (tx) => {
        const [stored] = await tx
          .insert(wallets)
          .values(wallet)
          .onConflictDoUpdate({ target: wallets.addressUrl, set: { assetCode: wallet.assetCode, assetScale: wallet.assetScale } })
          .returning({ id: wallets.id });
        if (!stored) throw new Error("Wallet upsert returned no row");

        const [owner] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.opWallet, stored.id), ne(users.id, id)))
          .limit(1);
        if (owner) throw new AppError(409, "WALLET_ALREADY_LINKED", "Wallet address is linked to another account");

        await tx.insert(users).values({ id, opWallet: stored.id }).onConflictDoUpdate({ target: users.id, set: { opWallet: stored.id } });
      });
      return getById(id);
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
