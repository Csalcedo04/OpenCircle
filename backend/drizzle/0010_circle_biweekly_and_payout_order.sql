ALTER TABLE "circles" DROP CONSTRAINT "circles_cadence";--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "payout_order" text DEFAULT 'BEST_SCORE_FIRST' NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_payout_order" CHECK ("circles"."payout_order" in ('BEST_SCORE_FIRST', 'BEST_SCORE_LAST'));--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_cadence" CHECK ("circles"."cadence" in ('WEEKLY', 'BIWEEKLY', 'MONTHLY'));