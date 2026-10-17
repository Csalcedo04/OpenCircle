-- Idempotent, like 0008: safe to re-run on the shared database. Friends and circle invitations.
CREATE TABLE IF NOT EXISTS "circle_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid NOT NULL,
	"user_id" uuid,
	"email" text,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"accepted_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_invites_token_unique" UNIQUE("token"),
	CONSTRAINT "circle_invites_kind" CHECK ("circle_invites"."kind" in ('CODE', 'DIRECT')),
	CONSTRAINT "circle_invites_status" CHECK ("circle_invites"."status" in ('ACTIVE', 'ACCEPTED', 'REVOKED')),
	CONSTRAINT "circle_invites_direct_target" CHECK (("circle_invites"."kind" = 'DIRECT') = ("circle_invites"."user_id" is not null or "circle_invites"."email" is not null)),
	CONSTRAINT "circle_invites_max_uses" CHECK ("circle_invites"."max_uses" is null or ("circle_invites"."kind" = 'CODE' and "circle_invites"."max_uses" >= 1)),
	CONSTRAINT "circle_invites_uses_non_negative" CHECK ("circle_invites"."uses" >= 0),
	CONSTRAINT "circle_invites_accepted" CHECK (("circle_invites"."status" = 'ACCEPTED') = ("circle_invites"."accepted_member_id" is not null)),
	CONSTRAINT "circle_invites_accepted_direct" CHECK ("circle_invites"."accepted_member_id" is null or "circle_invites"."kind" = 'DIRECT'),
	CONSTRAINT "circle_invites_email_lower" CHECK ("circle_invites"."email" is null or "circle_invites"."email" = lower("circle_invites"."email"))
);
--> statement-breakpoint
ALTER TABLE "circle_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"addressee_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_status" CHECK ("friendships"."status" in ('PENDING', 'ACCEPTED')),
	CONSTRAINT "friendships_not_self" CHECK ("friendships"."requester_id" <> "friendships"."addressee_id"),
	CONSTRAINT "friendships_accepted_at" CHECK (("friendships"."status" = 'ACCEPTED') = ("friendships"."accepted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "friendships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Backfill: every circle's permanent invite link becomes a standing CODE invite (no expiry, no use
-- limit), so links already shared keep working. Never overwrites a code that was migrated before.
INSERT INTO "circle_invites" ("circle_id", "kind", "token", "created_by")
SELECT "id", 'CODE', "invite_code", "created_by" FROM "circles" WHERE "invite_code" IS NOT NULL
ON CONFLICT ("token") DO NOTHING;--> statement-breakpoint
-- Legacy column: superseded by circle_invites; kept (nullable) so nothing is dropped.
ALTER TABLE "circles" ALTER COLUMN "invite_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "circle_invites" DROP CONSTRAINT IF EXISTS "circle_invites_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invites" DROP CONSTRAINT IF EXISTS "circle_invites_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invites" DROP CONSTRAINT IF EXISTS "circle_invites_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invites" DROP CONSTRAINT IF EXISTS "circle_invites_accepted_member_id_circle_members_id_fk";--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_accepted_member_id_circle_members_id_fk" FOREIGN KEY ("accepted_member_id") REFERENCES "public"."circle_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" DROP CONSTRAINT IF EXISTS "friendships_requester_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" DROP CONSTRAINT IF EXISTS "friendships_addressee_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_invites_circle_id_idx" ON "circle_invites" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_invites_user_id_idx" ON "circle_invites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_invites_email_idx" ON "circle_invites" USING btree ("email") WHERE "circle_invites"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "friendships_pair_unique" ON "friendships" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_addressee_id_idx" ON "friendships" USING btree ("addressee_id");