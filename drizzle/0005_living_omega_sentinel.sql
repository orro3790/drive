ALTER TABLE "shifts" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "editable_until" timestamp with time zone;