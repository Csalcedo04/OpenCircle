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

/** What a payout's outgoing payment from the pool says it delivers (in the member's asset). */
export interface SentPayout {
  quoteUrl: string | null;
  outgoingPaymentUrl: string;
  receiveAmount: Amount;
}

/**
 * What payouts need from Open Payments: money from the pool wallet to a member's wallet.
 * Fixed debit: exactly the payout leaves the pool, and the member's wallet receives it in
 * its own asset. Server-only: it holds OpenCircle's signed client and the pool's token.
 */
export interface PayoutPayments {
  /** An incoming payment with no fixed amount on the member's wallet, tagged with the payout key. */
  createMemberIncomingPayment(walletAddressUrl: string, args: { key: string; expiresAt: Date }): Promise<{ url: string }>;
  /** What the member's wallet received on it: the proof a payout arrived. */
  readMemberIncomingPayment(walletAddressUrl: string, url: string): Promise<{ received: Amount }>;
  /** Closes it once paid; a fixed-debit payment doesn't complete it by itself. */
  completeMemberIncomingPayment(walletAddressUrl: string, url: string): Promise<void>;
  /** Fixed-debit quote and outgoing payment on the pool wallet, paying the member's incoming payment. */
  payFromPool(access: MemberAccess, args: { incomingPaymentUrl: string; key: string; debitAmount: Amount }): Promise<SentPayout>;
  /** The pool's outgoing payment carrying this payout key, if one was created before. */
  findPoolPayment(access: MemberAccess, key: string): Promise<SentPayout | null>;
  /** Whether the pool's outgoing payment gave up: then the payout will never arrive. */
  readPoolPayment(access: MemberAccess, url: string): Promise<{ failed: boolean }>;
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

type MetadataField = "contributionKey" | "payoutKey";

async function resolveWallet(client: Pick<ContributionPaymentsClient, "walletAddress">, url: string) {
  if (!isAllowedOpenPaymentsUrl(url)) throw new Error("Wallet outside the Interledger test network");
  const w = await client.walletAddress.get({ url });
  if (!isAllowedOpenPaymentsUrl(w.authServer) || !isAllowedOpenPaymentsUrl(w.resourceServer)) {
    throw new Error("Wallet servers outside the Interledger test network");
  }
  return w;
}

// The wallet's outgoing payment tagged `field: key`, scanning a bounded number of pages.
async function findOutgoingPayment(
  client: ContributionPaymentsClient,
  { walletAddressUrl, accessToken }: MemberAccess,
  field: MetadataField,
  key: string,
): Promise<OutgoingPayment | null> {
  const owner = await resolveWallet(client, walletAddressUrl);
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await classify("outgoing-payment", () =>
      client.outgoingPayment.list(
        { url: owner.resourceServer, walletAddress: owner.id, accessToken },
        cursor === undefined ? { "wallet-address": owner.id, first: PAGE_SIZE } : { "wallet-address": owner.id, first: PAGE_SIZE, cursor },
      ),
    );
    const match = result.result.find((p) => p.metadata?.[field] === key);
    if (match) return match;
    if (!result.pagination.hasNextPage || !result.pagination.endCursor) return null;
    cursor = result.pagination.endCursor;
  }
  return null;
}

const sentPayout = (p: OutgoingPayment): SentPayout => ({ quoteUrl: p.quoteId ?? null, outgoingPaymentUrl: p.id, receiveAmount: p.receiveAmount });

export function createPayoutPayments({ client, now = () => Date.now() }: { client: ContributionPaymentsClient; now?: () => number }): PayoutPayments {
  // Non-interactive incoming-payment tokens, one per member authorization server; memory only.
  const tokens = new Map<string, { value: string; expiresAt: number }>();

  async function memberAccess(walletAddressUrl: string) {
    const member = await resolveWallet(client, walletAddressUrl);
    const cached = tokens.get(member.authServer);
    if (cached && cached.expiresAt > now()) return { member, accessToken: cached.value };
    const grant = await client.grant.request(
      { url: member.authServer },
      { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
    );
    if (!isFinalizedGrantWithAccessToken(grant)) throw new Error("Member wallet did not issue an incoming-payment token");
    const ttlMs = (grant.access_token.expires_in ?? 600) * 1000;
    tokens.set(member.authServer, { value: grant.access_token.value, expiresAt: now() + ttlMs - TOKEN_MARGIN_MS });
    return { member, accessToken: grant.access_token.value };
  }

  function checkUrl(url: string): void {
    if (!isAllowedOpenPaymentsUrl(url)) throw new Error("Payment outside the Interledger test network");
  }

  return {
    async createMemberIncomingPayment(walletAddressUrl, { key, expiresAt }) {
      const { member, accessToken } = await memberAccess(walletAddressUrl);
      const incoming = await client.incomingPayment.create(
        { url: member.resourceServer, accessToken },
        { walletAddress: member.id, expiresAt: expiresAt.toISOString(), metadata: { payoutKey: key } },
      );
      return { url: incoming.id };
    },

    async readMemberIncomingPayment(walletAddressUrl, url) {
      checkUrl(url);
      const { accessToken } = await memberAccess(walletAddressUrl);
      const incoming = await client.incomingPayment.get({ url, accessToken });
      return { received: incoming.receivedAmount };
    },

    async completeMemberIncomingPayment(walletAddressUrl, url) {
      checkUrl(url);
      const { accessToken } = await memberAccess(walletAddressUrl);
      await client.incomingPayment.complete({ url, accessToken });
    },

    async payFromPool({ walletAddressUrl, accessToken }, { incomingPaymentUrl, key, debitAmount }) {
      checkUrl(incomingPaymentUrl);
      const pool = await resolveWallet(client, walletAddressUrl);
      const quote = await classify("quote", () =>
        client.quote.create(
          { url: pool.resourceServer, accessToken },
          { method: "ilp", walletAddress: pool.id, receiver: incomingPaymentUrl, debitAmount },
        ),
      );
      const outgoing = await classify("outgoing-payment", () =>
        client.outgoingPayment.create(
          { url: pool.resourceServer, accessToken },
          { walletAddress: pool.id, quoteId: quote.id, metadata: { payoutKey: key } },
        ),
      );
      return { ...sentPayout(outgoing), quoteUrl: quote.id };
    },

    async findPoolPayment(access, key) {
      const found = await findOutgoingPayment(client, access, "payoutKey", key);
      return found && sentPayout(found);
    },

    async readPoolPayment({ accessToken }, url) {
      checkUrl(url);
      const outgoing = await classify("outgoing-payment", () => client.outgoingPayment.get({ url, accessToken }));
      return { failed: outgoing.failed ?? false };
    },
  };
}

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
  const wallet = (url: string) => resolveWallet(client, url);

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

    async findMemberPayment(access, key) {
      const found = await findOutgoingPayment(client, access, "contributionKey", key);
      return found && { outgoingPaymentUrl: found.id };
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
