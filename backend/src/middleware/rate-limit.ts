import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "../errors/app-error";
import { authUserId } from "./require-user";

// Per caller, in memory (counters are per process). Runs after requireUser, so the key is the
// verified user id, never a spoofable IP header.
export function perUserRateLimit({ limit, windowMs = 60_000 }: { limit: number; windowMs?: number }): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_req, res) => authUserId(res),
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Too many requests, try again later")),
  });
}

/** Lookups of other users' public profiles. */
export const publicProfileRateLimit = (): RequestHandler => perUserRateLimit({ limit: 30 });
