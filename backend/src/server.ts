import { createApp } from "./app";
import { env } from "./config/env";
import { createDb } from "./db/client";
import { createDiditClient } from "./services/didit/client";
import { createKycService } from "./services/kyc.service";
import { loadPrivateKey } from "./services/open-payments/client-key";
import { createOpenPaymentsAuthClient, createOpenPaymentsPublicClient } from "./services/open-payments/client";
import { createTokenCipher } from "./services/open-payments/token-cipher";
import { createWalletAddressService } from "./services/open-payments/wallet-address.service";
import { createUserService } from "./services/user.service";
import { createWalletConsentService } from "./services/wallet-consent.service";
import { createWalletService } from "./services/wallet.service";

async function main(): Promise<void> {
  const db = createDb(env.DATABASE_URL);
  const openPayments = await createOpenPaymentsPublicClient();
  const openPaymentsAuth = await createOpenPaymentsAuthClient({
    walletAddressUrl: env.OP_CLIENT_WALLET_ADDRESS,
    keyId: env.OP_KEY_ID,
    privateKey: loadPrivateKey(env.OP_PRIVATE_KEY),
  });

  const users = createUserService(db);
  const app = createApp(
    {
      users,
      wallets: createWalletService(db),
      walletAddresses: createWalletAddressService(openPayments),
      walletConsent: createWalletConsentService({
        db,
        client: openPaymentsAuth,
        cipher: createTokenCipher(env.GRANT_TOKEN_KEY),
        users,
        frontendUrl: env.FRONTEND_URL,
      }),
      kyc: createKycService({
        db,
        didit: createDiditClient({ apiKey: env.DIDIT_API_KEY, workflowId: env.DIDIT_WORKFLOW_ID }),
        frontendUrl: env.FRONTEND_URL,
      }),
    },
    { diditWebhookSecret: env.DIDIT_WEBHOOK_SECRET },
  );

  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((err: unknown) => {
  console.error("Failed to start server", err instanceof Error ? err.message : err);
  process.exit(1);
});
