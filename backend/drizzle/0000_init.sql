CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"phone" varchar(256),
	"dob" date,
	"op_wallet" uuid
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_url" text NOT NULL,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_address_url_unique" UNIQUE("address_url")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_op_wallet_wallets_id_fk" FOREIGN KEY ("op_wallet") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;