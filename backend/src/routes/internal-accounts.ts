import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { requireUser } from "../middleware/require-user";
import type { DepositService } from "../services/ledger/deposit.service";
import type { InternalAccountService } from "../services/ledger/internal-account.service";
import { minorUnitsSchema } from "../services/money";
import { currentUserId, pathId } from "./shared";

// Mounted at /api/users/me/internal-account. Creating the account is part of onboarding, so it
// needs a signed-in user with a profile but no KYC yet (KYC comes after a funding source exists).
// Deposits need the same: they only move test funds into the user's own account.

export const movementsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

// Strict: the asset is the account's, never the caller's.
export const createDepositSchema = z.strictObject({ value: minorUnitsSchema("positive") });

export interface InternalAccountRouteServices {
  internalAccounts: InternalAccountService;
  deposits: DepositService;
}

export function internalAccountRoutes({ internalAccounts: accounts, deposits }: InternalAccountRouteServices): Router {
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

  const depositNotFound = () => new AppError(404, "DEPOSIT_NOT_FOUND", "Deposit not found");

  const createDeposit: RequestHandler = async (req, res) => {
    const { value } = createDepositSchema.parse(req.body);
    res.status(201).json(await deposits.create(currentUserId(res), value));
  };

  const getDeposit: RequestHandler = async (req, res) => {
    res.json(await deposits.get(currentUserId(res), pathId(req.params.id, depositNotFound)));
  };

  const payDeposit: RequestHandler = async (req, res) => {
    res.json(await deposits.payWithLinkedWallet(currentUserId(res), pathId(req.params.id, depositNotFound)));
  };

  return Router()
    .use(requireUser)
    .post("/", create)
    .get("/", get)
    .get("/movements", movements)
    .post("/deposits", createDeposit)
    .get("/deposits/:id", getDeposit)
    .post("/deposits/:id/pay", payDeposit);
}
