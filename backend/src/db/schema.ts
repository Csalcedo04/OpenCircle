import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Every table enables RLS with no policies: the Supabase Data API (anon/authenticated)
// gets no access, while the backend connects as the table owner and is unaffected.

// Open Payments wallet address. Its asset (code + scale) is the unit of every amount
// stored in the tables keyed by `wallet_id`.
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addressUrl: text("address_url").notNull().unique(),
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("wallets_asset_scale_range", sql`${t.assetScale} between 0 and 255`)],
).enableRLS();

// `id` is the Supabase Auth user id (auth.users.id), so it has no default.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name"),
  phone: varchar("phone", { length: 256 }),
  dob: date("dob"),
  opWallet: uuid("op_wallet")
    .unique()
    .references(() => wallets.id),
}).enableRLS();

// Amounts are integers in the wallet asset's minor unit (see wallets.asset_scale).
export const walletBalances = pgTable(
  "wallet_balances",
  {
    walletId: uuid("wallet_id")
      .primaryKey()
      .references(() => wallets.id, { onDelete: "cascade" }),
    balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("wallet_balances_balance_non_negative", sql`${t.balance} >= 0`)],
).enableRLS();

export const creditProfiles = pgTable(
  "credit_profiles",
  {
    walletId: uuid("wallet_id")
      .primaryKey()
      .references(() => wallets.id, { onDelete: "cascade" }),
    // Fraction between 0 and 1 (percentage); exact decimal, returned as string by Drizzle.
    internalCreditScore: numeric("internal_credit_score", { precision: 5, scale: 4 }).notNull(),
    // Maximum debt the user may take, in the wallet asset's minor unit.
    borrowingCapacity: bigint("borrowing_capacity", { mode: "bigint" }).notNull().default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("credit_profiles_score_range", sql`${t.internalCreditScore} between 0 and 1`),
    check("credit_profiles_borrowing_capacity_non_negative", sql`${t.borrowingCapacity} >= 0`),
  ],
).enableRLS();

// Append-only log of state changes. Never store PII, tokens, keys or raw webhook payloads here.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // No cascade: deleting a wallet must not erase its audit history.
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    eventType: text("event_type").notNull(),
    // Source event id (e.g. Rafiki webhook id); unique so a retried event is applied once.
    externalId: text("external_id").unique(),
    // Signed delta in the wallet asset's minor unit; null for events that move no funds.
    amount: bigint("amount", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_wallet_id_created_at_idx").on(t.walletId, t.createdAt)],
).enableRLS();

// One interactive GNAP grant request in flight. `state` ties the wallet's redirect back
// to this row; client nonce + finish nonce + grant endpoint verify the redirect `hash`.
// Single use, short expiry.
export const consentChallenges = pgTable(
  "consent_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    state: text("state").notNull().unique(),
    walletAddressUrl: text("wallet_address_url").notNull(),
    grantEndpoint: text("grant_endpoint").notNull(),
    clientNonce: text("client_nonce").notNull(),
    finishNonce: text("finish_nonce").notNull(),
    continueUri: text("continue_uri").notNull(),
    // Encrypted with GRANT_TOKEN_KEY.
    continueTokenCiphertext: text("continue_token_ciphertext").notNull(),
    status: text("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("consent_challenges_user_id_idx").on(t.userId),
    check("consent_challenges_status", sql`${t.status} in ('PENDING', 'COMPLETED', 'CANCELLED')`),
  ],
).enableRLS();

// Standing outgoing-payment + quote grant a user gave OpenCircle on their wallet.
export const walletGrants = pgTable(
  "wallet_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    // Encrypted with GRANT_TOKEN_KEY.
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    // Token management URI: rotate or revoke the access token.
    manageUri: text("manage_uri").notNull(),
    // Grant continuation URI: cancel the whole grant.
    continueUri: text("continue_uri").notNull(),
    // Null when the authorization server gave no expiry.
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("wallet_grants_user_id_idx").on(t.userId),
    check("wallet_grants_status", sql`${t.status} in ('ACTIVE', 'REVOKED')`),
  ],
).enableRLS();

// One Didit KYC session per row. Only the status is kept: Didit's decision carries
// names, document data and images, which never leave Didit.
export const kycVerifications = pgTable(
  "kyc_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: uuid("session_id").notNull().unique(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("kyc_verifications_user_id_created_at_idx").on(t.userId, t.createdAt)],
).enableRLS();

export type User = typeof users.$inferSelect;
