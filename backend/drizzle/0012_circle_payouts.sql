-- Idempotent, like 0008 and 0011: safe to re-run on the shared database, where it was first applied
-- (as 0009, then 0011) before the team's 0011. Payout modes, goals and payouts.
CREATE TABLE IF NOT EXISTS "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"round_id" uuid,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" bigint NOT NULL,
	"asset_code" text NOT NULL,
	"asset_scale" integer NOT NULL,
	"receive_value" bigint,
	"receive_asset_code" text,
	"receive_asset_scale" integer,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"incoming_payment_url" text,
	"quote_url" text,
	"outgoing_payment_url" text,
	"requested_at" timestamp with time zone,
	"failure_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payouts_kind" CHECK ("payouts"."kind" in ('ROUND', 'FINAL', 'COMPENSATION')),
	CONSTRAINT "payouts_round_only_final_null" CHECK (("payouts"."kind" = 'FINAL') = ("payouts"."round_id" is null)),
	CONSTRAINT "payouts_value_positive" CHECK ("payouts"."value" > 0),
	CONSTRAINT "payouts_asset_scale_range" CHECK ("payouts"."asset_scale" between 0 and 255),
	CONSTRAINT "payouts_receive_amount" CHECK (("payouts"."receive_value" is null) = ("payouts"."receive_asset_code" is null) and ("payouts"."receive_value" is null) = ("payouts"."receive_asset_scale" is null)),
	CONSTRAINT "payouts_status" CHECK ("payouts"."status" in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "payouts_completed_at" CHECK (("payouts"."status" = 'COMPLETED') = ("payouts"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "beneficiary_member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "payout_mode" text DEFAULT 'PER_ROUND' NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "goal_value" bigint;--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT IF EXISTS "payouts_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT IF EXISTS "payouts_round_id_rounds_id_fk";--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT IF EXISTS "payouts_member_id_circle_members_id_fk";--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_member_id_circle_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."circle_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_circle_id_idx" ON "payouts" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_member_id_idx" ON "payouts" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "circles" DROP CONSTRAINT IF EXISTS "circles_payout_mode";--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_payout_mode" CHECK ("circles"."payout_mode" in ('PER_ROUND', 'END'));--> statement-breakpoint
ALTER TABLE "circles" DROP CONSTRAINT IF EXISTS "circles_goal_only_end";--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_goal_only_end" CHECK (("circles"."payout_mode" = 'END') = ("circles"."goal_value" is not null));--> statement-breakpoint
ALTER TABLE "circles" DROP CONSTRAINT IF EXISTS "circles_goal_divisible";--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_goal_divisible" CHECK ("circles"."goal_value" is null or ("circles"."goal_value" > 0 and "circles"."goal_value" % ("circles"."contribution_value" * "circles"."size") = 0));