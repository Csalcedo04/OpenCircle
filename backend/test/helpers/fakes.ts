import { OpenPaymentsClientError } from "@interledger/open-payments";
import type { OpenPaymentsPublicClient } from "../../src/services/open-payments/client";
import type { Services } from "../../src/routes";

// Reserved host for test wallets; the integration suite deletes every wallet under it.
export const TEST_WALLET_HOST = "wallet.test";

// Fake Open Payments wallet discovery:
//   https://wallet.test/missing-*  → 404 from the wallet server
//   https://wallet.test/down-*     → 500 from the wallet server
//   other https://wallet.test/*    → USD wallet, scale 2, id = the requested URL
export function fakeOpenPayments(): OpenPaymentsPublicClient {
  return {
    walletAddress: {
      async get({ url }) {
        const { hostname, pathname } = new URL(url);
        if (hostname !== TEST_WALLET_HOST || pathname.startsWith("/missing")) {
          throw new OpenPaymentsClientError("Could not get wallet address", { description: "Not found", status: 404 });
        }
        if (pathname.startsWith("/down")) {
          throw new OpenPaymentsClientError("Could not get wallet address", { description: "Server error", status: 500 });
        }
        return {
          id: url,
          publicName: "Test wallet",
          assetCode: "USD",
          assetScale: 2,
          authServer: `https://auth.${TEST_WALLET_HOST}`,
          resourceServer: `https://${TEST_WALLET_HOST}`,
        };
      },
    },
  };
}

const notUsed = (): never => {
  throw new Error("not used in this test");
};

// Services for tests that never reach the database.
export function fakeServices(overrides: Partial<Services> = {}): Services {
  return {
    users: { getProfile: notUsed, getPublicProfile: notUsed, createProfile: notUsed, updateProfile: notUsed },
    wallets: { getSavings: notUsed },
    walletAddresses: { getByUrl: notUsed },
    walletConsent: { start: notUsed, complete: notUsed },
    kyc: { getStatus: notUsed, startSession: notUsed, handleWebhook: notUsed },
    circles: { get: notUsed, list: notUsed, listForUser: notUsed, create: notUsed },
    applications: { apply: notUsed, list: notUsed, vote: notUsed, setApprovers: notUsed },
    ...overrides,
  };
}
