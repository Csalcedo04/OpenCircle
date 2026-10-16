import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/require-user";
import type { WalletAddressService } from "../services/open-payments/wallet-address.service";
import { walletAddressInputSchema } from "../services/open-payments/payment-pointer";

export const walletAddressQuerySchema = z.object({ url: walletAddressInputSchema });

export type WalletAddressQuery = z.infer<typeof walletAddressQuerySchema>;

export function walletAddressRoutes(service: WalletAddressService): Router {
  const getWalletAddress: RequestHandler = async (req, res) => {
    const { url }: WalletAddressQuery = walletAddressQuerySchema.parse(req.query);
    res.json(await service.getByUrl(url));
  };

  return Router().use(requireUser).get("/", getWalletAddress);
}
