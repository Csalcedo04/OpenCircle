import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

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

// cc: cédula de ciudadanía, ti: tarjeta de identidad, ce: cédula de extranjería, pp: pasaporte.
export const documentType = pgEnum("document_type", ["cc", "ti", "ce", "pp"]);

// `id` is the Supabase Auth user id (auth.users.id), so it has no default.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull().unique(),
    documentType: documentType("document_type").notNull(),
    documentNumber: text("document_number").notNull(),
    // ISO 3166-1 alpha-2 country code, e.g. "CO".
    nationality: varchar("nationality", { length: 2 }).notNull(),
    fullName: text("full_name"),
    phone: varchar("phone", { length: 256 }),
    dob: date("dob"),
    opWallet: uuid("op_wallet")
      .unique()
      .references(() => wallets.id),
  },
  (t) => [unique("users_document_unique").on(t.documentType, t.documentNumber)],
).enableRLS();

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

export type User = typeof users.$inferSelect;
