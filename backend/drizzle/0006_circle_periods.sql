CREATE TABLE "test_clocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"frozen_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_clocks_name_length" CHECK (char_length("test_clocks"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "test_clocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "cadence" text DEFAULT 'MONTHLY' NOT NULL;--> statement-breakpoint
-- Existing circles: a 7-day round is weekly, anything else monthly (their stored deadlines are kept).
UPDATE "circles" SET "cadence" = 'WEEKLY' WHERE "round_length_days" = 7;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "test_clock_id" uuid;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "incoming_payment_url" text;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "quote_url" text;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "outgoing_payment_url" text;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
-- Existing rounds were scheduled as started_at + (number - 1) × round_length_days.
UPDATE "rounds" SET "starts_at" = "c"."started_at" + make_interval(days => ("rounds"."number" - 1) * "c"."round_length_days")
  FROM "circles" "c" WHERE "c"."id" = "rounds"."circle_id";--> statement-breakpoint
UPDATE "rounds" SET "starts_at" = "deadline" WHERE "starts_at" IS NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "test_clocks" ADD CONSTRAINT "test_clocks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_clocks_owner_user_id_idx" ON "test_clocks" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_test_clock_id_test_clocks_id_fk" FOREIGN KEY ("test_clock_id") REFERENCES "public"."test_clocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circles_test_clock_id_idx" ON "circles" USING btree ("test_clock_id");--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_cadence" CHECK ("circles"."cadence" in ('WEEKLY', 'MONTHLY'));