ALTER TABLE "rounds" ALTER COLUMN "beneficiary_member_id" DROP NOT NULL;--> statement-breakpoint
-- Added nullable, backfilled, then made NOT NULL: existing circles keep rounds = size.
ALTER TABLE "circles" ADD COLUMN "goal_value" bigint;--> statement-breakpoint
UPDATE "circles" SET "goal_value" = "contribution_value" * "size" * "size";--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "goal_value" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_goal_whole_rounds" CHECK ("circles"."goal_value" > 0 and "circles"."goal_value" % ("circles"."contribution_value" * "circles"."size") = 0);
