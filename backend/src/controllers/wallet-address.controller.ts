import type { RequestHandler } from "express";
import { walletAddressUrlSchema } from "../schemas/wallet-address.schema";
import type { WalletAddressService } from "../services/wallet-address.service";

export function createWalletAddressController(service: WalletAddressService) {
  const getWalletAddress: RequestHandler = async (req, res) => {
    const { url } = walletAddressUrlSchema.parse(req.query);
    res.json(await service.getByUrl(url));
  };

  return { getWalletAddress };
}
