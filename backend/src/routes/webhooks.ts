import express, { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { KYC_STATUSES } from "../services/didit/client";
import { verifyDiditSignature } from "../services/didit/signature";
import type { KycService } from "../services/kyc.service";

// Fields we act on; everything else in the payload (including any decision data) is ignored.
export const diditWebhookSchema = z.object({
  session_id: z.uuid(),
  status: z.enum(KYC_STATUSES),
  vendor_data: z.string().nullable().optional(),
});

/** POST /api/webhooks/didit: signed with HMAC-SHA256 over the raw body. */
function diditWebhook(kyc: KycService, secret: string | undefined): RequestHandler {
  return async (req, res) => {
    if (!secret) throw new AppError(503, "WEBHOOK_NOT_CONFIGURED", "Webhook not configured");

    const rawBody: unknown = req.body;
    const signed =
      Buffer.isBuffer(rawBody) &&
      verifyDiditSignature({ rawBody, signature: req.get("x-signature"), timestamp: req.get("x-timestamp"), secret });
    if (!signed) throw new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature");

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new AppError(400, "INVALID_JSON", "Invalid JSON");
    }
    // Signed but not a session status event we use: acknowledge so Didit doesn't retry.
    const event = diditWebhookSchema.safeParse(payload);
    if (!event.success) {
      res.json({ ok: true, result: "ignored" });
      return;
    }

    const { session_id: sessionId, status, vendor_data: vendorData = null } = event.data;
    res.json({ ok: true, result: await kyc.handleWebhook({ sessionId, status, vendorData }) });
  };
}

// Mounted before express.json(): signatures are computed over the raw bytes.
export function webhookRoutes(kyc: KycService, diditSecret: string | undefined): Router {
  return Router().post("/didit", express.raw({ type: "application/json", limit: "1mb" }), diditWebhook(kyc, diditSecret));
}
