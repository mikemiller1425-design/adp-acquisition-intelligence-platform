DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'collection_run_status'
      AND e.enumlabel = 'blocked'
  ) THEN
    ALTER TYPE "public"."collection_run_status" ADD VALUE 'blocked';
  END IF;
END
$$;--> statement-breakpoint
CREATE TABLE "collection_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_run_id" uuid NOT NULL,
	"collection_job_id" uuid,
	"organization_id" uuid,
	"approved_source_id" uuid,
	"requested_url" text NOT NULL,
	"final_url" text,
	"domain" text,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"http_status" integer,
	"content_hash" text,
	"redirect_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_attempts_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "collection_attempts" ADD CONSTRAINT "collection_attempts_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_attempts" ADD CONSTRAINT "collection_attempts_collection_job_id_collection_jobs_id_fk" FOREIGN KEY ("collection_job_id") REFERENCES "public"."collection_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_attempts" ADD CONSTRAINT "collection_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_attempts" ADD CONSTRAINT "collection_attempts_approved_source_id_approved_sources_id_fk" FOREIGN KEY ("approved_source_id") REFERENCES "public"."approved_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_attempts_run_idx" ON "collection_attempts" USING btree ("collection_run_id");--> statement-breakpoint
CREATE INDEX "collection_attempts_organization_idx" ON "collection_attempts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "collection_attempts_status_idx" ON "collection_attempts" USING btree ("status");
