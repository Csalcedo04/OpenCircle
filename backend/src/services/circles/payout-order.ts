import type { PAYOUT_ORDERS } from "../../db/schema";
import { DEFAULT_SCORE_CONFIG } from "../credit/credit-score";

export type PayoutOrder = (typeof PAYOUT_ORDERS)[number];

export interface RankedSeat {
  id: string;
  /** Stored score fraction (0..1); null until the member's first score. */
  score: number | null;
  joinedAt: Date;
}

// Someone without a score yet ranks as a newcomer: the initial score.
const NEWCOMER = (DEFAULT_SCORE_CONFIG.initialScore - DEFAULT_SCORE_CONFIG.minScore) / (DEFAULT_SCORE_CONFIG.maxScore - DEFAULT_SCORE_CONFIG.minScore);

/** Seat ids in payout order (round 1 first). Equal scores keep join order. */
export function payoutSequence(seats: readonly RankedSeat[], order: PayoutOrder): string[] {
  const direction = order === "BEST_SCORE_FIRST" ? -1 : 1;
  return [...seats]
    .sort((a, b) => direction * ((a.score ?? NEWCOMER) - (b.score ?? NEWCOMER)) || a.joinedAt.getTime() - b.joinedAt.getTime())
    .map((s) => s.id);
}
