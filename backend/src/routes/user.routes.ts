import { Router } from "express";
import { createUserController } from "../controllers/user.controller";
import { requireUser } from "../middleware/require-user";
import type { UserService } from "../services/user.service";
import type { WalletAddressService } from "../services/wallet-address.service";

export function userRoutes(users: UserService, walletAddresses: WalletAddressService): Router {
  const controller = createUserController(users, walletAddresses);
  return Router()
    .use(requireUser)
    .get("/me", controller.getMe)
    .patch("/me", controller.updateMe)
    .put("/me/wallet", controller.linkWallet);
}
