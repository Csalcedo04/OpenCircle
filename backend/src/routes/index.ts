import { Router } from "express";
import type { WalletAddressService } from "../services/open-payments/wallet-address.service";
import type { CircleTickService } from "../services/circles/circle-cycle";
import type { InviteService } from "../services/circles/invite.service";
import type { FriendService } from "../services/friend.service";
import type { InternalAccountService } from "../services/ledger/internal-account.service";
import type { MemberService } from "../services/member.service";
import type { TestClockService } from "../services/test-clock.service";
import { circleRoutes, type CircleRouteServices } from "./circles";
import { friendRoutes } from "./friends";
import { healthRoutes } from "./health";
import { internalAccountRoutes } from "./internal-accounts";
import { memberRoutes } from "./members";
import { testClockRoutes } from "./test-clocks";
import { userRoutes, type UserRouteServices } from "./users";
import { walletAddressRoutes } from "./wallet-addresses";

export interface Services extends UserRouteServices, CircleRouteServices {
  // Both route files take a slice of it; the app gets the whole service.
  invites: InviteService;
  friends: FriendService;
  walletAddresses: WalletAddressService;
  members: MemberService;
  /** The user's OpenCircle internal account (ledger). */
  internalAccounts: InternalAccountService;
  /** Null unless TEST_CLOCKS_ENABLED: the routes are then not mounted at all. */
  testClocks: TestClockService | null;
  /** Mounted by the app at /api/internal (scheduler only). */
  circleTick: Pick<CircleTickService, "run">;
}

export function apiRoutes(services: Services): Router {
  const router = Router()
    .use("/health", healthRoutes())
    // Before /users so the longer prefix wins.
    .use("/users/me/internal-account", internalAccountRoutes(services.internalAccounts))
    .use("/users", userRoutes(services))
    .use("/circles", circleRoutes(services))
    .use("/friends", friendRoutes(services.friends))
    .use("/members", memberRoutes(services.members))
    .use("/wallet-addresses", walletAddressRoutes(services.walletAddresses));
  if (services.testClocks) router.use("/test-clocks", testClockRoutes(services.testClocks));
  return router;
}
