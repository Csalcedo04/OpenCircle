import type { CIRCLE_CADENCES } from "../../db/schema";

export type Cadence = (typeof CIRCLE_CADENCES)[number];

const DAY_MS = 86_400_000;

/** Legacy `round_length_days` stored next to the cadence (the DB still requires it). */
export const cadenceDays: Record<Cadence, number> = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30 };

/**
 * `start` plus `units` cadence units, in UTC. Months are counted from `start` each
 * time (never chained), so Jan 31 → Feb 28 → Mar 31: the day is clamped to the
 * target month's last day and the time of day is kept.
 */
export function addCadence(start: Date, cadence: Cadence, units: number): Date {
  if (cadence !== "MONTHLY") return new Date(start.getTime() + units * cadenceDays[cadence] * DAY_MS);

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + units;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

/** Period `n` (1-based) runs from `periodStart` to `periodEnd`, its deadline. */
export const periodStart = (start: Date, cadence: Cadence, n: number): Date => addCadence(start, cadence, n - 1);
export const periodEnd = (start: Date, cadence: Cadence, n: number): Date => addCadence(start, cadence, n);
