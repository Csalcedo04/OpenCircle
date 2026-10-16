import { createUnauthenticatedClient, type UnauthenticatedClient } from "@interledger/open-payments";

// Only the calls the services use, so tests can provide a small fake.
export interface OpenPaymentsPublicClient {
  walletAddress: Pick<UnauthenticatedClient["walletAddress"], "get">;
}

// Public (unsigned) client: wallet address discovery and public incoming payment data.
// The authenticated client (GNAP grants, quotes, outgoing payments) is added with the first flow that needs it.
export function createOpenPaymentsPublicClient(): Promise<UnauthenticatedClient> {
  return createUnauthenticatedClient({});
}
