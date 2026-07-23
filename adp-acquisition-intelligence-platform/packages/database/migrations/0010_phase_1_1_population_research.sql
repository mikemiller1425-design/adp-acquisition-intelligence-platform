CREATE TYPE "public"."population_source_approval_status" AS ENUM('draft', 'under_review', 'approved', 'enabled', 'suspended', 'retired');--> statement-breakpoint
CREATE TYPE "public"."population_import_status" AS ENUM('uploaded', 'mapping', 'validating', 'normalizing', 'resolving', 'preview_ready', 'committing', 'committed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."raw_candidate_status" AS ENUM('raw', 'normalized', 'resolved', 'rejected', 'restricted', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."entity_resolution_decision" AS ENUM('create_new', 'link_existing', 'create_location', 'possible_duplicate', 'ambiguous_review', 'reject', 'restricted', 'existing_relationship', 'out_of_territory');--> statement-breakpoint
CREATE TYPE "public"."approved_source_lifecycle" AS ENUM('draft', 'under_review', 'approved', 'enabled', 'suspended', 'retired');--> statement-breakpoint
CREATE TYPE "public"."approved_source_adapter_type" AS ENUM('bulk_archive', 'public_api', 'licensed_data', 'archived_web', 'structured_metadata', 'organization_website', 'fixture');--> statement-breakpoint
CREATE TYPE "public"."research_priority_tier" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
CREATE TYPE "public"."collection_run_status" AS ENUM('draft', 'queued', 'running', 'cancelling', 'cancelled', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."collection_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'blocked', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."extracted_claim_review_status" AS ENUM('proposed', 'accepted', 'accepted_corrected', 'rejected', 'duplicate', 'contradictory', 'deferred', 'needs_research', 'source_problem');--> statement-breakpoint
CREATE TABLE "population_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"display_name" text NOT NULL,
	"provider" text NOT NULL,
	"source_type" text NOT NULL,
	"license_status" text NOT NULL,
	"permitted_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prohibited_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"geographic_coverage" text,
	"organization_coverage" text,
	"refresh_frequency" text,
	"data_owner" text NOT NULL,
	"approval_status" "population_source_approval_status" DEFAULT 'draft' NOT NULL,
	"retention_requirements" text,
	"current_version" text DEFAULT 'v1' NOT NULL,
	"effective_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "population_source_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"population_source_id" uuid NOT NULL,
	"version" text NOT NULL,
	"license_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schema_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "population_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"population_source_id" uuid NOT NULL,
	"source_version_id" uuid,
	"status" "population_import_status" DEFAULT 'uploaded' NOT NULL,
	"idempotency_key" text NOT NULL,
	"storage_key" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"ambiguous_count" integer DEFAULT 0 NOT NULL,
	"dry_run" boolean DEFAULT true NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_user_id" uuid,
	"committed_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "population_imports_counts_non_negative" CHECK ("row_count" >= 0 and "accepted_count" >= 0 and "rejected_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "population_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"population_import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"normalized_payload" jsonb,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"identity_key" text,
	"status" "raw_candidate_status" DEFAULT 'raw' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"population_import_id" uuid,
	"population_import_row_id" uuid,
	"identity_key" text NOT NULL,
	"display_name" text,
	"legal_name" text,
	"domain" text,
	"website" text,
	"phone" text,
	"address_line1" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"external_identifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"normalized" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "raw_candidate_status" DEFAULT 'raw' NOT NULL,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_resolution_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"population_import_id" uuid,
	"policy_version" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_resolution_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resolution_run_id" uuid NOT NULL,
	"raw_candidate_id" uuid NOT NULL,
	"candidate_organization_id" uuid,
	"match_confidence" integer DEFAULT 0 NOT NULL,
	"contributing_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicting_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_action" "entity_resolution_decision" NOT NULL,
	"decision_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_resolution_candidates_confidence_range" CHECK ("match_confidence" >= 0 and "match_confidence" <= 100)
);
--> statement-breakpoint
CREATE TABLE "entity_resolution_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resolution_candidate_id" uuid NOT NULL,
	"decision" "entity_resolution_decision" NOT NULL,
	"decided_by_user_id" uuid,
	"rationale" text,
	"organization_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approved_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"display_name" text NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"adapter_type" "approved_source_adapter_type" NOT NULL,
	"classification" text NOT NULL,
	"business_purpose" text NOT NULL,
	"permitted_organization_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permitted_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prohibited_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms_review_status" text DEFAULT 'pending' NOT NULL,
	"robots_behavior" text DEFAULT 'respect' NOT NULL,
	"privacy_review_status" text DEFAULT 'pending' NOT NULL,
	"legal_review_status" text DEFAULT 'pending' NOT NULL,
	"security_review_status" text DEFAULT 'pending' NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 10 NOT NULL,
	"concurrency_limit" integer DEFAULT 2 NOT NULL,
	"page_limit" integer DEFAULT 8 NOT NULL,
	"response_size_limit_bytes" integer DEFAULT 1048576 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"redirect_policy" text DEFAULT 'same_registrable_domain' NOT NULL,
	"refresh_interval_hours" integer DEFAULT 168 NOT NULL,
	"snapshot_retention_days" integer DEFAULT 90 NOT NULL,
	"parser_version" text DEFAULT 'v1' NOT NULL,
	"owner" text NOT NULL,
	"lifecycle" "approved_source_lifecycle" DEFAULT 'draft' NOT NULL,
	"kill_switch_active" boolean DEFAULT false NOT NULL,
	"approval_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_priority_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"tier" "research_priority_tier" NOT NULL,
	"explanation" text NOT NULL,
	"high_impact_missing_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_work" text,
	"next_eligible_research_at" timestamp with time zone,
	"blocking_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "collection_run_status" DEFAULT 'draft' NOT NULL,
	"approved_source_id" uuid,
	"policy_version" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"kill_switch_observed" boolean DEFAULT false NOT NULL,
	"target_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"blocked_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_run_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"canonical_domain" text,
	"priority_tier" "research_priority_tier",
	"status" "collection_job_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_run_id" uuid NOT NULL,
	"collection_run_target_id" uuid,
	"job_type" text NOT NULL,
	"status" "collection_job_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"approved_source_id" uuid,
	"collection_job_id" uuid,
	"requested_url" text NOT NULL,
	"final_url" text NOT NULL,
	"domain" text NOT NULL,
	"adapter_version" text NOT NULL,
	"policy_version" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"http_status" integer,
	"content_type" text,
	"content_length" integer,
	"content_hash" text NOT NULL,
	"etag" text,
	"last_modified" text,
	"redirect_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parser_version" text NOT NULL,
	"storage_key" text,
	"retention_expires_at" timestamp with time zone,
	"unchanged_from_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"extractor_version" text NOT NULL,
	"mapping_version" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"variable_key" text NOT NULL,
	"subject_type" text DEFAULT 'organization' NOT NULL,
	"original_excerpt" text NOT NULL,
	"proposed_value" jsonb NOT NULL,
	"source_url" text NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"extractor_version" text NOT NULL,
	"mapping_version" text NOT NULL,
	"confidence_components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text NOT NULL,
	"review_status" "extracted_claim_review_status" DEFAULT 'proposed' NOT NULL,
	"existing_value_comparison" jsonb,
	"affected_completeness_purposes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_rationale" text,
	"corrected_value" jsonb,
	"canonical_evidence_id" uuid,
	"canonical_variable_value_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sources_eligible" integer DEFAULT 0 NOT NULL,
	"sources_attempted" integer DEFAULT 0 NOT NULL,
	"sources_completed" integer DEFAULT 0 NOT NULL,
	"sources_blocked" integer DEFAULT 0 NOT NULL,
	"pages_retrieved" integer DEFAULT 0 NOT NULL,
	"archived_pages_reused" integer DEFAULT 0 NOT NULL,
	"pages_unchanged" integer DEFAULT 0 NOT NULL,
	"claims_extracted" integer DEFAULT 0 NOT NULL,
	"claims_accepted" integer DEFAULT 0 NOT NULL,
	"claims_awaiting_review" integer DEFAULT 0 NOT NULL,
	"variables_improved" integer DEFAULT 0 NOT NULL,
	"last_collection_at" timestamp with time zone,
	"next_eligible_refresh_at" timestamp with time zone,
	"remaining_high_impact_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_rate_limit_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approved_source_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "population_source_versions" ADD CONSTRAINT "population_source_versions_population_source_id_population_sources_id_fk" FOREIGN KEY ("population_source_id") REFERENCES "public"."population_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_imports" ADD CONSTRAINT "population_imports_population_source_id_population_sources_id_fk" FOREIGN KEY ("population_source_id") REFERENCES "public"."population_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_imports" ADD CONSTRAINT "population_imports_source_version_id_population_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."population_source_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_imports" ADD CONSTRAINT "population_imports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_import_rows" ADD CONSTRAINT "population_import_rows_population_import_id_population_imports_id_fk" FOREIGN KEY ("population_import_id") REFERENCES "public"."population_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_candidates" ADD CONSTRAINT "raw_candidates_population_import_id_population_imports_id_fk" FOREIGN KEY ("population_import_id") REFERENCES "public"."population_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_candidates" ADD CONSTRAINT "raw_candidates_population_import_row_id_population_import_rows_id_fk" FOREIGN KEY ("population_import_row_id") REFERENCES "public"."population_import_rows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_candidates" ADD CONSTRAINT "raw_candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_runs" ADD CONSTRAINT "entity_resolution_runs_population_import_id_population_imports_id_fk" FOREIGN KEY ("population_import_id") REFERENCES "public"."population_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_runs" ADD CONSTRAINT "entity_resolution_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_candidates" ADD CONSTRAINT "entity_resolution_candidates_resolution_run_id_entity_resolution_runs_id_fk" FOREIGN KEY ("resolution_run_id") REFERENCES "public"."entity_resolution_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_candidates" ADD CONSTRAINT "entity_resolution_candidates_raw_candidate_id_raw_candidates_id_fk" FOREIGN KEY ("raw_candidate_id") REFERENCES "public"."raw_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_candidates" ADD CONSTRAINT "entity_resolution_candidates_candidate_organization_id_organizations_id_fk" FOREIGN KEY ("candidate_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_decisions" ADD CONSTRAINT "entity_resolution_decisions_resolution_candidate_id_entity_resolution_candidates_id_fk" FOREIGN KEY ("resolution_candidate_id") REFERENCES "public"."entity_resolution_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_decisions" ADD CONSTRAINT "entity_resolution_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_resolution_decisions" ADD CONSTRAINT "entity_resolution_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_priority_assessments" ADD CONSTRAINT "research_priority_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_approved_source_id_approved_sources_id_fk" FOREIGN KEY ("approved_source_id") REFERENCES "public"."approved_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_run_targets" ADD CONSTRAINT "collection_run_targets_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_run_targets" ADD CONSTRAINT "collection_run_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_collection_run_target_id_collection_run_targets_id_fk" FOREIGN KEY ("collection_run_target_id") REFERENCES "public"."collection_run_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_approved_source_id_approved_sources_id_fk" FOREIGN KEY ("approved_source_id") REFERENCES "public"."approved_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_collection_job_id_collection_jobs_id_fk" FOREIGN KEY ("collection_job_id") REFERENCES "public"."collection_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_claims" ADD CONSTRAINT "extracted_claims_extraction_run_id_extraction_runs_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_claims" ADD CONSTRAINT "extracted_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_claims" ADD CONSTRAINT "extracted_claims_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_claims" ADD CONSTRAINT "extracted_claims_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_coverage" ADD CONSTRAINT "collection_coverage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_rate_limit_states" ADD CONSTRAINT "source_rate_limit_states_approved_source_id_approved_sources_id_fk" FOREIGN KEY ("approved_source_id") REFERENCES "public"."approved_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "population_sources_source_key_unique" ON "population_sources" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "population_sources_approval_status_idx" ON "population_sources" USING btree ("approval_status");--> statement-breakpoint
CREATE UNIQUE INDEX "population_source_versions_source_version_unique" ON "population_source_versions" USING btree ("population_source_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "population_imports_idempotency_unique" ON "population_imports" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "population_imports_source_idx" ON "population_imports" USING btree ("population_source_id");--> statement-breakpoint
CREATE INDEX "population_imports_status_idx" ON "population_imports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "population_import_rows_import_row_unique" ON "population_import_rows" USING btree ("population_import_id","row_number");--> statement-breakpoint
CREATE INDEX "population_import_rows_identity_idx" ON "population_import_rows" USING btree ("identity_key");--> statement-breakpoint
CREATE INDEX "raw_candidates_identity_idx" ON "raw_candidates" USING btree ("identity_key");--> statement-breakpoint
CREATE INDEX "raw_candidates_domain_idx" ON "raw_candidates" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "raw_candidates_status_idx" ON "raw_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "raw_candidates_organization_idx" ON "raw_candidates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "entity_resolution_runs_import_idx" ON "entity_resolution_runs" USING btree ("population_import_id");--> statement-breakpoint
CREATE INDEX "entity_resolution_candidates_run_idx" ON "entity_resolution_candidates" USING btree ("resolution_run_id");--> statement-breakpoint
CREATE INDEX "entity_resolution_candidates_raw_idx" ON "entity_resolution_candidates" USING btree ("raw_candidate_id");--> statement-breakpoint
CREATE INDEX "entity_resolution_decisions_candidate_idx" ON "entity_resolution_decisions" USING btree ("resolution_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approved_sources_source_key_unique" ON "approved_sources" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "approved_sources_lifecycle_idx" ON "approved_sources" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "research_priority_assessments_org_idx" ON "research_priority_assessments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "research_priority_assessments_tier_idx" ON "research_priority_assessments" USING btree ("tier");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_runs_idempotency_unique" ON "collection_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "collection_runs_status_idx" ON "collection_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_run_targets_run_org_unique" ON "collection_run_targets" USING btree ("collection_run_id","organization_id");--> statement-breakpoint
CREATE INDEX "collection_run_targets_status_idx" ON "collection_run_targets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_jobs_idempotency_unique" ON "collection_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "collection_jobs_run_idx" ON "collection_jobs" USING btree ("collection_run_id");--> statement-breakpoint
CREATE INDEX "collection_jobs_status_idx" ON "collection_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_snapshots_org_idx" ON "source_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "source_snapshots_content_hash_idx" ON "source_snapshots" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_snapshots_domain_idx" ON "source_snapshots" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "source_snapshots_job_url_hash_unique" ON "source_snapshots" USING btree ("collection_job_id","requested_url","content_hash");--> statement-breakpoint
CREATE INDEX "extraction_runs_snapshot_idx" ON "extraction_runs" USING btree ("source_snapshot_id");--> statement-breakpoint
CREATE INDEX "extracted_claims_org_idx" ON "extracted_claims" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "extracted_claims_review_status_idx" ON "extracted_claims" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "extracted_claims_variable_key_idx" ON "extracted_claims" USING btree ("variable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_coverage_org_unique" ON "collection_coverage" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_rate_limit_states_source_domain_unique" ON "source_rate_limit_states" USING btree ("approved_source_id","domain");
