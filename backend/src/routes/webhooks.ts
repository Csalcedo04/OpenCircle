import express, { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { KYC_STATUSES } from "../services/didit/client";
import { diditSignatureFailure } from "../services/didit/signature";
import type { KycService } from "../services/kyc.service";

// Fields we act on; everything else in the payload (including any decision data) is ignored.
export const diditWebhookSchema = z.object({
  session_id: z.uuid(),
  status: z.enum(KYC_STATUSES),
  vendor_data: z.string().nullable().optional(),
});

// One JSON line per step, so a delivery can be followed in the platform logs. No bodies, signatures or PII.
function log(step: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), webhook: "didit", step, ...details }));
}

/** POST /api/webhooks/didit: signed with HMAC-SHA256 over the raw body. */
function diditWebhook(kyc: KycService, secret: string | undefined): RequestHandler {
  return async (req, res) => {
    const rawBody: unknown = req.body;
    const timestamp = req.get("x-timestamp");
    log("received", {
      contentType: req.get("content-type") ?? null,
      bytes: Buffer.isBuffer(rawBody) ? rawBody.length : null,
      hasSignature: Boolean(req.get("x-signature")),
      timestamp: timestamp ?? null,
    });
    if (!secret) {
      log("rejected", { reason: "WEBHOOK_SECRET_NOT_SET" });
      throw new AppError(503, "WEBHOOK_NOT_CONFIGURED", "Webhook not configured");
    }

    const rejectSignature = (reason: string): never => {
      const skewSeconds = timestamp && /^\d+$/.test(timestamp) ? Math.floor(Date.now() / 1000) - Number(timestamp) : null;
      log("rejected", { reason, skewSeconds });
      throw new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature");
    };
    // Not a Buffer: express.raw() skipped it because the content type isn't application/json.
    if (!Buffer.isBuffer(rawBody)) return rejectSignature("BODY_NOT_RAW_JSON");
    const failure = diditSignatureFailure({ rawBody, signature: req.get("x-signature"), timestamp, secret });
    if (failure) return rejectSignature(failure);

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      log("rejected", { reason: "INVALID_JSON" });
      throw new AppError(400, "INVALID_JSON", "Invalid JSON");
    }
    // Signed but not a session status event we use: acknowledge so Didit doesn't retry.
    const event = diditWebhookSchema.safeParse(payload);
    if (!event.success) {
      log("ignored", {
        reason: "NOT_A_STATUS_EVENT",
        // Field names and the event type only; the payload can hold the person's KYC data.
        fields: payload && typeof payload === "object" ? Object.keys(payload) : [],
        webhookType: payload && typeof payload === "object" && "webhook_type" in payload ? String(payload.webhook_type) : null,
        issues: event.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      res.json({ ok: true, result: "ignored" });
      return;
    }

    const { session_id: sessionId, status, vendor_data: vendorData = null } = event.data;
    const result = await kyc.handleWebhook({ sessionId, status, vendorData });
    log("handled", { sessionId, status, result });
    res.json({ ok: true, result });
  };
}

// Mounted before express.json(): signatures are computed over the raw bytes.
export function webhookRoutes(kyc: KycService, diditSecret: string | undefined): Router {
  return Router().post("/didit", express.raw({ type: "application/json", limit: "1mb" }), diditWebhook(kyc, diditSecret));
}
