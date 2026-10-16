import { date, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  addressUrl: text("address_url").notNull().unique(),
  assetCode: text("asset_code").notNull(),
  assetScale: integer("asset_scale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// `id` is the Supabase Auth user id (auth.users.id), so it has no default.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name"),
  phone: varchar("phone", { length: 256 }),
  dob: date("dob"),
  opWallet: uuid("op_wallet").references(() => wallets.id),
});

export type User = typeof users.$inferSelect;
