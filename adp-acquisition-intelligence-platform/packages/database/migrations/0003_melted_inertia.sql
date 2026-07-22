CREATE TYPE "public"."duplicate_candidate_disposition" AS ENUM('pending', 'confirmed_duplicate', 'not_duplicate', 'merged', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."duplicate_disposition" AS ENUM('pending', 'unique', 'link', 'skip', 'merge_candidate', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."duplicate_match_tier" AS ENUM('exact', 'strong', 'ambiguous', 'weak');--> statement-breakpoint
CREATE TYPE "public"."import_batch_lifecycle_status" AS ENUM('uploaded', 'mapping_required', 'mapped', 'validating', 'validation_failed', 'preview_ready', 'duplicate_review_required', 'ready_to_commit', 'committing', 'committed', 'partially_committed', 'commit_failed', 'reverting', 'reverted', 'partially_reverted', 'expired', 'archived');--> statement-breakpoint
CREATE TYPE "public"."import_batch_source" AS ENUM('manual', 'csv_upload');--> statement-breakpoint
CREATE TYPE "public"."import_commit_result" AS ENUM('pending', 'created', 'linked', 'updated', 'skipped', 'failed', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."import_entity_link_action" AS ENUM('created', 'updated', 'linked', 'proposed', 'merged', 'skipped', 'archived', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."import_entity_type" AS ENUM('organization', 'contact', 'location', 'alias', 'assignment', 'evidence', 'observation', 'variable_value', 'consent_permission');--> statement-breakpoint
CREATE TYPE "public"."merge_event_status" AS ENUM('planned', 'completed', 'reversal_blocked', 'reversed', 'manual_remediation_required');--> statement-breakpoint
CREATE TABLE "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid,
	"subject_type" "subject_type" DEFAULT 'organization' NOT NULL,
	"left_organization_id" uuid NOT NULL,
	"right_organization_id" uuid NOT NULL,
	"match_tier" "duplicate_match_tier" NOT NULL,
	"match_score" numeric(5, 4),
	"match_policy_version" text NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text,
	"disposition" "duplicate_candidate_disposition" DEFAULT 'pending' NOT NULL,
	"reviewer_user_id" uuid,
	"reason_code" text,
	"reason_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_candidates_subject_organization" CHECK ("duplicate_candidates"."subject_type" = 'organization'),
	CONSTRAINT "duplicate_candidates_distinct_organizations" CHECK ("duplicate_candidates"."left_organization_id" <> "duplicate_candidates"."right_organization_id"),
	CONSTRAINT "duplicate_candidates_match_score_unit_interval" CHECK ("duplicate_candidates"."match_score" is null or ("duplicate_candidates"."match_score" >= 0 and "duplicate_candidates"."match_score" <= 1)),
	CONSTRAINT "duplicate_candidates_decision_metadata_valid" CHECK ("duplicate_candidates"."disposition" = 'pending' or "duplicate_candidates"."decided_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"artifact_ref" text NOT NULL,
	"content_hash" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"content_type" text DEFAULT 'text/csv' NOT NULL,
	"encoding" text DEFAULT 'utf-8' NOT NULL,
	"delimiter" text DEFAULT ',' NOT NULL,
	"actor_user_id" uuid,
	"source" "import_batch_source" NOT NULL,
	"mapping_version" text DEFAULT 'field_registry.v1' NOT NULL,
	"validation_policy_version" text DEFAULT 'validation.v1' NOT NULL,
	"normalization_policy_version" text DEFAULT 'normalization.v1' NOT NULL,
	"status" "import_batch_lifecycle_status" DEFAULT 'uploaded' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"duplicate_review_count" integer DEFAULT 0 NOT NULL,
	"committed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"reverted_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" uuid,
	"retention_expires_at" timestamp with time zone,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preview_report" jsonb,
	"commit_report" jsonb,
	"reversal_report" jsonb,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "import_batches_filename_safe" CHECK ("import_batches"."filename" <> ''
        and strpos("import_batches"."filename", '/') = 0
        and strpos("import_batches"."filename", chr(92)) = 0
        and "import_batches"."filename" !~ '[[:cntrl:]]'),
	CONSTRAINT "import_batches_artifact_ref_private" CHECK ("import_batches"."artifact_ref" <> '' and "import_batches"."artifact_ref" !~* '^https?://'),
	CONSTRAINT "import_batches_content_hash_present" CHECK ("import_batches"."content_hash" <> ''),
	CONSTRAINT "import_batches_file_size_nonnegative" CHECK ("import_batches"."file_size_bytes" >= 0),
	CONSTRAINT "import_batches_delimiter_valid" CHECK (char_length("import_batches"."delimiter") between 1 and 4),
	CONSTRAINT "import_batches_counts_nonnegative" CHECK ("import_batches"."row_count" >= 0
        and "import_batches"."error_count" >= 0
        and "import_batches"."warning_count" >= 0
        and "import_batches"."duplicate_review_count" >= 0
        and "import_batches"."committed_count" >= 0
        and "import_batches"."skipped_count" >= 0
        and "import_batches"."reverted_count" >= 0),
	CONSTRAINT "import_batches_record_version_positive" CHECK ("import_batches"."record_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "import_entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"import_row_id" uuid,
	"entity_type" "import_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "import_entity_link_action" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_row_number" integer NOT NULL,
	"raw_row_hash" text NOT NULL,
	"raw_artifact_ref" text,
	"mapped_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"normalized_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duplicate_disposition" "duplicate_disposition" DEFAULT 'pending' NOT NULL,
	"commit_result" "import_commit_result" DEFAULT 'pending' NOT NULL,
	"created_entity_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observation_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variable_proposal_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_reason" text,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_rows_source_row_number_positive" CHECK ("import_rows"."source_row_number" > 0),
	CONSTRAINT "import_rows_raw_row_hash_present" CHECK ("import_rows"."raw_row_hash" <> ''),
	CONSTRAINT "import_rows_raw_artifact_ref_private" CHECK ("import_rows"."raw_artifact_ref" is null or "import_rows"."raw_artifact_ref" !~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "merge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survivor_organization_id" uuid NOT NULL,
	"absorbed_organization_id" uuid NOT NULL,
	"status" "merge_event_status" DEFAULT 'planned' NOT NULL,
	"impact_preview" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"moved_children" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid,
	"approver_user_id" uuid,
	"reason_code" text,
	"reason_note" text,
	"correlation_id" uuid,
	"completed_at" timestamp with time zone,
	"reversal_preview" jsonb,
	"reversed_at" timestamp with time zone,
	"reversal_blocker_report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merge_events_completion_metadata_valid" CHECK ("merge_events"."status" <> 'completed' or "merge_events"."completed_at" is not null),
	CONSTRAINT "merge_events_reversal_metadata_valid" CHECK ("merge_events"."status" <> 'reversed' or "merge_events"."reversed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_left_organization_id_organizations_id_fk" FOREIGN KEY ("left_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_right_organization_id_organizations_id_fk" FOREIGN KEY ("right_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_entity_links" ADD CONSTRAINT "import_entity_links_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_entity_links" ADD CONSTRAINT "import_entity_links_import_row_id_import_rows_id_fk" FOREIGN KEY ("import_row_id") REFERENCES "public"."import_rows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_events" ADD CONSTRAINT "merge_events_survivor_organization_id_organizations_id_fk" FOREIGN KEY ("survivor_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_events" ADD CONSTRAINT "merge_events_absorbed_organization_id_organizations_id_fk" FOREIGN KEY ("absorbed_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_events" ADD CONSTRAINT "merge_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_events" ADD CONSTRAINT "merge_events_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duplicate_candidates_batch_id_idx" ON "duplicate_candidates" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "duplicate_candidates_left_org_idx" ON "duplicate_candidates" USING btree ("left_organization_id");--> statement-breakpoint
CREATE INDEX "duplicate_candidates_right_org_idx" ON "duplicate_candidates" USING btree ("right_organization_id");--> statement-breakpoint
CREATE INDEX "duplicate_candidates_review_queue_idx" ON "duplicate_candidates" USING btree ("disposition","match_tier","created_at");--> statement-breakpoint
CREATE INDEX "duplicate_candidates_pending_review_idx" ON "duplicate_candidates" USING btree ("created_at") WHERE "duplicate_candidates"."disposition" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_idempotency_key_unique" ON "import_batches" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_batches_correlation_id_idx" ON "import_batches" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "import_batches_retention_expires_at_idx" ON "import_batches" USING btree ("retention_expires_at");--> statement-breakpoint
CREATE INDEX "import_entity_links_batch_id_idx" ON "import_entity_links" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_entity_links_import_row_id_idx" ON "import_entity_links" USING btree ("import_row_id");--> statement-breakpoint
CREATE INDEX "import_entity_links_entity_idx" ON "import_entity_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_batch_source_row_unique" ON "import_rows" USING btree ("batch_id","source_row_number");--> statement-breakpoint
CREATE INDEX "import_rows_batch_id_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_rows_duplicate_disposition_idx" ON "import_rows" USING btree ("duplicate_disposition");--> statement-breakpoint
CREATE INDEX "import_rows_commit_result_idx" ON "import_rows" USING btree ("commit_result");--> statement-breakpoint
CREATE UNIQUE INDEX "merge_events_incomplete_pair_unique" ON "merge_events" USING btree ("survivor_organization_id","absorbed_organization_id") WHERE "merge_events"."completed_at" is null
          and "merge_events"."reversed_at" is null
          and "merge_events"."status" in ('planned', 'manual_remediation_required');--> statement-breakpoint
CREATE INDEX "merge_events_survivor_org_idx" ON "merge_events" USING btree ("survivor_organization_id");--> statement-breakpoint
CREATE INDEX "merge_events_absorbed_org_idx" ON "merge_events" USING btree ("absorbed_organization_id");--> statement-breakpoint
CREATE INDEX "merge_events_status_idx" ON "merge_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merge_events_correlation_id_idx" ON "merge_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE TRIGGER import_batches_reject_hard_delete
BEFORE DELETE ON import_batches
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();--> statement-breakpoint
CREATE TRIGGER import_rows_reject_hard_delete
BEFORE DELETE ON import_rows
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();--> statement-breakpoint
CREATE TRIGGER merge_events_reject_hard_delete
BEFORE DELETE ON merge_events
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();