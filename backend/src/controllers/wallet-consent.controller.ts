import type { RequestHandler } from "express";
import { authUserId } from "../middleware/require-user";
import { walletAddressInputSchema } from "../schemas/wallet-address.schema";
import { completeConsentSchema } from "../schemas/wallet-consent.schema";
import type { WalletConsentService } from "../services/wallet-consent.service";

export function createWalletConsentController(service: WalletConsentService) {
  const start: RequestHandler = async (req, res) => {
    const { url } = walletAddressInputSchema.parse(req.body);
    res.status(201).json(await service.start(authUserId(res), url));
  };

  const complete: RequestHandler = async (req, res) => {
    const input = completeConsentSchema.parse(req.body);
    res.json(await service.complete(authUserId(res), input));
  };

  return { start, complete };
}
