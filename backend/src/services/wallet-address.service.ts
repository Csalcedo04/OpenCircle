import type { OpenPaymentsPublicClient } from "../lib/open-payments";

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
      const wallet = await client.walletAddress.get({ url });
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
