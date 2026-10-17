import {
  isFinalizedGrantWithAccessToken,
  OpenPaymentsClientError,
  type AuthenticatedClient,
  type OutgoingPayment,
} from "@interledger/open-payments";
import { isAllowedOpenPaymentsUrl } from "./client";

/** An amount in the asset's minor unit, as Open Payments carries it (integer string). */
export interface Amount {
  value: string;
  assetCode: string;
  assetScale: number;
}

/** A member's standing grant, already decrypted. */
export interface MemberAccess {
  walletAddressUrl: string;
  accessToken: string;
}

/** The wallet refused the request for good (4xx other than 401): retrying the same way won't help. */
export class PaymentRefusedError extends Error {
  constructor(
    readonly step: "quote" | "outgoing-payment",
    readonly status: number | undefined,
  ) {
    super(`Open Payments ${step} refused${status === undefined ? "" : ` (HTTP ${status})`}`);
    this.name = "PaymentRefusedError";
  }
}

/** The member's access token is expired or revoked (401): rotate it and retry once. */
export class AccessTokenExpiredError extends Error {
  constructor() {
    super("Open Payments access token expired");
    this.name = "AccessTokenExpiredError";
  }
}

/**
 * What the period engine needs from Open Payments to collect one contribution.
 * Server-only: it holds OpenCircle's signed client and members' access tokens.
 */
export interface ContributionPayments {
  /** An incoming payment on the pool wallet for exactly `amount`, tagged with the contribution key. */
  createIncomingPayment(args: { amount: Amount; key: string; expiresAt: Date }): Promise<{ url: string }>;
  /** The pool's own record of what arrived: the proof a contribution is paid. */
  readIncomingPayment(url: string): Promise<{ received: bigint; completed: boolean }>;
  /** Quote and outgoing payment on the member's wallet, paying the incoming payment. */
  payFromMember(access: MemberAccess, args: { incomingPaymentUrl: string; key: string }): Promise<{ quoteUrl: string; outgoingPaymentUrl: string }>;
  /** The member's outgoing payment carrying this contribution key, if one was created before. */
  findMemberPayment(access: MemberAccess, key: string): Promise<{ outgoingPaymentUrl: string } | null>;
  /** A new access token for a member's grant. The previous token and manage URI stop working. */
  rotateToken(args: { manageUri: string; accessToken: string }): Promise<{ accessToken: string; manageUri: string; expiresIn: number | null }>;
}

export type ContributionPaymentsClient = Pick<AuthenticatedClient, "walletAddress" | "grant" | "token" | "incomingPayment" | "quote" | "outgoingPayment">;

// Rafiki lists a wallet's outgoing payments in pages; a test wallet has few, so a bounded scan is enough.
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
// Re-request the pool's token a little before it expires.
const TOKEN_MARGIN_MS = 30_000;

const status = (err: unknown) => (err instanceof OpenPaymentsClientError ? err.status : undefined);

// 401: token problem (rotate). Other 4xx: the wallet said no. 5xx/network: transient, rethrown as is.
async function classify<T>(step: "quote" | "outgoing-payment", call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    const code = status(err);
    if (code === 401) throw new AccessTokenExpiredError();
    if (code !== undefined && code >= 400 && code < 500) throw new PaymentRefusedError(step, code);
    throw err;
  }
}

const contributionKey = (p: Pick<OutgoingPayment, "metadata">) => p.metadata?.["contributionKey"];

export function createContributionPayments({
  client,
  poolWalletAddressUrl,
  now = () => Date.now(),
}: {
  client: ContributionPaymentsClient;
  poolWalletAddressUrl: string;
  now?: () => number;
}): ContributionPayments {
  let poolToken: { value: string; expiresAt: number } | null = null;

  async function wallet(url: string) {
    if (!isAllowedOpenPaymentsUrl(url)) throw new Error("Wallet outside the Interledger test network");
    const w = await client.walletAddress.get({ url });
    if (!isAllowedOpenPaymentsUrl(w.authServer) || !isAllowedOpenPaymentsUrl(w.resourceServer)) {
      throw new Error("Wallet servers outside the Interledger test network");
    }
    return w;
  }

  // Non-interactive grant on OpenCircle's own wallet; kept in memory only, never stored.
  async function poolAccess() {
    const pool = await wallet(poolWalletAddressUrl);
    if (!poolToken || poolToken.expiresAt <= now()) {
      const grant = await client.grant.request(
        { url: pool.authServer },
        { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read"] }] } },
      );
      if (!isFinalizedGrantWithAccessToken(grant)) throw new Error("Pool wallet did not issue an incoming-payment token");
      const ttlMs = (grant.access_token.expires_in ?? 600) * 1000;
      poolToken = { value: grant.access_token.value, expiresAt: now() + ttlMs - TOKEN_MARGIN_MS };
    }
    return { pool, accessToken: poolToken.value };
  }

  return {
    async createIncomingPayment({ amount, key, expiresAt }) {
      const { pool, accessToken } = await poolAccess();
      const incoming = await client.incomingPayment.create(
        { url: pool.resourceServer, accessToken },
        { walletAddress: pool.id, incomingAmount: amount, expiresAt: expiresAt.toISOString(), metadata: { contributionKey: key } },
      );
      return { url: incoming.id };
    },

    async readIncomingPayment(url) {
      if (!isAllowedOpenPaymentsUrl(url)) throw new Error("Incoming payment outside the Interledger test network");
      const { accessToken } = await poolAccess();
      const incoming = await client.incomingPayment.get({ url, accessToken });
      return { received: BigInt(incoming.receivedAmount.value), completed: incoming.completed };
    },

    async payFromMember({ walletAddressUrl, accessToken }, { incomingPaymentUrl, key }) {
      const member = await wallet(walletAddressUrl);
      const quote = await classify("quote", () =>
        client.quote.create({ url: member.resourceServer, accessToken }, { method: "ilp", walletAddress: member.id, receiver: incomingPaymentUrl }),
      );
      const outgoing = await classify("outgoing-payment", () =>
        client.outgoingPayment.create(
          { url: member.resourceServer, accessToken },
          { walletAddress: member.id, quoteId: quote.id, metadata: { contributionKey: key } },
        ),
      );
      return { quoteUrl: quote.id, outgoingPaymentUrl: outgoing.id };
    },

    async findMemberPayment({ walletAddressUrl, accessToken }, key) {
      const member = await wallet(walletAddressUrl);
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await classify("outgoing-payment", () =>
          client.outgoingPayment.list(
            { url: member.resourceServer, walletAddress: member.id, accessToken },
            cursor === undefined
              ? { "wallet-address": member.id, first: PAGE_SIZE }
              : { "wallet-address": member.id, first: PAGE_SIZE, cursor },
          ),
        );
        const match = result.result.find((p) => contributionKey(p) === key);
        if (match) return { outgoingPaymentUrl: match.id };
        if (!result.pagination.hasNextPage || !result.pagination.endCursor) return null;
        cursor = result.pagination.endCursor;
      }
      return null;
    },

    async rotateToken({ manageUri, accessToken }) {
      const rotated = await client.token.rotate({ url: manageUri, accessToken });
      return {
        accessToken: rotated.access_token.value,
        manageUri: rotated.access_token.manage,
        expiresIn: rotated.access_token.expires_in ?? null,
      };
    },
  };
}
