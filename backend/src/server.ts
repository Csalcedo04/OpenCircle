import { createApp } from "./app";
import { env } from "./config/env";
import { createDb } from "./db/client";
import { createCircleService } from "./services/circle.service";
import { createApplicationNotices } from "./services/circles/application-notices";
import { createApplicationService } from "./services/circles/application.service";
import { createCircleCycle, createCircleTick } from "./services/circles/circle-cycle";
import { createReminders } from "./services/circles/reminders.service";
import { createScoring } from "./services/circles/scoring.service";
import { createLogSender } from "./services/notifications/sender";
import { createMemberService } from "./services/member.service";
import { createMemberAccess } from "./services/circles/member-access";
import { createPeriodEngine } from "./services/circles/period-engine";
import { createDiditClient } from "./services/didit/client";
import { createKycService } from "./services/kyc.service";
import { loadPrivateKey } from "./services/open-payments/client-key";
import { createOpenPaymentsAuthClient, createOpenPaymentsPublicClient } from "./services/open-payments/client";
import { createContributionPayments } from "./services/open-payments/payments";
import { createTokenCipher } from "./services/open-payments/token-cipher";
import { createWalletAddressService } from "./services/open-payments/wallet-address.service";
import { createTestClockService } from "./services/test-clock.service";
import { createUserService } from "./services/user.service";
import { createWalletConsentService } from "./services/wallet-consent.service";
import { createWalletService } from "./services/wallet.service";
import { createAccountService } from "./services/account.service";

async function main(): Promise<void> {
  const db = createDb(env.DATABASE_URL);
  const openPayments = await createOpenPaymentsPublicClient();
  const openPaymentsAuth = await createOpenPaymentsAuthClient({
    walletAddressUrl: env.OP_CLIENT_WALLET_ADDRESS,
    keyId: env.OP_KEY_ID,
    privateKey: loadPrivateKey(env.OP_PRIVATE_KEY),
  });

  const users = createUserService(db);
  const walletAddresses = createWalletAddressService(openPayments);
  const cipher = createTokenCipher(env.GRANT_TOKEN_KEY);

  // Contributions: the pool (OpenCircle's wallet) charges each member through their standing grant.
  const payments = createContributionPayments({ client: openPaymentsAuth, poolWalletAddressUrl: env.OP_CLIENT_WALLET_ADDRESS });
  const engine = createPeriodEngine({ db, payments, memberAccess: createMemberAccess({ db, cipher, payments }) });
  // Real providers (email, WhatsApp) come later; until then notifications are only logged.
  const sender = createLogSender();
  const notices = createApplicationNotices({ db, sender });
  // Periods, then scores (ICS), then payment reminders. The scheduler runs it for real-time
  // circles (POST /api/internal/circles/tick); test clocks run it for theirs.
  const cycle = createCircleCycle({
    engine,
    scoring: createScoring({ db }),
    reminders: createReminders({ db, sender }),
  });
  const testClocks = env.TEST_CLOCKS_ENABLED ? createTestClockService({ db, engine: cycle }) : null;
  const circles = createCircleService({
    db,
    // Every pot is OpenCircle's own wallet for now; circles are told apart in the database.
    resolvePoolWallet: () => walletAddresses.getByUrl(env.OP_CLIENT_WALLET_ADDRESS),
    testClocksEnabled: testClocks !== null,
    frontendUrl: env.FRONTEND_URL,
    ...(testClocks ? { onStarted: testClocks.runCircle } : {}),
  });

  const app = createApp(
    {
      users,
      wallets: createWalletService(db),
      account: createAccountService({ db }),
      walletAddresses,
      walletConsent: createWalletConsentService({
        db,
        client: openPaymentsAuth,
        cipher,
        users,
        frontendUrl: env.FRONTEND_URL,
      }),
      circles,
      applications: createApplicationService({ db, circles, notices }),
      members: createMemberService({ db, circles }),
      testClocks,
      circleTick: createCircleTick({ db, cycle, notices }),
      kyc: createKycService({
        db,
        didit: createDiditClient({ apiKey: env.DIDIT_API_KEY, workflowId: env.DIDIT_WORKFLOW_ID }),
        frontendUrl: env.FRONTEND_URL,
      }),
    },
    { diditWebhookSecret: env.DIDIT_WEBHOOK_SECRET, cronSecret: env.CRON_SECRET },
  );

  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((err: unknown) => {
  console.error("Failed to start server", err instanceof Error ? err.message : err);
  process.exit(1);
});
