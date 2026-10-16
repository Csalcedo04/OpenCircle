import { createUnauthenticatedClient, type UnauthenticatedClient } from "@interledger/open-payments";

export type OpenPaymentsPublicClient = Pick<UnauthenticatedClient, "walletAddress">;

// Public (unsigned) client: wallet address discovery and public incoming payment data.
// The authenticated client (GNAP grants, quotes, outgoing payments) is added with the first flow that needs it.
export function createOpenPaymentsPublicClient(): Promise<UnauthenticatedClient> {
  return createUnauthenticatedClient({});
}
