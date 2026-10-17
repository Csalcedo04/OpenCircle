import { desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { circleMembers, circles, contributions, reviews, rounds, users, wallets } from "../db/schema";
import { AppError } from "../errors/app-error";
import type { CircleService, CircleSummaryDto } from "./circle.service";
import { displayName } from "./display-name";

/** How a member has paid, from their contributions in every circle. */
export interface PaymentRecord {
  /** Completed by the round's deadline. */
  onTime: number;
  /** Completed after the deadline. */
  late: number;
  /** Failed (not paid). Cancelled rounds aren't the member's fault and don't count. */
  missed: number;
}

/** Ratings received from other members, across all circles. */
export interface RatingSummary {
  count: number;
  /** Average rating ×10 as an integer (46 = 4.6 stars); 0 when there are none. */
  tenths: number;
}

export interface MemberRecord {
  payments: PaymentRecord;
  ratings: RatingSummary;
  circlesCompleted: number;
  /** When they first joined a circle; null if they never have. */
  memberSince: string | null;
}

export interface ReviewDto {
  id: string;
  authorId: string;
  authorName: string;
  subjectId: string;
  circleId: string;
  circleName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface MemberDto extends MemberRecord {
  id: string;
  // "Ana G.", never the full legal name.
  displayName: string;
  walletAddress: string | null;
  /** Reviews this member received, newest first. */
  reviews: ReviewDto[];
  circles: CircleSummaryDto[];
}

export const emptyRecord = (): MemberRecord => ({
  payments: { onTime: 0, late: 0, missed: 0 },
  ratings: { count: 0, tenths: 0 },
  circlesCompleted: 0,
  memberSince: null,
});

/** Payment record, ratings, circles completed and member-since for many users in four queries. */
export async function memberRecords(db: Db, userIds: readonly string[]): Promise<Map<string, MemberRecord>> {
  const records = new Map(userIds.map((id) => [id, emptyRecord()]));
  if (userIds.length === 0) return records;
  const ids = [...new Set(userIds)];

  const payments = await db
    .select({
      userId: circleMembers.userId,
      onTime: sql<number>`count(*) filter (where ${contributions.status} = 'COMPLETED' and ${contributions.completedAt} <= ${rounds.deadline})::int`,
      late: sql<number>`count(*) filter (where ${contributions.status} = 'COMPLETED' and ${contributions.completedAt} > ${rounds.deadline})::int`,
      missed: sql<number>`count(*) filter (where ${contributions.status} = 'FAILED')::int`,
    })
    .from(contributions)
    .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
    .innerJoin(rounds, eq(contributions.roundId, rounds.id))
    .where(inArray(circleMembers.userId, ids))
    .groupBy(circleMembers.userId);

  const memberships = await db
    .select({
      userId: circleMembers.userId,
      completed: sql<number>`count(*) filter (where ${circles.status} = 'COMPLETED')::int`,
      since: sql<Date>`min(${circleMembers.joinedAt})`,
    })
    .from(circleMembers)
    .innerJoin(circles, eq(circleMembers.circleId, circles.id))
    .where(inArray(circleMembers.userId, ids))
    .groupBy(circleMembers.userId);

  const ratings = await db
    .select({
      userId: reviews.subjectId,
      count: sql<number>`count(*)::int`,
      tenths: sql<number>`round(avg(${reviews.rating}) * 10)::int`,
    })
    .from(reviews)
    .where(inArray(reviews.subjectId, ids))
    .groupBy(reviews.subjectId);

  for (const p of payments) {
    const r = records.get(p.userId);
    if (r) r.payments = { onTime: p.onTime, late: p.late, missed: p.missed };
  }
  for (const r of ratings) {
    const rec = records.get(r.userId);
    if (rec) rec.ratings = { count: r.count, tenths: r.tenths };
  }
  for (const m of memberships) {
    const r = records.get(m.userId);
    if (!r) continue;
    r.circlesCompleted = m.completed;
    // Aggregates come back from the driver as strings, not Dates.
    r.memberSince = m.since ? new Date(m.since).toISOString() : null;
  }
  return records;
}

/** Reviews matching `where`, with author names and circle names, newest first. */
export async function findReviews(db: Db, where: SQL): Promise<ReviewDto[]> {
  const rows = await db
    .select({
      id: reviews.id,
      authorId: reviews.authorId,
      authorFullName: users.fullName,
      subjectId: reviews.subjectId,
      circleId: reviews.circleId,
      circleName: circles.name,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.authorId, users.id))
    .innerJoin(circles, eq(reviews.circleId, circles.id))
    .where(where)
    .orderBy(desc(reviews.createdAt));
  return rows.map(({ authorFullName, createdAt, ...r }) => ({
    ...r,
    authorName: displayName(authorFullName),
    createdAt: createdAt.toISOString(),
  }));
}

export function createMemberService({ db, circles: circleService }: { db: Db; circles: Pick<CircleService, "listForUser"> }) {
  return {
    /** A member's profile for signed-in users: record, reviews received and their circles. */
    async get(userId: string): Promise<MemberDto> {
      const [user] = await db
        .select({ id: users.id, fullName: users.fullName, walletAddress: wallets.addressUrl })
        .from(users)
        .leftJoin(wallets, eq(users.opWallet, wallets.id))
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found");

      const [record, received, memberCircles] = await Promise.all([
        memberRecords(db, [userId]),
        findReviews(db, eq(reviews.subjectId, userId)),
        circleService.listForUser(userId),
      ]);
      return {
        id: user.id,
        displayName: displayName(user.fullName),
        walletAddress: user.walletAddress,
        ...(record.get(userId) ?? emptyRecord()),
        reviews: received,
        circles: memberCircles,
      };
    },
  };
}

export type MemberService = ReturnType<typeof createMemberService>;
