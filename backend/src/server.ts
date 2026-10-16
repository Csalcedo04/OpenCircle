import { createApp } from "./app";
import { env } from "./config/env";
import { createDb } from "./db/client";
import { loadPrivateKey } from "./lib/client-key";
import { createOpenPaymentsAuthClient, createOpenPaymentsPublicClient } from "./lib/open-payments";
import { createTokenCipher } from "./lib/token-cipher";
import { createUserService } from "./services/user.service";
import { createWalletAddressService } from "./services/wallet-address.service";
import { createWalletConsentService } from "./services/wallet-consent.service";

async function main(): Promise<void> {
  const db = createDb(env.DATABASE_URL);
  const openPayments = await createOpenPaymentsPublicClient();
  const openPaymentsAuth = await createOpenPaymentsAuthClient({
    walletAddressUrl: env.OP_CLIENT_WALLET_ADDRESS,
    keyId: env.OP_KEY_ID,
    privateKey: loadPrivateKey(env.OP_PRIVATE_KEY),
  });
  const users = createUserService(db);

  const app = createApp({
    users,
    walletAddresses: createWalletAddressService(openPayments),
    walletConsent: createWalletConsentService({
      db,
      client: openPaymentsAuth,
      cipher: createTokenCipher(env.GRANT_TOKEN_KEY),
      users,
      frontendUrl: env.FRONTEND_URL,
    }),
  });

  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((err: unknown) => {
  console.error("Failed to start server", err instanceof Error ? err.message : err);
  process.exit(1);
});
