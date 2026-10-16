import { Router } from "express";
import type { UserService } from "../services/user.service";
import type { WalletAddressService } from "../services/wallet-address.service";
import { healthRoutes } from "./health.routes";
import { userRoutes } from "./user.routes";
import { walletAddressRoutes } from "./wallet-address.routes";

export interface Services {
  users: UserService;
  walletAddresses: WalletAddressService;
}

export function apiRoutes(services: Services): Router {
  return Router()
    .use("/health", healthRoutes())
    .use("/users", userRoutes(services.users, services.walletAddresses))
    .use("/wallet-addresses", walletAddressRoutes(services.walletAddresses));
}
