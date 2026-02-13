ALTER TABLE "organization_dispatch_settings"
ADD COLUMN IF NOT EXISTS "reward_min_attendance_percent" integer DEFAULT 95 NOT NULL;
--> statement-breakpoint

ALTER TABLE "organization_dispatch_settings"
ADD COLUMN IF NOT EXISTS "corrective_completion_threshold_percent" integer DEFAULT 98 NOT NULL;
