import { Router } from "express";
import type { WalletAddressService } from "../services/open-payments/wallet-address.service";
import { circleRoutes } from "./circles";
import { healthRoutes } from "./health";
import { userRoutes, type UserRouteServices } from "./users";
import { walletAddressRoutes } from "./wallet-addresses";

export interface Services extends UserRouteServices {
  walletAddresses: WalletAddressService;
}

export function apiRoutes(services: Services): Router {
  return Router()
    .use("/health", healthRoutes())
    .use("/users", userRoutes(services))
    .use("/circles", circleRoutes(services))
    .use("/wallet-addresses", walletAddressRoutes(services.walletAddresses));
}
