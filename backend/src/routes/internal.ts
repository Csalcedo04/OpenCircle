import { Router, type RequestHandler } from "express";
import { AppError } from "../errors/app-error";
import type { CircleTickService } from "../services/circles/circle-cycle";
import { sameSecret } from "../services/secret-compare";

/**
 * Jobs for the external scheduler (cron). Authenticated by the shared `x-cron-secret`
 * header; without CRON_SECRET configured they answer 503.
 */
export function internalRoutes(tick: Pick<CircleTickService, "run">, cronSecret: string | undefined): Router {
  const requireCron: RequestHandler = (req, _res, next) => {
    if (!cronSecret) throw new AppError(503, "CRON_DISABLED", "Scheduled jobs are not configured");
    if (!sameSecret(req.get("x-cron-secret"), cronSecret)) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
    next();
  };

  // Advances every active circle: periods, scores and payment reminders. Safe to repeat.
  const runTick: RequestHandler = async (_req, res) => {
    res.json(await tick.run());
  };

  return Router().use(requireCron).post("/circles/tick", runTick);
}
