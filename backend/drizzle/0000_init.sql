CREATE TABLE "credit_profiles" (
	"wallet_id" uuid PRIMARY KEY NOT NULL,
	"internal_credit_score" numeric(5, 4) NOT NULL,
	"borrowing_capacity" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_profiles_score_range" CHECK ("credit_profiles"."internal_credit_score" between 0 and 1),
	CONSTRAINT "credit_profiles_borrowing_capacity_non_negative" CHECK ("credit_profiles"."borrowing_capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"phone" varchar(256),
	"dob" date,
	"op_wallet" uuid,
	CONSTRAINT "users_op_wallet_unique" UNIQUE("op_wallet")
);
--> statement-breakpoint
CREATE TABLE "wallet_balances" (
	"wallet_id" uuid PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_balances_balance_non_negative" CHECK ("wallet_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_url" text NOT NULL,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_address_url_unique" UNIQUE("address_url"),
	CONSTRAINT "wallets_asset_scale_range" CHECK ("wallets"."asset_scale" between 0 and 255)
);
--> statement-breakpoint
ALTER TABLE "credit_profiles" ADD CONSTRAINT "credit_profiles_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_op_wallet_wallets_id_fk" FOREIGN KEY ("op_wallet") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;