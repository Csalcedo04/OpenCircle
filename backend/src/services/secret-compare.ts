import { timingSafeEqual } from "node:crypto";

/** Constant-time, so response timing doesn't reveal how much of a guessed secret matched. */
export function sameSecret(given: string | undefined, actual: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
