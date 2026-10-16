CREATE TYPE "public"."document_type" AS ENUM('cc', 'ti', 'ce', 'pp');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "document_type" "document_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "document_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nationality" varchar(2) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_document_unique" UNIQUE("document_type","document_number");