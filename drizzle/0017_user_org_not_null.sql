-- Stage B: enforce user.organization_id NOT NULL after remediation gates pass.
--
-- Required prechecks before applying:
--   1) SELECT count(*) FROM "user" WHERE organization_id IS NULL;
--   2) If count > 0, run remediation/backfill and repeat until count = 0.

DO $$
DECLARE
	null_user_count bigint;
BEGIN
	SELECT count(*) INTO null_user_count FROM "user" WHERE organization_id IS NULL;

	IF null_user_count > 0 THEN
		RAISE EXCEPTION
			'user.organization_id NOT NULL migration blocked: % null user rows remain. Run remediation before retry.',
			null_user_count;
	END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_organization_id_organizations_id_fk";
--> statement-breakpoint

ALTER TABLE "user" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
	ALTER TABLE "user"
	ADD CONSTRAINT "user_organization_id_organizations_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
DECLARE
	orphan_user_count bigint;
BEGIN
	SELECT count(*) INTO orphan_user_count
	FROM "user" u
	LEFT JOIN "organizations" o ON o.id = u.organization_id
	WHERE o.id IS NULL;

	IF orphan_user_count > 0 THEN
		RAISE EXCEPTION
			'user.organization_id FK verification failed: % rows reference missing organizations.',
			orphan_user_count;
	END IF;
END $$;
