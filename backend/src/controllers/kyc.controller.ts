import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";
import { verifyDiditSignature } from "../lib/didit-signature";
import { authUserId } from "../middleware/require-user";
import { diditWebhookSchema, startKycSchema } from "../schemas/kyc.schema";
import type { KycService } from "../services/kyc.service";

export function createKycController(service: KycService) {
  const getMe: RequestHandler = async (_req, res) => {
    res.json(await service.getStatus(authUserId(res)));
  };

  const start: RequestHandler = async (req, res) => {
    const input = startKycSchema.parse(req.body);
    res.status(201).json(await service.startSession(authUserId(res), input));
  };

  return { getMe, start };
}

/** POST /api/webhooks/didit. Needs the raw body (express.raw) for the signature. */
export function createDiditWebhookHandler(service: KycService, secret: string | undefined): RequestHandler {
  return async (req, res) => {
    if (!secret) throw new AppError(503, "WEBHOOK_NOT_CONFIGURED", "Webhook not configured");

    const rawBody: unknown = req.body;
    const signed =
      Buffer.isBuffer(rawBody) &&
      verifyDiditSignature({
        rawBody,
        signature: req.get("x-signature"),
        timestamp: req.get("x-timestamp"),
        secret,
      });
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
    res.json({ ok: true, result: await service.handleWebhook({ sessionId, status, vendorData }) });
  };
}
