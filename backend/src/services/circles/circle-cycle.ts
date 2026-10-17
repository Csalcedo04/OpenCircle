import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client";
import { circles } from "../../db/schema";
import type { ApplicationNotices } from "./application-notices";
import type { PayoutService } from "./payout.service";
import type { PeriodEngine } from "./period-engine";
import type { RemindersService } from "./reminders.service";
import type { ScoringService } from "./scoring.service";

export type CircleCycle = Pick<PeriodEngine, "advanceCircle">;

/**
 * One step of a circle at circle time `now`: the period engine collects and closes periods,
 * closed pots are paid out to members, payment outcomes move members' scores, then unpaid
 * members are reminded. A drop-in for the engine, so test clocks run the whole cycle too.
 */
export function createCircleCycle(deps: {
  engine: CircleCycle;
  payouts: Pick<PayoutService, "payCircle">;
  scoring: Pick<ScoringService, "scoreCircle">;
  reminders: Pick<RemindersService, "remindCircle">;
}): CircleCycle {
  return {
    async advanceCircle(circleId, now) {
      await deps.engine.advanceCircle(circleId, now);
      await deps.payouts.payCircle(circleId, now);
      await deps.scoring.scoreCircle(circleId, now);
      await deps.reminders.remindCircle(circleId, now);
    },
  };
}

export interface TickResult {
  circles: number;
  failed: number;
  // Application emails re-sent because an earlier send failed.
  noticesResent: number;
}

const NOTICE_RETRY_MS = 7 * 86_400_000;

/**
 * Runs the cycle for every active real-time circle (test-clock circles move with their clock),
 * then re-sends application emails of the last 7 days that failed.
 */
export function createCircleTick({
  db,
  cycle,
  notices,
  now = () => new Date(),
}: {
  db: Db;
  cycle: CircleCycle;
  notices: Pick<ApplicationNotices, "retryRecent">;
  now?: () => Date;
}) {
  return {
    async run(): Promise<TickResult> {
      const active = await db
        .select({ id: circles.id })
        .from(circles)
        .where(and(eq(circles.status, "ACTIVE"), isNull(circles.testClockId)));
      let failed = 0;
      // One circle's failure never stops the others; the next tick retries it.
      for (const { id } of active) {
        try {
          await cycle.advanceCircle(id, now());
        } catch (err) {
          failed++;
          console.error("Circle tick failed", id, err instanceof Error ? err.name : "unknown");
        }
      }
      const noticesResent = await notices.retryRecent(new Date(now().getTime() - NOTICE_RETRY_MS)).catch((err: unknown) => {
        console.error("Application notice retry failed", err instanceof Error ? err.name : "unknown");
        return 0;
      });
      return { circles: active.length, failed, noticesResent };
    },
  };
}

export type CircleTickService = ReturnType<typeof createCircleTick>;
