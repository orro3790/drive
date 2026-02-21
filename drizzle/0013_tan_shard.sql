ALTER TABLE "audit_logs" ALTER COLUMN "entity_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "preferred_locale" text DEFAULT 'en' NOT NULL;