CREATE TYPE "public"."bid_window_mode" AS ENUM('competitive', 'instant', 'emergency');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'confirmation_reminder';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'shift_auto_dropped';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'emergency_route_available';--> statement-breakpoint
ALTER TABLE "bid_windows" DROP CONSTRAINT "bid_windows_assignment_id_unique";--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bid_windows" ADD COLUMN "mode" "bid_window_mode" DEFAULT 'competitive' NOT NULL;--> statement-breakpoint
ALTER TABLE "bid_windows" ADD COLUMN "trigger" text;--> statement-breakpoint
ALTER TABLE "bid_windows" ADD COLUMN "pay_bonus_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_metrics" ADD COLUMN "total_assigned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_metrics" ADD COLUMN "confirmed_shifts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_metrics" ADD COLUMN "auto_dropped_shifts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_metrics" ADD COLUMN "late_cancellations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_metrics" ADD COLUMN "no_shows" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_metrics" ADD COLUMN "bid_pickups" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_bid_windows_assignment_status" ON "bid_windows" USING btree ("assignment_id","status");