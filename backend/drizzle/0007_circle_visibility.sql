ALTER TABLE "circles" ADD COLUMN "visibility" text DEFAULT 'PRIVATE' NOT NULL;--> statement-breakpoint
-- Circles that existed before this change were all public: keep them visible.
UPDATE "circles" SET "visibility" = 'PUBLIC';--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "invite_code" text;--> statement-breakpoint
-- Two v4 UUIDs (strong randomness, built into Postgres 13+): 244 random bits per existing circle.
UPDATE "circles" SET "invite_code" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "invite_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_invite_code_unique" UNIQUE("invite_code");--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_visibility" CHECK ("circles"."visibility" in ('PRIVATE', 'PUBLIC'));
