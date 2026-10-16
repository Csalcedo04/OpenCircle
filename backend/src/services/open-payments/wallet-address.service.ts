import { OpenPaymentsClientError } from "@interledger/open-payments";
import { AppError } from "../../errors/app-error";
import type { OpenPaymentsPublicClient } from "./client";

export interface WalletAddressDto {
  id: string;
  publicName: string | null;
  assetCode: string;
  assetScale: number;
  authServer: string;
  resourceServer: string;
}

export function createWalletAddressService(client: OpenPaymentsPublicClient) {
  return {
    async getByUrl(url: string): Promise<WalletAddressDto> {
      let wallet;
      try {
        wallet = await client.walletAddress.get({ url });
      } catch (err) {
        if (err instanceof OpenPaymentsClientError && err.status === 404) {
          throw new AppError(404, "WALLET_ADDRESS_NOT_FOUND", "Wallet address not found");
        }
        throw err;
      }
      return {
        id: wallet.id,
        publicName: wallet.publicName ?? null,
        assetCode: wallet.assetCode,
        assetScale: wallet.assetScale,
        authServer: wallet.authServer,
        resourceServer: wallet.resourceServer,
      };
    },
  };
}

export type WalletAddressService = ReturnType<typeof createWalletAddressService>;
