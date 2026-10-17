import { and, asc, eq, gt, inArray, lte, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { circleMembers, circles, contributions, rounds, testClocks, users } from "../db/schema";
import { AppError } from "../errors/app-error";
import { displayName } from "./circle.service";
import type { PeriodEngine } from "./circles/period-engine";

export interface CreateTestClockInput {
  name: string;
  frozenTime?: Date | undefined;
}

export interface TestClockMemberDto {
  memberId: string;
  displayName: string;
  status: string;
  failureCode: string | null;
}

export interface TestClockCircleDto {
  id: string;
  name: string;
  status: string;
  cadence: string;
  size: number;
  seatsTaken: number;
  // For the join link: the clock (and its circles) belong to the viewer, who created them.
  // Null until the circle gets a standing invite code (migration 0010 moves codes to circle_invites).
  inviteCode: string | null;
  // The period being collected; null before the circle starts or once every period has closed.
  currentPeriod: {
    number: number;
    state: string;
    startsAt: string;
    deadline: string;
    beneficiary: { memberId: string; displayName: string };
    contributions: TestClockMemberDto[];
  } | null;
  // The next period start or deadline after the frozen time; null when nothing is left.
  nextBoundary: string | null;
}

export interface TestClockDto {
  id: string;
  name: string;
  frozenTime: string;
  circles: TestClockCircleDto[];
}

const notFound = () => new AppError(404, "TEST_CLOCK_NOT_FOUND", "Test clock not found");

/**
 * Stripe-style simulated time for circles (dev only). A clock's circles run the same
 * period engine as real time, at the clock's frozen time; advancing the clock walks
 * every period start and deadline it crosses, in order.
 */
export function createTestClockService({ db, engine }: { db: Db; engine: Pick<PeriodEngine, "advanceCircle"> }) {
  // One advance per clock at a time (single API process; this is a dev-only feature).
  const running = new Map<string, Promise<unknown>>();

  async function owned(ownerUserId: string, id: string) {
    const [clock] = await db
      .select()
      .from(testClocks)
      .where(and(eq(testClocks.id, id), eq(testClocks.ownerUserId, ownerUserId)))
      .limit(1);
    if (!clock) throw notFound();
    return clock;
  }

  async function circleView(circle: typeof circles.$inferSelect, frozen: Date): Promise<TestClockCircleDto> {
    const roundRows = await db.select().from(rounds).where(eq(rounds.circleId, circle.id)).orderBy(asc(rounds.number));
    const seats = await db
      .select({ id: circleMembers.id, fullName: users.fullName })
      .from(circleMembers)
      .innerJoin(users, eq(circleMembers.userId, users.id))
      .where(eq(circleMembers.circleId, circle.id));
    const name = (memberId: string) => displayName(seats.find((s) => s.id === memberId)?.fullName ?? null);

    // The collecting round, or else the last one that closed.
    const current = roundRows.find((r) => r.state === "COLLECTING") ?? roundRows.filter((r) => r.closedAt).at(-1) ?? null;
    const rows = current
      ? await db
          .select({ memberId: contributions.memberId, status: contributions.status, failureCode: contributions.failureCode })
          .from(contributions)
          .where(eq(contributions.roundId, current.id))
      : [];
    const next = roundRows
      .flatMap((r) => [r.startsAt, r.deadline])
      .filter((t) => t > frozen)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return {
      id: circle.id,
      name: circle.name,
      status: circle.status,
      cadence: circle.cadence,
      size: circle.size,
      seatsTaken: seats.length,
      inviteCode: circle.inviteCode,
      currentPeriod: current && {
        number: current.number,
        state: current.state,
        startsAt: current.startsAt.toISOString(),
        deadline: current.deadline.toISOString(),
        beneficiary: { memberId: current.beneficiaryMemberId, displayName: name(current.beneficiaryMemberId) },
        contributions: rows.map((c) => ({ memberId: c.memberId, displayName: name(c.memberId), status: c.status, failureCode: c.failureCode })),
      },
      nextBoundary: next?.toISOString() ?? null,
    };
  }

  async function get(ownerUserId: string, id: string): Promise<TestClockDto> {
    const clock = await owned(ownerUserId, id);
    const attached = await db.select().from(circles).where(eq(circles.testClockId, id)).orderBy(asc(circles.createdAt));
    return {
      id: clock.id,
      name: clock.name,
      frozenTime: clock.frozenTime.toISOString(),
      circles: await Promise.all(attached.map((c) => circleView(c, clock.frozenTime))),
    };
  }

  // Runs every attached circle at each boundary in (frozen, to], then at `to`.
  async function walk(id: string, frozen: Date, to: Date): Promise<void> {
    const attached = await db
      .select({ id: circles.id })
      .from(circles)
      .where(and(eq(circles.testClockId, id), eq(circles.status, "ACTIVE")));
    const ids = attached.map((c) => c.id);

    const boundaries =
      ids.length === 0
        ? []
        : await db
            .select({ startsAt: rounds.startsAt, deadline: rounds.deadline })
            .from(rounds)
            .where(
              and(
                inArray(rounds.circleId, ids),
                or(and(gt(rounds.startsAt, frozen), lte(rounds.startsAt, to)), and(gt(rounds.deadline, frozen), lte(rounds.deadline, to))),
              ),
            );
    const times = [...new Set(boundaries.flatMap((b) => [b.startsAt, b.deadline]).map((t) => t.getTime()))]
      .filter((t) => t > frozen.getTime() && t <= to.getTime())
      .sort((a, b) => a - b)
      .map((t) => new Date(t));
    if (times.at(-1)?.getTime() !== to.getTime()) times.push(to);

    for (const t of times) {
      for (const circleId of ids) await engine.advanceCircle(circleId, t);
      // Saved after each boundary, so a failure mid-way resumes from there.
      await db.update(testClocks).set({ frozenTime: t }).where(eq(testClocks.id, id));
    }
  }

  return {
    get,

    async create(ownerUserId: string, input: CreateTestClockInput): Promise<TestClockDto> {
      const [clock] = await db
        .insert(testClocks)
        .values({ name: input.name, ownerUserId, frozenTime: input.frozenTime ?? new Date() })
        .returning({ id: testClocks.id });
      if (!clock) throw new Error("Test clock insert returned no row");
      return get(ownerUserId, clock.id);
    },

    /** Moves the clock forward to `to`; `to` equal to the frozen time only re-reads payments. */
    async advance(ownerUserId: string, id: string, to: Date): Promise<TestClockDto> {
      const previous = running.get(id) ?? Promise.resolve();
      const run = previous
        .catch(() => undefined)
        .then(async () => {
          const clock = await owned(ownerUserId, id);
          if (to < clock.frozenTime) throw new AppError(422, "TEST_CLOCK_BACKWARDS", "A test clock can only move forward");
          await walk(id, clock.frozenTime, to);
        });
      running.set(id, run);
      try {
        await run;
      } finally {
        if (running.get(id) === run) running.delete(id);
      }
      return get(ownerUserId, id);
    },

    /** Runs a clock's circle once at the frozen time (e.g. right after it starts). */
    async runCircle(circleId: string): Promise<void> {
      const [row] = await db
        .select({ frozenTime: testClocks.frozenTime })
        .from(circles)
        .innerJoin(testClocks, eq(circles.testClockId, testClocks.id))
        .where(eq(circles.id, circleId))
        .limit(1);
      if (row) await engine.advanceCircle(circleId, row.frozenTime);
    },
  };
}

export type TestClockService = ReturnType<typeof createTestClockService>;
