import { Router } from "express";
import type { WalletAddressService } from "../services/open-payments/wallet-address.service";
import type { MemberService } from "../services/member.service";
import type { TestClockService } from "../services/test-clock.service";
import { circleRoutes } from "./circles";
import { healthRoutes } from "./health";
import { memberRoutes } from "./members";
import { testClockRoutes } from "./test-clocks";
import { userRoutes, type UserRouteServices } from "./users";
import { walletAddressRoutes } from "./wallet-addresses";

export interface Services extends UserRouteServices {
  walletAddresses: WalletAddressService;
  members: MemberService;
  /** Null unless TEST_CLOCKS_ENABLED: the routes are then not mounted at all. */
  testClocks: TestClockService | null;
}

export function apiRoutes(services: Services): Router {
  const router = Router()
    .use("/health", healthRoutes())
    .use("/users", userRoutes(services))
    .use("/circles", circleRoutes(services))
    .use("/members", memberRoutes(services.members))
    .use("/wallet-addresses", walletAddressRoutes(services.walletAddresses));
  if (services.testClocks) router.use("/test-clocks", testClockRoutes(services.testClocks));
  return router;
}
