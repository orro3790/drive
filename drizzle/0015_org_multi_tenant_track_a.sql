CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"join_code_hash" text NOT NULL,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint

ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint

ALTER TABLE "signup_onboarding" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint

ALTER TABLE "signup_onboarding" ADD COLUMN IF NOT EXISTS "target_role" text DEFAULT 'driver' NOT NULL;
--> statement-breakpoint

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organization_dispatch_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"emergency_bonus_percent" integer DEFAULT 20 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "organizations"
	ADD CONSTRAINT "organizations_owner_user_id_user_id_fk"
	FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "user"
	ADD CONSTRAINT "user_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "warehouses"
	ADD CONSTRAINT "warehouses_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "signup_onboarding"
	ADD CONSTRAINT "signup_onboarding_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "notifications"
	ADD CONSTRAINT "notifications_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "audit_logs"
	ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "organization_dispatch_settings"
	ADD CONSTRAINT "organization_dispatch_settings_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "organization_dispatch_settings"
	ADD CONSTRAINT "organization_dispatch_settings_updated_by_user_id_fk"
	FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_user_org" ON "user" USING btree ("organization_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_warehouses_org" ON "warehouses" USING btree ("organization_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_signup_onboarding_org_email_status"
	ON "signup_onboarding" USING btree ("organization_id", "email", "status");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_organizations_slug" ON "organizations" USING btree ("slug");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_organizations_join_code_hash"
	ON "organizations" USING btree ("join_code_hash");
--> statement-breakpoint

DROP INDEX IF EXISTS "uq_signup_onboarding_pending_email_kind";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_signup_onboarding_pending_org_email_kind_role"
	ON "signup_onboarding" USING btree ("organization_id", "email", "kind", "target_role")
	WHERE "status" = 'pending';
