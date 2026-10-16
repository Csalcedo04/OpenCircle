import { eq } from "drizzle-orm";
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
    getById,

    // Upsert: the profile row may not exist yet for a freshly signed-up Supabase user.
    async updateProfile(id: string, patch: UpdateProfileInput): Promise<ProfileDto> {
      await db.insert(users).values({ id, ...patch }).onConflictDoUpdate({ target: users.id, set: patch });
      return getById(id);
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
