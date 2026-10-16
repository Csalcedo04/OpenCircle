/**
 * Seeds fictitious users for local development and demos. Idempotent: fixed ids and
 * `on conflict do nothing`, so running it again changes nothing.
 *
 * Only `public.users` rows are created, not Supabase Auth accounts: these users show up
 * in circles and public profiles but cannot sign in.
 *
 *   npm run db:seed
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "../db/schema";
import { auditEvents, creditProfiles, users, walletBalances, wallets } from "../db/schema";
import type { DocumentType } from "../services/user.service";

interface SeedWallet {
  id: string;
  addressUrl: string;
  // Payment-reliability fraction, 0..1 with at most 4 decimals.
  score: number;
  // Minor units of COP (scale 2).
  borrowingCapacity: bigint;
}

interface SeedUser {
  id: string;
  email: string;
  documentType: DocumentType;
  documentNumber: string;
  fullName: string;
  phone: string;
  dob: string;
  wallet: SeedWallet | null;
}

const seedWallet = (n: number, slug: string, score: number, borrowingCapacity: bigint): SeedWallet => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
  addressUrl: `https://ilp.interledger-test.dev/oc-seed-${slug}`,
  score,
  borrowingCapacity,
});

const SEED_USERS: SeedUser[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "seed-ana@example.test",
    documentType: "cc",
    documentNumber: "1000000001",
    fullName: "Ana Gómez",
    phone: "+573000000001",
    dob: "1994-03-12",
    wallet: seedWallet(1, "ana", 0.92, 150_000_000n),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "seed-carlos@example.test",
    documentType: "cc",
    documentNumber: "1000000002",
    fullName: "Carlos Restrepo",
    phone: "+573000000002",
    dob: "1988-07-25",
    wallet: seedWallet(2, "carlos", 0.75, 80_000_000n),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "seed-lucia@example.test",
    documentType: "ce",
    documentNumber: "1000000003",
    fullName: "Lucía Pérez",
    phone: "+573000000003",
    dob: "1999-11-02",
    wallet: seedWallet(3, "lucia", 0.48, 20_000_000n),
  },
  // Onboarded but without a linked wallet yet.
  {
    id: "00000000-0000-4000-8000-000000000004",
    email: "seed-mateo@example.test",
    documentType: "cc",
    documentNumber: "1000000004",
    fullName: "Mateo Ríos",
    phone: "+573000000004",
    dob: "2001-01-30",
    wallet: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    email: "seed-valentina@example.test",
    documentType: "pp",
    documentNumber: "1000000005",
    fullName: "Valentina Torres",
    phone: "+573000000005",
    dob: "1996-09-18",
    wallet: null,
  },
];

async function main(): Promise<void> {
  const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);
  // Disable prefetch as it is not supported for "Transaction" pool mode
  const client = postgres(DATABASE_URL, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    await db.transaction(async (tx) => {
      for (const { wallet, ...user } of SEED_USERS) {
        if (wallet) {
          await tx
            .insert(wallets)
            .values({ id: wallet.id, addressUrl: wallet.addressUrl, assetCode: "COP", assetScale: 2 })
            .onConflictDoNothing();
          await tx.insert(walletBalances).values({ walletId: wallet.id }).onConflictDoNothing();
          await tx
            .insert(creditProfiles)
            .values({ walletId: wallet.id, internalCreditScore: wallet.score, borrowingCapacity: wallet.borrowingCapacity })
            .onConflictDoNothing();
        }

        const inserted = await tx
          .insert(users)
          .values({ ...user, nationality: "CO", opWallet: wallet?.id ?? null })
          .onConflictDoNothing()
          .returning({ id: users.id });

        if (wallet) {
          await tx
            .insert(auditEvents)
            .values({ walletId: wallet.id, eventType: "wallet.linked", externalId: `seed:wallet.linked:${wallet.id}` })
            .onConflictDoNothing();
        }
        console.log(`${inserted.length > 0 ? "✓ created" : "· exists "} ${user.email}`);
      }
    });
  } finally {
    await client.end();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.log(`✗ ${err instanceof Error ? err.message : "seed failed"}`);
    process.exit(1);
  },
);
