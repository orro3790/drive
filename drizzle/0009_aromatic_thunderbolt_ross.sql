CREATE TYPE "public"."signup_onboarding_kind" AS ENUM('approval', 'invite');--> statement-breakpoint
CREATE TYPE "public"."signup_onboarding_status" AS ENUM('pending', 'consumed', 'revoked');--> statement-breakpoint
CREATE TABLE "signup_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"kind" "signup_onboarding_kind" DEFAULT 'approval' NOT NULL,
	"token_hash" text,
	"status" "signup_onboarding_status" DEFAULT 'pending' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"consumed_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_signup_onboarding_token_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "signup_onboarding" ADD CONSTRAINT "signup_onboarding_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_onboarding" ADD CONSTRAINT "signup_onboarding_consumed_by_user_id_user_id_fk" FOREIGN KEY ("consumed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_onboarding" ADD CONSTRAINT "signup_onboarding_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_signup_onboarding_email_status" ON "signup_onboarding" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "idx_signup_onboarding_expires_at" ON "signup_onboarding" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_signup_onboarding_token_hash" ON "signup_onboarding" USING btree ("token_hash");