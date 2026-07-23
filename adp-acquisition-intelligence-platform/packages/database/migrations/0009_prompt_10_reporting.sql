CREATE TYPE "public"."export_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"dashboard_key" text NOT NULL,
	"view_key" text,
	"status" "export_job_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" jsonb,
	"classification_notice" text NOT NULL,
	"artifact_ref" text,
	"row_count" integer,
	"redaction_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_jobs_dashboard_key_valid" CHECK ("export_jobs"."dashboard_key" ~ '^D[1-8]$' or "export_jobs"."dashboard_key" ~ '^table_'),
	CONSTRAINT "export_jobs_row_count_non_negative" CHECK ("export_jobs"."row_count" is null or "export_jobs"."row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"dashboard_key" text NOT NULL,
	"view_key" text,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_dashboard_key_valid" CHECK ("saved_views"."dashboard_key" ~ '^D[1-8]$' or "saved_views"."dashboard_key" ~ '^table_')
);
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_jobs_idempotency_key_unique" ON "export_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "export_jobs_requested_by_idx" ON "export_jobs" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "export_jobs_dashboard_key_idx" ON "export_jobs" USING btree ("dashboard_key");--> statement-breakpoint
CREATE INDEX "export_jobs_status_idx" ON "export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "export_jobs_expires_at_idx" ON "export_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "saved_views" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "saved_views_dashboard_key_idx" ON "saved_views" USING btree ("dashboard_key");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_owner_dashboard_name_unique" ON "saved_views" USING btree ("owner_user_id","dashboard_key","name");