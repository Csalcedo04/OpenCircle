-- Idempotent: the shared database already has the applications tables and approval columns
-- from an earlier, renumbered migration. Fresh databases get everything here.
CREATE TABLE IF NOT EXISTS "application_votes" (
	"application_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_votes_pkey" PRIMARY KEY("application_id","member_id"),
	CONSTRAINT "application_votes_decision" CHECK ("application_votes"."decision" in ('ACCEPT', 'REJECT'))
);
--> statement-breakpoint
ALTER TABLE "application_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payout_round" integer,
	"collateral_value" bigint DEFAULT 0 NOT NULL,
	"grant_mode" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_applications_status" CHECK ("circle_applications"."status" in ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN')),
	CONSTRAINT "circle_applications_payout_round_positive" CHECK ("circle_applications"."payout_round" is null or "circle_applications"."payout_round" >= 1),
	CONSTRAINT "circle_applications_collateral_non_negative" CHECK ("circle_applications"."collateral_value" >= 0),
	CONSTRAINT "circle_applications_grant_mode" CHECK ("circle_applications"."grant_mode" is null or "circle_applications"."grant_mode" in ('RECURRING', 'PER_ROUND')),
	CONSTRAINT "circle_applications_decided_at" CHECK (("circle_applications"."status" = 'PENDING') = ("circle_applications"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "circle_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "circle_members" ADD COLUMN IF NOT EXISTS "is_approver" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "approval_mode" text DEFAULT 'DELEGATES' NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" DROP CONSTRAINT IF EXISTS "circles_approval_mode";--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_approval_mode" CHECK ("circles"."approval_mode" in ('DELEGATES', 'MAJORITY'));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circle_applications_pending_unique" ON "circle_applications" USING btree ("circle_id","user_id") WHERE "circle_applications"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_applications_user_id_idx" ON "circle_applications" USING btree ("user_id");--> statement-breakpoint
-- Foreign keys: (re)created so that a user's own rows go with the user (ON DELETE cascade).
ALTER TABLE "application_votes" DROP CONSTRAINT IF EXISTS "application_votes_application_id_circle_applications_id_fk";--> statement-breakpoint
ALTER TABLE "application_votes" DROP CONSTRAINT IF EXISTS "application_votes_member_id_circle_members_id_fk";--> statement-breakpoint
ALTER TABLE "circle_applications" DROP CONSTRAINT IF EXISTS "circle_applications_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "circle_applications" DROP CONSTRAINT IF EXISTS "circle_applications_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "consent_challenges" DROP CONSTRAINT IF EXISTS "consent_challenges_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "kyc_verifications" DROP CONSTRAINT IF EXISTS "kyc_verifications_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_author_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_subject_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "wallet_grants" DROP CONSTRAINT IF EXISTS "wallet_grants_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "application_votes" ADD CONSTRAINT "application_votes_application_id_circle_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."circle_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_votes" ADD CONSTRAINT "application_votes_member_id_circle_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."circle_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_applications" ADD CONSTRAINT "circle_applications_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_applications" ADD CONSTRAINT "circle_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_challenges" ADD CONSTRAINT "consent_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_grants" ADD CONSTRAINT "wallet_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: every circle's creator approves applicants.
UPDATE "circle_members" SET "is_approver" = true FROM "circles" WHERE "circles"."id" = "circle_members"."circle_id" AND "circles"."created_by" = "circle_members"."user_id";--> statement-breakpoint
-- Deleting a Supabase Auth user deletes its profile, which cascades as above. A trigger, not a
-- foreign key, so profiles without an Auth account (seed, integration tests) stay valid.
CREATE OR REPLACE FUNCTION "public"."delete_user_on_auth_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM "public"."users" WHERE "id" = OLD."id";
  RETURN OLD;
END;
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION "public"."delete_user_on_auth_delete"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
DROP TRIGGER IF EXISTS "on_auth_user_deleted" ON "auth"."users";--> statement-breakpoint
CREATE TRIGGER "on_auth_user_deleted" AFTER DELETE ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."delete_user_on_auth_delete"();
