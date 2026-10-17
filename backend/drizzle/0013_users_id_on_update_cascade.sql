-- Lets a profile be re-keyed to a new Supabase Auth id (UPDATE users SET id): every FK to users.id
-- follows the change. Idempotent: drops use IF EXISTS. Delete behaviour is unchanged.
ALTER TABLE "circle_applications" DROP CONSTRAINT IF EXISTS "circle_applications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "circle_invites" DROP CONSTRAINT IF EXISTS "circle_invites_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "circle_invites" DROP CONSTRAINT IF EXISTS "circle_invites_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "circle_members" DROP CONSTRAINT IF EXISTS "circle_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "circles" DROP CONSTRAINT IF EXISTS "circles_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "consent_challenges" DROP CONSTRAINT IF EXISTS "consent_challenges_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "friendships" DROP CONSTRAINT IF EXISTS "friendships_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "friendships" DROP CONSTRAINT IF EXISTS "friendships_addressee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "kyc_verifications" DROP CONSTRAINT IF EXISTS "kyc_verifications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_subject_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "test_clocks" DROP CONSTRAINT IF EXISTS "test_clocks_owner_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "wallet_grants" DROP CONSTRAINT IF EXISTS "wallet_grants_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "circle_applications" ADD CONSTRAINT "circle_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consent_challenges" ADD CONSTRAINT "consent_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "test_clocks" ADD CONSTRAINT "test_clocks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "wallet_grants" ADD CONSTRAINT "wallet_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;