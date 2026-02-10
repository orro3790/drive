ALTER TABLE "driver_health_state"
ADD COLUMN IF NOT EXISTS "reinstated_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "driver_health_state"
ADD COLUMN IF NOT EXISTS "last_score_reset_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "driver_health_snapshots"
ADD COLUMN IF NOT EXISTS "contributions" jsonb;
--> statement-breakpoint

ALTER TABLE "assignments"
ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
--> statement-breakpoint

UPDATE "assignments"
SET "cancelled_at" = "updated_at"
WHERE "status" = 'cancelled'
  AND "cancelled_at" IS NULL;
