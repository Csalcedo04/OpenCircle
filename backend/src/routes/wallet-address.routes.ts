import { Router } from "express";
import { createWalletAddressController } from "../controllers/wallet-address.controller";
import { requireUser } from "../middleware/require-user";
import type { WalletAddressService } from "../services/wallet-address.service";

export function walletAddressRoutes(service: WalletAddressService): Router {
  const controller = createWalletAddressController(service);
  return Router().get("/", requireUser, controller.getWalletAddress);
}
