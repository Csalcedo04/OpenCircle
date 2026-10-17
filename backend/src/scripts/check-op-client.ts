/**
 * Checks OpenCircle's Open Payments client identity without printing secrets:
 * the wallet address resolves, it publishes OP_KEY_ID in its jwks.json, and
 * OP_PRIVATE_KEY is the private half of that published key. With DATABASE_URL set, also
 * whether payouts are authorized: the pool wallet's owner linked it and approved the grant.
 *
 *   npm run op:check
 */
import { createPublicKey } from "node:crypto";
import { z } from "zod";
import { createDb } from "../db/client";
import { hasPoolGrant } from "../services/circles/pool-access";
import { loadPrivateKey } from "../services/open-payments/client-key";

const jwksSchema = z.object({ keys: z.array(z.object({ kid: z.string(), x: z.string().optional() })) });

async function main(): Promise<boolean> {
  const env = z
    .object({
      OP_CLIENT_WALLET_ADDRESS: z
        .url({ protocol: /^https$/, error: "Use the https:// form of the wallet address" })
        .refine((url) => !url.includes("$"), "Drop the $: $ilp.example/x is written https://ilp.example/x"),
      OP_KEY_ID: z.string().min(1),
      OP_PRIVATE_KEY: z.string().min(1),
    })
    .safeParse(process.env);
  if (!env.success) {
    for (const issue of env.error.issues) console.log(`✗ ${issue.path.join(".")}: ${issue.message}`);
    return false;
  }
  const { OP_CLIENT_WALLET_ADDRESS: wallet, OP_KEY_ID: keyId, OP_PRIVATE_KEY: privateKey } = env.data;
  console.log(`Wallet address: ${wallet}`);

  let publicX: string | undefined;
  try {
    publicX = createPublicKey(loadPrivateKey(privateKey)).export({ format: "jwk" }).x;
    console.log("✓ OP_PRIVATE_KEY decodes to an Ed25519 key");
  } catch (err) {
    console.log(`✗ OP_PRIVATE_KEY: ${err instanceof Error ? err.message : "could not be decoded"}`);
    return false;
  }

  const res = await fetch(`${wallet.replace(/\/$/, "")}/jwks.json`);
  if (!res.ok) {
    console.log(`✗ ${wallet}/jwks.json returned HTTP ${res.status}`);
    return false;
  }
  const { keys } = jwksSchema.parse(await res.json());
  console.log(`Published key IDs: ${keys.map((k) => k.kid).join(", ") || "(none)"}`);

  const published = keys.find((k) => k.kid === keyId);
  if (!published) {
    console.log("✗ OP_KEY_ID is not published by this wallet address (key generated on another wallet?)");
    return false;
  }
  console.log("✓ OP_KEY_ID is published by this wallet address");

  if (published.x !== publicX) {
    console.log("✗ OP_PRIVATE_KEY does not match the published key for OP_KEY_ID");
    return false;
  }
  console.log("✓ OP_PRIVATE_KEY matches the published key");

  if (process.env.DATABASE_URL) await checkPoolGrant(process.env.DATABASE_URL, wallet);
  return true;
}

// Contributions work without it; payouts to members need it.
async function checkPoolGrant(databaseUrl: string, wallet: string): Promise<void> {
  const db = createDb(databaseUrl);
  try {
    if (await hasPoolGrant(db, wallet)) {
      console.log("✓ Payouts authorized: the pool wallet's owner has an active grant on it");
    } else {
      console.log("! Payouts not authorized yet: sign in to OpenCircle with the account that owns this wallet,");
      console.log("  link it as their wallet and approve the grant in the wallet");
    }
  } finally {
    await db.$client.end();
  }
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (err: unknown) => {
    console.log(`✗ ${err instanceof Error ? err.message : "check failed"}`);
    process.exit(1);
  },
);
