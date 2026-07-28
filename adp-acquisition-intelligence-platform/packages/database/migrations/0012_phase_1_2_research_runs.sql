-- Phase 1.2 controlled research run orchestration + durable job queue (ADR-006 seam)
CREATE TYPE "public"."research_run_mode" AS ENUM('fixture', 'dry_run', 'archive_only', 'archive_first_live_fallback', 'live_official_site_only');--> statement-breakpoint
CREATE TYPE "public"."research_run_status" AS ENUM('draft', 'validating', 'awaiting_approval', 'queued', 'running', 'pausing', 'paused', 'completed', 'blocked', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."research_run_target_status" AS ENUM('pending', 'queued', 'running', 'succeeded', 'failed', 'blocked', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."durable_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'dead', 'cancelled');--> statement-breakpoint

CREATE TABLE "research_run_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"mode" "research_run_mode" DEFAULT 'archive_only' NOT NULL,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_query_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_organizations" integer DEFAULT 0 NOT NULL,
	"max_pages_per_organization" integer DEFAULT 0 NOT NULL,
	"max_total_requests" integer DEFAULT 0 NOT NULL,
	"archive_first" boolean DEFAULT true NOT NULL,
	"live_fallback" boolean DEFAULT false NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"freshness_threshold_hours" integer DEFAULT 168 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_run_definitions_limits_non_negative" CHECK ("max_organizations" >= 0 and "max_pages_per_organization" >= 0 and "max_total_requests" >= 0)
);--> statement-breakpoint

CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"status" "research_run_status" DEFAULT 'draft' NOT NULL,
	"mode" "research_run_mode" DEFAULT 'archive_only' NOT NULL,
	"correlation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_query_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approval_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"initiating_user_id" uuid,
	"kill_switch_active" boolean DEFAULT false NOT NULL,
	"pause_reason" text,
	"cancel_reason" text,
	"error_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"targets_total" integer DEFAULT 0 NOT NULL,
	"targets_completed" integer DEFAULT 0 NOT NULL,
	"targets_failed" integer DEFAULT 0 NOT NULL,
	"targets_blocked" integer DEFAULT 0 NOT NULL,
	"requests_consumed" integer DEFAULT 0 NOT NULL,
	"archive_hits" integer DEFAULT 0 NOT NULL,
	"live_fallbacks" integer DEFAULT 0 NOT NULL,
	"pages_retrieved" integer DEFAULT 0 NOT NULL,
	"snapshots_created" integer DEFAULT 0 NOT NULL,
	"claims_proposed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_runs_idempotency_key_unique" UNIQUE("idempotency_key")
);--> statement-breakpoint

CREATE TABLE "research_run_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"canonical_domain" text,
	"status" "research_run_target_status" DEFAULT 'pending' NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "research_run_source_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_run_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"adapter_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_url" text,
	"final_url" text,
	"http_status" integer,
	"error_code" text,
	"error_message" text,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "research_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_run_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "research_run_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_run_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"metric_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "research_run_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_run_id" uuid NOT NULL,
	"approval_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "research_run_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_run_id" uuid NOT NULL,
	"target_id" uuid,
	"checkpoint_key" text NOT NULL,
	"checkpoint_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_run_checkpoints_unique" UNIQUE("research_run_id","checkpoint_key")
);--> statement-breakpoint

CREATE TABLE "durable_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"correlation_id" text,
	"status" "durable_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);--> statement-breakpoint

ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_definition_id_research_run_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."research_run_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_targets" ADD CONSTRAINT "research_run_targets_research_run_id_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_targets" ADD CONSTRAINT "research_run_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_source_attempts" ADD CONSTRAINT "research_run_source_attempts_research_run_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_source_attempts" ADD CONSTRAINT "research_run_source_attempts_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."research_run_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_events" ADD CONSTRAINT "research_run_events_research_run_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_metrics" ADD CONSTRAINT "research_run_metrics_research_run_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_approvals" ADD CONSTRAINT "research_run_approvals_research_run_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run_checkpoints" ADD CONSTRAINT "research_run_checkpoints_research_run_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "research_runs_status_idx" ON "research_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "research_run_targets_run_status_idx" ON "research_run_targets" USING btree ("research_run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "durable_jobs_idempotency_key_unique" ON "durable_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "durable_jobs_claim_idx" ON "durable_jobs" USING btree ("status","available_at");--> statement-breakpoint
