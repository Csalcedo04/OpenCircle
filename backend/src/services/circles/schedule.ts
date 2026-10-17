// Round dates. A round's deadline is its pay date; the next round opens at the previous deadline.

export const DAY_MS = 86_400_000;
const LATE_GRACE_DAYS = 14;
const BEFORE_NEXT_CYCLE_DAYS = 5;

/** Deadline of round `n` (1-based) for a circle started at `startedAt`. */
export const roundDeadline = (startedAt: Date, roundLengthDays: number, n: number): Date =>
  new Date(startedAt.getTime() + n * roundLengthDays * DAY_MS);

/**
 * When an unpaid contribution counts as missed: 14 days after the deadline or 5 days
 * before the next cycle's deadline, whichever comes first, but never before the deadline.
 * The last round has no next cycle and gets the 14 days.
 */
export function penaltyAt(deadline: Date, nextDeadline: Date | null): Date {
  const grace = deadline.getTime() + LATE_GRACE_DAYS * DAY_MS;
  const beforeNext = nextDeadline ? nextDeadline.getTime() - BEFORE_NEXT_CYCLE_DAYS * DAY_MS : grace;
  return new Date(Math.max(deadline.getTime(), Math.min(grace, beforeNext)));
}
