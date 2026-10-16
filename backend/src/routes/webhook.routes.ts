import express, { Router } from "express";
import { createDiditWebhookHandler } from "../controllers/kyc.controller";
import type { KycService } from "../services/kyc.service";

// Mounted before express.json(): signatures are computed over the raw bytes.
export function webhookRoutes(kyc: KycService, diditSecret: string | undefined): Router {
  return Router().post(
    "/didit",
    express.raw({ type: "application/json", limit: "1mb" }),
    createDiditWebhookHandler(kyc, diditSecret),
  );
}
