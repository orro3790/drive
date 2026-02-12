-- Track L: Enforce NOT NULL on organizationId for critical tables
-- Prerequisites: Run scripts/backfill-organizations.ts and scripts/validate-org-migration.ts first

-- Drop existing SET NULL FK constraints (incompatible with NOT NULL)
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_organization_id_organizations_id_fk";
--> statement-breakpoint

ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "warehouses_organization_id_organizations_id_fk";
--> statement-breakpoint

ALTER TABLE "signup_onboarding" DROP CONSTRAINT IF EXISTS "signup_onboarding_organization_id_organizations_id_fk";
--> statement-breakpoint

-- Enforce NOT NULL
ALTER TABLE "user" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "warehouses" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "signup_onboarding" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint

-- Re-add FK constraints with ON DELETE RESTRICT
DO $$ BEGIN
	ALTER TABLE "user"
	ADD CONSTRAINT "user_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "warehouses"
	ADD CONSTRAINT "warehouses_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "signup_onboarding"
	ADD CONSTRAINT "signup_onboarding_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
