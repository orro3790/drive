ALTER TYPE "signup_onboarding_status" ADD VALUE IF NOT EXISTS 'reserved';
--> statement-breakpoint

UPDATE "signup_onboarding"
SET
	"status" = 'revoked',
	"revoked_at" = COALESCE("revoked_at", now()),
	"revoked_by_user_id" = NULL,
	"updated_at" = now()
WHERE "status" = 'pending'
	AND "expires_at" IS NOT NULL
	AND "expires_at" <= now();
--> statement-breakpoint

WITH ranked_pending AS (
	SELECT
		id,
		row_number() OVER (
			PARTITION BY email, kind
			ORDER BY created_at DESC, id DESC
		) AS row_num
	FROM "signup_onboarding"
	WHERE "status" = 'pending'
)
UPDATE "signup_onboarding" so
SET
	"status" = 'revoked',
	"revoked_at" = COALESCE(so."revoked_at", now()),
	"revoked_by_user_id" = NULL,
	"updated_at" = now()
FROM ranked_pending rp
WHERE so.id = rp.id
	AND rp.row_num > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_signup_onboarding_pending_email_kind"
	ON "signup_onboarding" USING btree ("email", "kind")
	WHERE "status" = 'pending';
