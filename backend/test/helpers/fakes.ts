import { OpenPaymentsClientError } from "@interledger/open-payments";
import type { OpenPaymentsPublicClient } from "../../src/services/open-payments/client";
import { PaymentRefusedError, type ContributionPayments } from "../../src/services/open-payments/payments";
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
    members: { get: notUsed },
    circles: {
      get: notUsed,
      list: notUsed,
      listForUser: notUsed,
      create: notUsed,
      join: notUsed,
      takeSeat: notUsed,
      afterStarted: notUsed,
      setVisibility: notUsed,
      rotateInviteCode: notUsed,
      summariesOf: notUsed,
      visibleIds: notUsed,
    },
    applications: { apply: notUsed, list: notUsed, vote: notUsed, setApprovers: notUsed },
    invites: { create: notUsed, list: notUsed, revoke: notUsed, listMine: notUsed },
    friends: { list: notUsed, requests: notUsed, request: notUsed, accept: notUsed, cancel: notUsed, remove: notUsed },
    circleTick: { run: notUsed },
    testClocks: null,
    ...overrides,
  };
}

export interface FakePayments extends ContributionPayments {
  /** Every outgoing payment created, in order (key = contribution idempotency key). */
  outgoing: { key: string; walletAddressUrl: string; incomingPaymentUrl: string }[];
  incoming: Map<string, { key: string; value: bigint; received: bigint }>;
  /** Marks every paid incoming payment as received (for `settle: "later"`). */
  settleAll(): void;
}

/**
 * In-memory Open Payments for the period engine:
 *   settle "now"   → a payment is received as soon as it is sent
 *   settle "later" → received only after settleAll()
 *   refuse         → member wallets whose quote is refused (PaymentRefusedError)
 *   loseResponses  → how many outgoing payments are created but their response is lost
 */
export function fakePayments(
  options: { settle?: "now" | "later"; refuse?: Set<string>; loseResponses?: number } = {},
): FakePayments {
  const settle = options.settle ?? "now";
  const outgoing: FakePayments["outgoing"] = [];
  const incoming: FakePayments["incoming"] = new Map();
  const paid = new Set<string>();
  let n = 0;
  let toLose = options.loseResponses ?? 0;

  return {
    outgoing,
    incoming,
    settleAll() {
      for (const url of paid) {
        const ip = incoming.get(url);
        if (ip) ip.received = ip.value;
      }
    },
    async createIncomingPayment({ amount, key }) {
      const url = `https://${TEST_WALLET_HOST}/pool/incoming-payments/${++n}`;
      incoming.set(url, { key, value: BigInt(amount.value), received: 0n });
      return { url };
    },
    async readIncomingPayment(url) {
      const ip = incoming.get(url);
      if (!ip) throw new OpenPaymentsClientError("Not found", { description: "Not found", status: 404 });
      return { received: ip.received, completed: ip.received >= ip.value };
    },
    async payFromMember({ walletAddressUrl }, { incomingPaymentUrl, key }) {
      if (options.refuse?.has(walletAddressUrl)) throw new PaymentRefusedError("quote", 400);
      outgoing.push({ key, walletAddressUrl, incomingPaymentUrl });
      paid.add(incomingPaymentUrl);
      if (settle === "now") this.settleAll();
      if (toLose > 0) {
        toLose--;
        throw new Error("network: response lost");
      }
      return { quoteUrl: `https://${TEST_WALLET_HOST}/quotes/${++n}`, outgoingPaymentUrl: `https://${TEST_WALLET_HOST}/outgoing-payments/${outgoing.length}` };
    },
    async findMemberPayment(_access, key) {
      const i = outgoing.findIndex((p) => p.key === key);
      return i === -1 ? null : { outgoingPaymentUrl: `https://${TEST_WALLET_HOST}/outgoing-payments/${i + 1}` };
    },
    async rotateToken() {
      return { accessToken: "rotated", manageUri: `https://auth.${TEST_WALLET_HOST}/token/rotated`, expiresIn: 600 };
    },
  };
}
