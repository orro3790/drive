ALTER TYPE "public"."notification_type" ADD VALUE 'return_exception';--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "start_time" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "excepted_returns" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "exception_notes" text;
