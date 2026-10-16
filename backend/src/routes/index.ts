import { Router } from "express";
import type { UserService } from "../services/user.service";
import type { WalletAddressService } from "../services/wallet-address.service";
import type { WalletConsentService } from "../services/wallet-consent.service";
import { healthRoutes } from "./health.routes";
import { userRoutes } from "./user.routes";
import { walletAddressRoutes } from "./wallet-address.routes";

export interface Services {
  users: UserService;
  walletAddresses: WalletAddressService;
  walletConsent: WalletConsentService;
}

export function apiRoutes(services: Services): Router {
  return Router()
    .use("/health", healthRoutes())
    .use("/users", userRoutes(services.users, services.walletConsent))
    .use("/wallet-addresses", walletAddressRoutes(services.walletAddresses));
}
