CREATE TABLE IF NOT EXISTS "dispatch_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"emergency_bonus_percent" integer DEFAULT 20 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "dispatch_settings"
	ADD CONSTRAINT "dispatch_settings_updated_by_user_id_fk"
	FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

INSERT INTO "dispatch_settings" ("id", "emergency_bonus_percent")
VALUES ('global', 20)
ON CONFLICT ("id") DO NOTHING;
