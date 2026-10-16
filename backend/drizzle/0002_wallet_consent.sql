CREATE TABLE "consent_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"state" text NOT NULL,
	"wallet_address_url" text NOT NULL,
	"grant_endpoint" text NOT NULL,
	"client_nonce" text NOT NULL,
	"finish_nonce" text NOT NULL,
	"continue_uri" text NOT NULL,
	"continue_token_ciphertext" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_challenges_state_unique" UNIQUE("state"),
	CONSTRAINT "consent_challenges_status" CHECK ("consent_challenges"."status" in ('PENDING', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
ALTER TABLE "consent_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"manage_uri" text NOT NULL,
	"continue_uri" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_grants_status" CHECK ("wallet_grants"."status" in ('ACTIVE', 'REVOKED'))
);
--> statement-breakpoint
ALTER TABLE "wallet_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consent_challenges" ADD CONSTRAINT "consent_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_grants" ADD CONSTRAINT "wallet_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_grants" ADD CONSTRAINT "wallet_grants_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_challenges_user_id_idx" ON "consent_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_grants_user_id_idx" ON "wallet_grants" USING btree ("user_id");