ALTER TABLE "application_votes" DROP CONSTRAINT "application_votes_application_id_circle_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "circle_applications" DROP CONSTRAINT "circle_applications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "consent_challenges" DROP CONSTRAINT "consent_challenges_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "kyc_verifications" DROP CONSTRAINT "kyc_verifications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_subject_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "wallet_grants" DROP CONSTRAINT "wallet_grants_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "application_votes" ADD CONSTRAINT "application_votes_application_id_circle_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."circle_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_applications" ADD CONSTRAINT "circle_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_challenges" ADD CONSTRAINT "consent_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_grants" ADD CONSTRAINT "wallet_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
