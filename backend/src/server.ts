import { createApp } from "./app";
import { env } from "./config/env";
import { createDb } from "./db/client";
import { createOpenPaymentsPublicClient } from "./services/open-payments/client";
import { createUserService } from "./services/user.service";
import { createWalletAddressService } from "./services/open-payments/wallet-address.service";
import { createWalletService } from "./services/wallet.service";

async function main(): Promise<void> {
  const db = createDb(env.DATABASE_URL);
  const openPayments = await createOpenPaymentsPublicClient();

  const walletAddresses = createWalletAddressService(openPayments);

  const app = createApp({
    users: createUserService(db),
    wallets: createWalletService(db, walletAddresses),
    walletAddresses,
  });

  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((err: unknown) => {
  console.error("Failed to start server", err instanceof Error ? err.message : err);
  process.exit(1);
});
