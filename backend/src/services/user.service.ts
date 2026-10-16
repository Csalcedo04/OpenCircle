import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { uniqueViolation } from "../db/errors";
import { documentType, users, wallets } from "../db/schema";
import { AppError } from "../errors/app-error";

export const DOCUMENT_TYPES = documentType.enumValues;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface ProfileInput {
  // From the verified Supabase JWT, never from the request body.
  email: string;
  documentType: DocumentType;
  documentNumber: string;
  nationality: string;
  fullName: string;
  phone: string;
  dob: string;
}

// Identity fields (email, document) are fixed after onboarding.
type EditableProfile = Pick<ProfileInput, "fullName" | "phone" | "dob" | "nationality">;
export type ProfilePatch = { [K in keyof EditableProfile]?: EditableProfile[K] | undefined };

export interface ProfileDto {
  id: string;
  email: string;
  documentType: DocumentType;
  documentNumber: string;
  nationality: string;
  fullName: string | null;
  phone: string | null;
  dob: string | null;
  walletAddress: string | null;
}

const conflictByConstraint: Record<string, () => AppError> = {
  users_pkey: () => new AppError(409, "PROFILE_EXISTS", "User profile already exists"),
  users_document_unique: () => new AppError(409, "DOCUMENT_IN_USE", "Identity document is already registered"),
  users_email_unique: () => new AppError(409, "EMAIL_IN_USE", "Email is already registered"),
};

export function createUserService(db: Db) {
  async function findProfile(id: string): Promise<ProfileDto | null> {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        documentType: users.documentType,
        documentNumber: users.documentNumber,
        nationality: users.nationality,
        fullName: users.fullName,
        phone: users.phone,
        dob: users.dob,
        walletAddress: wallets.addressUrl,
      })
      .from(users)
      .leftJoin(wallets, eq(users.opWallet, wallets.id))
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  async function getProfile(id: string): Promise<ProfileDto> {
    const profile = await findProfile(id);
    if (!profile) {
      throw new AppError(404, "PROFILE_NOT_FOUND", "User profile not found");
    }
    return profile;
  }

  return {
    getProfile,

    async createProfile(id: string, input: ProfileInput): Promise<ProfileDto> {
      try {
        await db.insert(users).values({ id, ...input });
      } catch (err) {
        const conflict = conflictByConstraint[uniqueViolation(err) ?? ""];
        if (conflict) throw conflict();
        throw err;
      }
      return getProfile(id);
    },

    async updateProfile(id: string, patch: ProfilePatch): Promise<ProfileDto> {
      const updated = await db.update(users).set(patch).where(eq(users.id, id)).returning({ id: users.id });
      if (updated.length === 0) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "User profile not found");
      }
      return getProfile(id);
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
