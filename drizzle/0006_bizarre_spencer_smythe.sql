ALTER TYPE "public"."notification_type" ADD VALUE 'streak_advanced';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'streak_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'bonus_eligible';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'corrective_warning';--> statement-breakpoint
CREATE TABLE "driver_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"evaluated_at" date NOT NULL,
	"score" integer NOT NULL,
	"attendance_rate" real NOT NULL,
	"completion_rate" real NOT NULL,
	"late_cancellation_count_30d" integer DEFAULT 0 NOT NULL,
	"no_show_count_30d" integer DEFAULT 0 NOT NULL,
	"hard_stop_triggered" boolean DEFAULT false NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_health_snapshots_user_id_evaluated_at_unique" UNIQUE("user_id","evaluated_at")
);
--> statement-breakpoint
CREATE TABLE "driver_health_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current_score" integer DEFAULT 0 NOT NULL,
	"streak_weeks" integer DEFAULT 0 NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"last_qualified_week_start" date,
	"assignment_pool_eligible" boolean DEFAULT true NOT NULL,
	"requires_manager_intervention" boolean DEFAULT false NOT NULL,
	"next_milestone_stars" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_health_snapshots" ADD CONSTRAINT "driver_health_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_health_state" ADD CONSTRAINT "driver_health_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_health_snapshots_user_date" ON "driver_health_snapshots" USING btree ("user_id","evaluated_at");