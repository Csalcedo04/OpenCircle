-- Idempotent, like 0008 and 0011: safe to re-run on the shared database. Internal accounts and ledger.
-- Only additive: the one DROP below removes a NOT NULL (audit events may now belong to a ledger account).
CREATE TABLE IF NOT EXISTS "account_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"value" bigint NOT NULL,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"failure_code" text,
	"incoming_payment_url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_deposits_incoming_payment_url_unique" UNIQUE("incoming_payment_url"),
	CONSTRAINT "account_deposits_status" CHECK ("account_deposits"."status" in ('PENDING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "account_deposits_value_positive" CHECK ("account_deposits"."value" > 0),
	CONSTRAINT "account_deposits_asset_scale_range" CHECK ("account_deposits"."asset_scale" between 0 and 255),
	CONSTRAINT "account_deposits_completed_at" CHECK (("account_deposits"."status" = 'COMPLETED') = ("account_deposits"."completed_at" is not null)),
	CONSTRAINT "account_deposits_failure_code" CHECK ("account_deposits"."failure_code" is null or "account_deposits"."status" = 'FAILED')
);
--> statement-breakpoint
ALTER TABLE "account_deposits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"owner_user_id" uuid,
	"circle_id" uuid,
	"system_code" text,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_owner_user_id_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "ledger_accounts_circle_id_unique" UNIQUE("circle_id"),
	CONSTRAINT "ledger_accounts_system_unique" UNIQUE("system_code","asset_code","asset_scale"),
	CONSTRAINT "ledger_accounts_kind" CHECK ("ledger_accounts"."kind" in ('USER', 'CIRCLE_POOL', 'SYSTEM')),
	CONSTRAINT "ledger_accounts_user_owner" CHECK (("ledger_accounts"."kind" = 'USER') = ("ledger_accounts"."owner_user_id" is not null)),
	CONSTRAINT "ledger_accounts_pool_circle" CHECK (("ledger_accounts"."kind" = 'CIRCLE_POOL') = ("ledger_accounts"."circle_id" is not null)),
	CONSTRAINT "ledger_accounts_system_code" CHECK (("ledger_accounts"."kind" = 'SYSTEM') = ("ledger_accounts"."system_code" is not null)),
	CONSTRAINT "ledger_accounts_system_code_values" CHECK ("ledger_accounts"."system_code" is null or "ledger_accounts"."system_code" in ('DEMO_SEED', 'OP_WALLET')),
	CONSTRAINT "ledger_accounts_balance_non_negative" CHECK ("ledger_accounts"."kind" = 'SYSTEM' or "ledger_accounts"."balance" >= 0),
	CONSTRAINT "ledger_accounts_asset_scale_range" CHECK ("ledger_accounts"."asset_scale" between 0 and 255)
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"value" bigint NOT NULL,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transfers_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ledger_transfers_kind" CHECK ("ledger_transfers"."kind" in ('SEED', 'DEPOSIT', 'CONTRIBUTION')),
	CONSTRAINT "ledger_transfers_value_positive" CHECK ("ledger_transfers"."value" > 0),
	CONSTRAINT "ledger_transfers_distinct_accounts" CHECK ("ledger_transfers"."from_account_id" <> "ledger_transfers"."to_account_id"),
	CONSTRAINT "ledger_transfers_asset_scale_range" CHECK ("ledger_transfers"."asset_scale" between 0 and 255)
);
--> statement-breakpoint
ALTER TABLE "ledger_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "wallet_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "circle_members" ADD COLUMN IF NOT EXISTS "funding_source" text DEFAULT 'EXTERNAL_WALLET' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_deposits" DROP CONSTRAINT IF EXISTS "account_deposits_account_id_ledger_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "account_deposits" ADD CONSTRAINT "account_deposits_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" DROP CONSTRAINT IF EXISTS "ledger_accounts_owner_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" DROP CONSTRAINT IF EXISTS "ledger_accounts_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transfers" DROP CONSTRAINT IF EXISTS "ledger_transfers_from_account_id_ledger_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "ledger_transfers" ADD CONSTRAINT "ledger_transfers_from_account_id_ledger_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transfers" DROP CONSTRAINT IF EXISTS "ledger_transfers_to_account_id_ledger_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "ledger_transfers" ADD CONSTRAINT "ledger_transfers_to_account_id_ledger_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deposits_account_id_created_idx" ON "account_deposits" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transfers_from_account_created_idx" ON "ledger_transfers" USING btree ("from_account_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transfers_to_account_created_idx" ON "ledger_transfers" USING btree ("to_account_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_account_id_ledger_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_account_id_created_at_idx" ON "audit_events" USING btree ("account_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_subject";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_subject" CHECK ("audit_events"."wallet_id" is not null or "audit_events"."account_id" is not null);--> statement-breakpoint
ALTER TABLE "circle_members" DROP CONSTRAINT IF EXISTS "circle_members_funding_source";--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_funding_source" CHECK ("circle_members"."funding_source" in ('INTERNAL_ACCOUNT', 'EXTERNAL_WALLET'));--> statement-breakpoint
-- Backfill: every existing circle gets its pot on the ledger, in the circle's asset. Existing
-- contributions are not mirrored (demo data); pools of older circles start at 0.
INSERT INTO "ledger_accounts" ("kind", "circle_id", "asset_code", "asset_scale")
SELECT 'CIRCLE_POOL', "id", "asset_code", "asset_scale" FROM "circles"
ON CONFLICT ("circle_id") DO NOTHING;
