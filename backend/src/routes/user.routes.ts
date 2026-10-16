import { Router } from "express";
import { createKycController } from "../controllers/kyc.controller";
import { createUserController } from "../controllers/user.controller";
import { createWalletConsentController } from "../controllers/wallet-consent.controller";
import { requireUser } from "../middleware/require-user";
import type { KycService } from "../services/kyc.service";
import type { UserService } from "../services/user.service";
import type { WalletConsentService } from "../services/wallet-consent.service";

export function userRoutes(users: UserService, walletConsent: WalletConsentService, kyc: KycService): Router {
  const controller = createUserController(users);
  const consent = createWalletConsentController(walletConsent);
  const kycController = createKycController(kyc);
  return Router()
    .use(requireUser)
    .get("/me", controller.getMe)
    .patch("/me", controller.updateMe)
    .post("/me/wallet/consent", consent.start)
    .post("/me/wallet/consent/complete", consent.complete)
    .get("/me/kyc", kycController.getMe)
    .post("/me/kyc/session", kycController.start);
}
