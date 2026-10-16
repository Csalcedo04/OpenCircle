import { Router } from "express";
import { createUserController } from "../controllers/user.controller";
import { createWalletConsentController } from "../controllers/wallet-consent.controller";
import { requireUser } from "../middleware/require-user";
import type { UserService } from "../services/user.service";
import type { WalletConsentService } from "../services/wallet-consent.service";

export function userRoutes(users: UserService, walletConsent: WalletConsentService): Router {
  const controller = createUserController(users);
  const consent = createWalletConsentController(walletConsent);
  return Router()
    .use(requireUser)
    .get("/me", controller.getMe)
    .patch("/me", controller.updateMe)
    .post("/me/wallet/consent", consent.start)
    .post("/me/wallet/consent/complete", consent.complete);
}
