-- Idempotent, like 0008: safe to re-run on the shared database. In-app notifications.
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" uuid,
	"friendship_id" uuid,
	"invite_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind" CHECK ("notifications"."kind" in ('FRIEND_REQUEST', 'CIRCLE_INVITE')),
	CONSTRAINT "notifications_source" CHECK (("notifications"."kind" = 'FRIEND_REQUEST' and "notifications"."friendship_id" is not null and "notifications"."invite_id" is null) or ("notifications"."kind" = 'CIRCLE_INVITE' and "notifications"."invite_id" is not null and "notifications"."friendship_id" is null))
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_actor_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_friendship_id_friendships_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_friendship_id_friendships_id_fk" FOREIGN KEY ("friendship_id") REFERENCES "public"."friendships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_invite_id_circle_invites_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_invite_id_circle_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."circle_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_friendship_unique" ON "notifications" USING btree ("friendship_id") WHERE "notifications"."friendship_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_invite_unique" ON "notifications" USING btree ("invite_id") WHERE "notifications"."invite_id" is not null;