import { eq } from "drizzle-orm";
import { creditProfiles } from "../../db/schema";
import type { Tx } from "../wallet.service";
import { clampScore, DEFAULT_SCORE_CONFIG, fractionFromScore, scoreFromFraction } from "./credit-score";

/**
 * Moves a wallet's stored score by `change` (clamped to 0..100) and returns the new score.
 * A wallet with no profile yet starts at the initial score. Locks the row, so concurrent
 * changes to the same wallet apply one after the other.
 */
export async function applyScoreChange(tx: Tx, walletId: string, change: number): Promise<number> {
  await tx
    .insert(creditProfiles)
    .values({ walletId, internalCreditScore: fractionFromScore(DEFAULT_SCORE_CONFIG.initialScore) })
    .onConflictDoNothing({ target: creditProfiles.walletId });
  const [row] = await tx
    .select({ fraction: creditProfiles.internalCreditScore })
    .from(creditProfiles)
    .where(eq(creditProfiles.walletId, walletId))
    .for("update");
  if (!row) throw new Error("Credit profile missing after upsert");

  const score = clampScore(scoreFromFraction(row.fraction) + change);
  await tx.update(creditProfiles).set({ internalCreditScore: fractionFromScore(score) }).where(eq(creditProfiles.walletId, walletId));
  return score;
}
