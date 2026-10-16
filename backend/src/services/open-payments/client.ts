import type { KeyObject } from "node:crypto";
import {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  type AuthenticatedClient,
  type UnauthenticatedClient,
} from "@interledger/open-payments";

// Only the calls the services use, so tests can provide a small fake.
export interface OpenPaymentsPublicClient {
  walletAddress: Pick<UnauthenticatedClient["walletAddress"], "get">;
}

// Public (unsigned) client: wallet address discovery and public incoming payment data.
export function createOpenPaymentsPublicClient(): Promise<UnauthenticatedClient> {
  return createUnauthenticatedClient({});
}

// What the consent flow needs from the signed client.
export type OpenPaymentsGrantClient = Pick<AuthenticatedClient, "walletAddress" | "grant" | "token">;

// Signed client: OpenCircle identifies itself by its wallet address and signs with the key published there.
export function createOpenPaymentsAuthClient(args: {
  walletAddressUrl: string;
  keyId: string;
  privateKey: KeyObject;
}): Promise<AuthenticatedClient> {
  return createAuthenticatedClient(args);
}

// Test network only: never resolve or call wallets and auth servers outside it.
const ALLOWED_HOST_SUFFIXES = ["interledger-test.dev", "test.interledger.org", "rafiki.money"];

export function isAllowedOpenPaymentsUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return protocol === "https:" && ALLOWED_HOST_SUFFIXES.some((s) => hostname === s || hostname.endsWith(`.${s}`));
}
