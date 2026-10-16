CREATE TABLE "circle_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payout_round" integer NOT NULL,
	"collateral_value" bigint DEFAULT 0 NOT NULL,
	"grant_mode" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_members_circle_user_unique" UNIQUE("circle_id","user_id"),
	CONSTRAINT "circle_members_circle_payout_round_unique" UNIQUE("circle_id","payout_round"),
	CONSTRAINT "circle_members_payout_round_positive" CHECK ("circle_members"."payout_round" >= 1),
	CONSTRAINT "circle_members_collateral_non_negative" CHECK ("circle_members"."collateral_value" >= 0),
	CONSTRAINT "circle_members_grant_mode" CHECK ("circle_members"."grant_mode" is null or "circle_members"."grant_mode" in ('RECURRING', 'PER_ROUND'))
);
--> statement-breakpoint
ALTER TABLE "circle_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"contribution_value" bigint NOT NULL,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"fee_bps" integer DEFAULT 0 NOT NULL,
	"threshold_value" bigint DEFAULT 0 NOT NULL,
	"grant_weight_bps" integer DEFAULT 5000 NOT NULL,
	"round_length_days" integer NOT NULL,
	"size" integer NOT NULL,
	"pool_wallet_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circles_status" CHECK ("circles"."status" in ('OPEN', 'ACTIVE', 'COMPLETED')),
	CONSTRAINT "circles_name_length" CHECK (char_length("circles"."name") between 1 and 80),
	CONSTRAINT "circles_contribution_positive" CHECK ("circles"."contribution_value" > 0),
	CONSTRAINT "circles_asset_scale_range" CHECK ("circles"."asset_scale" between 0 and 255),
	CONSTRAINT "circles_fee_bps_range" CHECK ("circles"."fee_bps" between 0 and 10000),
	CONSTRAINT "circles_threshold_non_negative" CHECK ("circles"."threshold_value" >= 0),
	CONSTRAINT "circles_grant_weight_bps_range" CHECK ("circles"."grant_weight_bps" between 0 and 10000),
	CONSTRAINT "circles_round_length_range" CHECK ("circles"."round_length_days" between 1 and 365),
	CONSTRAINT "circles_size_range" CHECK ("circles"."size" between 2 and 50)
);
--> statement-breakpoint
ALTER TABLE "circles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"value" bigint NOT NULL,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "contributions_round_member_unique" UNIQUE("round_id","member_id"),
	CONSTRAINT "contributions_value_positive" CHECK ("contributions"."value" > 0),
	CONSTRAINT "contributions_asset_scale_range" CHECK ("contributions"."asset_scale" between 0 and 255),
	CONSTRAINT "contributions_status" CHECK ("contributions"."status" in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "contributions_completed_at" CHECK (("contributions"."status" = 'COMPLETED') = ("contributions"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_author_subject_circle_unique" UNIQUE("author_id","subject_id","circle_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_not_self" CHECK ("reviews"."author_id" <> "reviews"."subject_id"),
	CONSTRAINT "reviews_comment_length" CHECK ("reviews"."comment" is null or char_length("reviews"."comment") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"beneficiary_member_id" uuid NOT NULL,
	"state" text DEFAULT 'UPCOMING' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_circle_number_unique" UNIQUE("circle_id","number"),
	CONSTRAINT "rounds_circle_beneficiary_unique" UNIQUE("circle_id","beneficiary_member_id"),
	CONSTRAINT "rounds_number_positive" CHECK ("rounds"."number" >= 1),
	CONSTRAINT "rounds_state" CHECK ("rounds"."state" in ('UPCOMING', 'COLLECTING', 'FUNDED', 'RISK_CHECK', 'BLOCKED', 'PAYING_OUT', 'PAID_OUT', 'REFUNDED'))
);
--> statement-breakpoint
ALTER TABLE "rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_pool_wallet_id_wallets_id_fk" FOREIGN KEY ("pool_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_member_id_circle_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."circle_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_beneficiary_member_id_circle_members_id_fk" FOREIGN KEY ("beneficiary_member_id") REFERENCES "public"."circle_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_members_user_id_idx" ON "circle_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "circles_status_idx" ON "circles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "circles_created_by_idx" ON "circles" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "contributions_member_id_idx" ON "contributions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "reviews_subject_id_idx" ON "reviews" USING btree ("subject_id");