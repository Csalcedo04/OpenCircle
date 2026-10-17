import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  // Also read by @supabase/server to derive the JWKS used to verify user JWTs.
  SUPABASE_URL: z.url(),
  // Next app origin; the user's wallet redirects back here after consent.
  FRONTEND_URL: z.url(),
  // OpenCircle's identity as an Open Payments client: its wallet address and a key published there.
  OP_CLIENT_WALLET_ADDRESS: z.url({ protocol: /^https$/ }),
  OP_KEY_ID: z.string().min(1),
  // Base64 of the Ed25519 private key (see services/open-payments/client-key.ts).
  OP_PRIVATE_KEY: z.string().min(1),
  // Base64 of 32 random bytes; encrypts stored GNAP tokens (see services/open-payments/token-cipher.ts).
  GRANT_TOKEN_KEY: z.base64().refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64"),
  // Didit KYC: server-only API key and the KYC workflow to run.
  DIDIT_API_KEY: z.string().min(1),
  DIDIT_WORKFLOW_ID: z.uuid(),
  // Webhook destination's secret_shared_key; without it the webhook answers 503.
  DIDIT_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Shared with the scheduler that calls POST /api/internal/circles/tick (x-cron-secret).
  // Unset: the job answers 503. At least 32 characters.
  CRON_SECRET: z.string().min(32).optional(),
  // Dev only: Stripe-style test clocks for circles (/api/test-clocks). Never on in production.
  TEST_CLOCKS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Emails (invitations, applications, reminders) go through Resend when both are set;
  // otherwise they are only logged. EMAIL_FROM is a sender on a domain verified in Resend.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
}).refine((env) => (env.RESEND_API_KEY === undefined) === (env.EMAIL_FROM === undefined), {
  path: ["EMAIL_FROM"],
  message: "RESEND_API_KEY and EMAIL_FROM go together",
});

export type Env = z.infer<typeof envSchema>;
