import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/require-user";
import type { InternalAccountService } from "../services/ledger/internal-account.service";
import { currentUserId } from "./shared";

// Mounted at /api/users/me/internal-account. Creating the account is part of onboarding, so it
// needs a signed-in user with a profile but no KYC yet (KYC comes after a funding source exists).

export const movementsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

export function internalAccountRoutes(accounts: InternalAccountService): Router {
  const create: RequestHandler = async (_req, res) => {
    res.status(201).json(await accounts.create(currentUserId(res)));
  };

  const get: RequestHandler = async (_req, res) => {
    res.json(await accounts.get(currentUserId(res)));
  };

  const movements: RequestHandler = async (req, res) => {
    const { limit } = movementsQuerySchema.parse(req.query);
    res.json(await accounts.movements(currentUserId(res), limit));
  };

  return Router().use(requireUser).post("/", create).get("/", get).get("/movements", movements);
}
