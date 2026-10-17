import { and, eq, exists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import { uniqueViolation } from "../db/errors";
import { circleApplications, circleInvites, circleMembers, creditProfiles, documentType, friendships, users, wallets } from "../db/schema";
import type { Tx } from "./wallet.service";
import { AppError } from "../errors/app-error";
import { icsFromStored } from "./credit/credit-score";

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

// What other members see about an applicant to a savings circle: no contact or identity data.
export interface PublicProfileDto {
  fullName: string | null;
  walletAddress: string;
  // Payment-reliability score (ICS), 0..100; null until it is first computed.
  ics: number | null;
}

export type PublicProfileLookup = { id: string } | { walletAddress: string };

// Select these from `users` inner-joined with `wallets` and left-joined with `credit_profiles`.
export const publicProfileColumns = {
  fullName: users.fullName,
  walletAddress: wallets.addressUrl,
  score: creditProfiles.internalCreditScore,
};

export const toPublicProfile = (row: { fullName: string | null; walletAddress: string; score: number | null }): PublicProfileDto => ({
  fullName: row.fullName,
  walletAddress: row.walletAddress,
  ics: icsFromStored(row.score),
});

/**
 * SQL condition on `users`: the row is the viewer, shares a circle with the viewer, or has a
 * pending application to a circle the viewer belongs to. Who may see another user's profile.
 */
export function profileVisibleTo(db: Db | Tx, viewerId: string) {
  const viewer = alias(circleMembers, "viewer");
  const peer = alias(circleMembers, "peer");
  const sharesCircle = db
    .select({ one: sql`1` })
    .from(viewer)
    .innerJoin(peer, eq(peer.circleId, viewer.circleId))
    .where(and(eq(viewer.userId, viewerId), eq(peer.userId, users.id)));
  const appliedToViewersCircle = db
    .select({ one: sql`1` })
    .from(viewer)
    .innerJoin(circleApplications, eq(circleApplications.circleId, viewer.circleId))
    .where(and(eq(viewer.userId, viewerId), eq(circleApplications.userId, users.id), eq(circleApplications.status, "PENDING")));
  // Someone with a seat in the circle invited this user; or this user invited the viewer.
  const invitedToViewersCircle = db
    .select({ one: sql`1` })
    .from(viewer)
    .innerJoin(circleInvites, eq(circleInvites.circleId, viewer.circleId))
    .where(and(eq(viewer.userId, viewerId), eq(circleInvites.userId, users.id), eq(circleInvites.status, "ACTIVE")));
  const invitedViewer = db
    .select({ one: sql`1` })
    .from(circleInvites)
    .where(and(eq(circleInvites.userId, viewerId), eq(circleInvites.createdBy, users.id), eq(circleInvites.status, "ACTIVE")));
  // Friends, and people with a friend request pending between them (to see who is asking).
  const friendsWithViewer = db
    .select({ one: sql`1` })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, users.id)),
        and(eq(friendships.requesterId, users.id), eq(friendships.addresseeId, viewerId)),
      ),
    );
  return or(
    eq(users.id, viewerId),
    exists(sharesCircle),
    exists(appliedToViewersCircle),
    exists(invitedToViewersCircle),
    exists(invitedViewer),
    exists(friendsWithViewer),
  );
}

/** The id of the account with this email (stored lowercase), or null. */
export async function findUserIdByEmail(db: Db | Tx, email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return user?.id ?? null;
}

const profileNotFound = () => new AppError(404, "PROFILE_NOT_FOUND", "User profile not found");

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
    if (!profile) throw profileNotFound();
    return profile;
  }

  /**
   * Visible only to the user themselves, to members of a circle they share, and to members
   * of a circle the user has a pending application to. Anyone else gets the same 404 as for
   * an unknown user. Users without a linked wallet have no ICS and cannot apply, so they are
   * not found either.
   */
  async function getPublicProfile(viewerId: string, lookup: PublicProfileLookup): Promise<PublicProfileDto> {
    const [row] = await db
      .select(publicProfileColumns)
      .from(users)
      .innerJoin(wallets, eq(users.opWallet, wallets.id))
      .leftJoin(creditProfiles, eq(creditProfiles.walletId, wallets.id))
      .where(
        and(
          "id" in lookup ? eq(users.id, lookup.id) : eq(wallets.addressUrl, lookup.walletAddress),
          profileVisibleTo(db, viewerId),
        ),
      )
      .limit(1);

    if (!row) throw profileNotFound();
    return toPublicProfile(row);
  }

  return {
    getProfile,
    getPublicProfile,

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
      if (updated.length === 0) throw profileNotFound();
      return getProfile(id);
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
