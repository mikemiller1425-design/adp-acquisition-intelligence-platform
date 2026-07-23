CREATE TYPE "public"."scoring_approval_status" AS ENUM('draft_unapproved', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."score_result_status" AS ENUM('final', 'provisional', 'insufficient_data');--> statement-breakpoint
CREATE TYPE "public"."score_recalculation_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "completeness_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"purpose" text NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"status" "definition_lifecycle" DEFAULT 'draft' NOT NULL,
	"approval_status" "scoring_approval_status" DEFAULT 'draft_unapproved' NOT NULL,
	"approval_metadata" jsonb,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completeness_definitions_active_requires_approval" CHECK ("completeness_definitions"."status" <> 'active' or "completeness_definitions"."approval_status" = 'approved')
);
--> statement-breakpoint
CREATE TABLE "completeness_definition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"version" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "definition_lifecycle" DEFAULT 'draft' NOT NULL,
	"approval_status" "scoring_approval_status" DEFAULT 'draft_unapproved' NOT NULL,
	"approval_metadata" jsonb,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completeness_definition_versions_active_requires_approval" CHECK ("completeness_definition_versions"."status" <> 'active' or ("completeness_definition_versions"."approval_status" = 'approved' and "completeness_definition_versions"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "score_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"family" text NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"status" "definition_lifecycle" DEFAULT 'draft' NOT NULL,
	"approval_status" "scoring_approval_status" DEFAULT 'draft_unapproved' NOT NULL,
	"approval_metadata" jsonb,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_definitions_active_requires_approval" CHECK ("score_definitions"."status" <> 'active' or "score_definitions"."approval_status" = 'approved')
);
--> statement-breakpoint
CREATE TABLE "score_definition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"version" text NOT NULL,
	"range_min" numeric(10, 4) DEFAULT '0' NOT NULL,
	"range_max" numeric(10, 4) DEFAULT '100' NOT NULL,
	"minimum_completeness" numeric(5, 4) DEFAULT '0.55' NOT NULL,
	"tiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allow_optional_weight_renormalization" boolean DEFAULT true NOT NULL,
	"status" "definition_lifecycle" DEFAULT 'draft' NOT NULL,
	"approval_status" "scoring_approval_status" DEFAULT 'draft_unapproved' NOT NULL,
	"approval_metadata" jsonb,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_definition_versions_range_valid" CHECK ("score_definition_versions"."range_max" > "score_definition_versions"."range_min"),
	CONSTRAINT "score_definition_versions_min_completeness_unit_interval" CHECK ("score_definition_versions"."minimum_completeness" >= 0 and "score_definition_versions"."minimum_completeness" <= 1),
	CONSTRAINT "score_definition_versions_active_requires_approval" CHECK ("score_definition_versions"."status" <> 'active' or ("score_definition_versions"."approval_status" = 'approved' and "score_definition_versions"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "score_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_definition_version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"variable_definition_id" uuid,
	"variable_definition_version_id" uuid,
	"weight" numeric(8, 6) NOT NULL,
	"transform" text NOT NULL,
	"transform_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"applies_when" jsonb,
	"missing_impact" text DEFAULT 'normal' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_components_weight_unit_interval" CHECK ("score_components"."weight" > 0 and "score_components"."weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "score_input_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_definition_id" uuid NOT NULL,
	"score_definition_version_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"normalized_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"value_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"definition_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"definition_digest" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_input_snapshots_subject_org_or_contact" CHECK (("score_input_snapshots"."subject_type" = 'organization' and "score_input_snapshots"."organization_id" is not null and "score_input_snapshots"."contact_id" is null)
        or ("score_input_snapshots"."subject_type" = 'contact' and "score_input_snapshots"."contact_id" is not null and "score_input_snapshots"."organization_id" is null))
);
--> statement-breakpoint
CREATE TABLE "completeness_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"completeness_definition_id" uuid NOT NULL,
	"completeness_definition_version_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"purpose" text NOT NULL,
	"aggregate" numeric(5, 4),
	"status" "score_result_status" NOT NULL,
	"missing_required" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_snapshot_id" uuid,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completeness_results_aggregate_unit_interval" CHECK ("completeness_results"."aggregate" is null or ("completeness_results"."aggregate" >= 0 and "completeness_results"."aggregate" <= 1)),
	CONSTRAINT "completeness_results_subject_org_or_contact" CHECK (("completeness_results"."subject_type" = 'organization' and "completeness_results"."organization_id" is not null and "completeness_results"."contact_id" is null)
        or ("completeness_results"."subject_type" = 'contact' and "completeness_results"."contact_id" is not null and "completeness_results"."organization_id" is null))
);
--> statement-breakpoint
CREATE TABLE "score_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_definition_id" uuid NOT NULL,
	"score_definition_version_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"input_snapshot_id" uuid NOT NULL,
	"status" "score_result_status" NOT NULL,
	"score" numeric(10, 4),
	"tier" text,
	"confidence" numeric(5, 4),
	"completeness" numeric(5, 4),
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation" jsonb,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculation_duration_ms" integer DEFAULT 0 NOT NULL,
	"previous_score_result_id" uuid,
	"override_recommendation" jsonb,
	"override_actor_user_id" uuid,
	"override_reason_code" text,
	"override_reason_note" text,
	"override_at" timestamp with time zone,
	CONSTRAINT "score_results_confidence_unit_interval" CHECK ("score_results"."confidence" is null or ("score_results"."confidence" >= 0 and "score_results"."confidence" <= 1)),
	CONSTRAINT "score_results_completeness_unit_interval" CHECK ("score_results"."completeness" is null or ("score_results"."completeness" >= 0 and "score_results"."completeness" <= 1)),
	CONSTRAINT "score_results_subject_org_or_contact" CHECK (("score_results"."subject_type" = 'organization' and "score_results"."organization_id" is not null and "score_results"."contact_id" is null)
        or ("score_results"."subject_type" = 'contact' and "score_results"."contact_id" is not null and "score_results"."organization_id" is null)),
	CONSTRAINT "score_results_override_metadata_valid" CHECK ("score_results"."override_recommendation" is null or ("score_results"."override_actor_user_id" is not null and "score_results"."override_reason_code" is not null and "score_results"."override_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "score_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_result_id" uuid NOT NULL,
	"component_key" text NOT NULL,
	"variable_value_id" uuid,
	"raw_value" jsonb,
	"normalized_value" jsonb,
	"transformed_score" numeric(10, 4),
	"weight" numeric(8, 6) NOT NULL,
	"contribution" numeric(10, 4),
	"status" text NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_factors_transformed_score_range" CHECK ("score_factors"."transformed_score" is null or ("score_factors"."transformed_score" >= 0 and "score_factors"."transformed_score" <= 100))
);
--> statement-breakpoint
CREATE TABLE "score_recalculation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"event_type" text NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"score_key" text,
	"status" "score_recalculation_job_status" DEFAULT 'pending' NOT NULL,
	"result_id" uuid,
	"previous_result_id" uuid,
	"error_message" text,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "score_recalculation_jobs_subject_org_or_contact" CHECK (("score_recalculation_jobs"."subject_type" = 'organization' and "score_recalculation_jobs"."organization_id" is not null and "score_recalculation_jobs"."contact_id" is null)
        or ("score_recalculation_jobs"."subject_type" = 'contact' and "score_recalculation_jobs"."contact_id" is not null and "score_recalculation_jobs"."organization_id" is null))
);
--> statement-breakpoint
ALTER TABLE "completeness_definition_versions" ADD CONSTRAINT "completeness_definition_versions_definition_id_completeness_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."completeness_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_definition_versions" ADD CONSTRAINT "completeness_definition_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_definition_versions" ADD CONSTRAINT "score_definition_versions_definition_id_score_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."score_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_definition_versions" ADD CONSTRAINT "score_definition_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_score_definition_version_id_score_definition_versions_id_fk" FOREIGN KEY ("score_definition_version_id") REFERENCES "public"."score_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_variable_definition_id_variable_definitions_id_fk" FOREIGN KEY ("variable_definition_id") REFERENCES "public"."variable_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_variable_definition_version_id_variable_definition_versions_id_fk" FOREIGN KEY ("variable_definition_version_id") REFERENCES "public"."variable_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_input_snapshots" ADD CONSTRAINT "score_input_snapshots_score_definition_id_score_definitions_id_fk" FOREIGN KEY ("score_definition_id") REFERENCES "public"."score_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_input_snapshots" ADD CONSTRAINT "score_input_snapshots_score_definition_version_id_score_definition_versions_id_fk" FOREIGN KEY ("score_definition_version_id") REFERENCES "public"."score_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_input_snapshots" ADD CONSTRAINT "score_input_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_input_snapshots" ADD CONSTRAINT "score_input_snapshots_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_results" ADD CONSTRAINT "completeness_results_completeness_definition_id_completeness_definitions_id_fk" FOREIGN KEY ("completeness_definition_id") REFERENCES "public"."completeness_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_results" ADD CONSTRAINT "completeness_results_completeness_definition_version_id_completeness_definition_versions_id_fk" FOREIGN KEY ("completeness_definition_version_id") REFERENCES "public"."completeness_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_results" ADD CONSTRAINT "completeness_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_results" ADD CONSTRAINT "completeness_results_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_results" ADD CONSTRAINT "completeness_results_input_snapshot_id_score_input_snapshots_id_fk" FOREIGN KEY ("input_snapshot_id") REFERENCES "public"."score_input_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_score_definition_id_score_definitions_id_fk" FOREIGN KEY ("score_definition_id") REFERENCES "public"."score_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_score_definition_version_id_score_definition_versions_id_fk" FOREIGN KEY ("score_definition_version_id") REFERENCES "public"."score_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_input_snapshot_id_score_input_snapshots_id_fk" FOREIGN KEY ("input_snapshot_id") REFERENCES "public"."score_input_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_previous_result_fk" FOREIGN KEY ("previous_score_result_id") REFERENCES "public"."score_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_results" ADD CONSTRAINT "score_results_override_actor_user_id_users_id_fk" FOREIGN KEY ("override_actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_factors" ADD CONSTRAINT "score_factors_score_result_id_score_results_id_fk" FOREIGN KEY ("score_result_id") REFERENCES "public"."score_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_factors" ADD CONSTRAINT "score_factors_variable_value_id_variable_values_id_fk" FOREIGN KEY ("variable_value_id") REFERENCES "public"."variable_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_recalculation_jobs" ADD CONSTRAINT "score_recalculation_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_recalculation_jobs" ADD CONSTRAINT "score_recalculation_jobs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_recalculation_jobs" ADD CONSTRAINT "score_recalculation_jobs_result_id_score_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."score_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_recalculation_jobs" ADD CONSTRAINT "score_recalculation_jobs_previous_result_id_score_results_id_fk" FOREIGN KEY ("previous_result_id") REFERENCES "public"."score_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "completeness_definitions_key_unique" ON "completeness_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "completeness_definitions_status_idx" ON "completeness_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "completeness_definitions_subject_type_idx" ON "completeness_definitions" USING btree ("subject_type");--> statement-breakpoint
CREATE UNIQUE INDEX "completeness_definition_versions_definition_version_unique" ON "completeness_definition_versions" USING btree ("definition_id","version");--> statement-breakpoint
CREATE INDEX "completeness_definition_versions_definition_id_idx" ON "completeness_definition_versions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "completeness_definition_versions_status_idx" ON "completeness_definition_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "score_definitions_key_unique" ON "score_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "score_definitions_status_idx" ON "score_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "score_definitions_subject_type_idx" ON "score_definitions" USING btree ("subject_type");--> statement-breakpoint
CREATE UNIQUE INDEX "score_definition_versions_definition_version_unique" ON "score_definition_versions" USING btree ("definition_id","version");--> statement-breakpoint
CREATE INDEX "score_definition_versions_definition_id_idx" ON "score_definition_versions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "score_definition_versions_status_idx" ON "score_definition_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "score_components_version_key_unique" ON "score_components" USING btree ("score_definition_version_id","key");--> statement-breakpoint
CREATE INDEX "score_components_version_id_idx" ON "score_components" USING btree ("score_definition_version_id");--> statement-breakpoint
CREATE INDEX "score_components_variable_definition_id_idx" ON "score_components" USING btree ("variable_definition_id");--> statement-breakpoint
CREATE INDEX "score_input_snapshots_subject_idx" ON "score_input_snapshots" USING btree ("subject_type","organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "score_input_snapshots_score_version_idx" ON "score_input_snapshots" USING btree ("score_definition_version_id");--> statement-breakpoint
CREATE INDEX "completeness_results_subject_idx" ON "completeness_results" USING btree ("subject_type","organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "completeness_results_definition_version_idx" ON "completeness_results" USING btree ("completeness_definition_version_id");--> statement-breakpoint
CREATE INDEX "score_results_subject_idx" ON "score_results" USING btree ("subject_type","organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "score_results_definition_version_idx" ON "score_results" USING btree ("score_definition_version_id");--> statement-breakpoint
CREATE INDEX "score_results_calculated_at_idx" ON "score_results" USING btree ("calculated_at");--> statement-breakpoint
CREATE INDEX "score_factors_result_id_idx" ON "score_factors" USING btree ("score_result_id");--> statement-breakpoint
CREATE INDEX "score_factors_component_key_idx" ON "score_factors" USING btree ("component_key");--> statement-breakpoint
CREATE UNIQUE INDEX "score_recalculation_jobs_idempotency_key_unique" ON "score_recalculation_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "score_recalculation_jobs_status_idx" ON "score_recalculation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "score_recalculation_jobs_subject_idx" ON "score_recalculation_jobs" USING btree ("subject_type","organization_id","contact_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION adp_reject_unapproved_scoring_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'scoring definition activation requires approval_status=approved.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION adp_reject_active_scoring_version_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active'
    AND NEW.status <> OLD.status
    AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'active scoring definition versions can only transition to retired.'
      USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'active'
    AND (to_jsonb(OLD) - 'status') <> (to_jsonb(NEW) - 'status') THEN
    RAISE EXCEPTION 'active scoring definition version material fields are immutable; publish a new version instead.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER completeness_definitions_reject_unapproved_activation
BEFORE INSERT OR UPDATE ON completeness_definitions
FOR EACH ROW EXECUTE FUNCTION adp_reject_unapproved_scoring_activation();--> statement-breakpoint
CREATE TRIGGER completeness_definition_versions_reject_unapproved_activation
BEFORE INSERT OR UPDATE ON completeness_definition_versions
FOR EACH ROW EXECUTE FUNCTION adp_reject_unapproved_scoring_activation();--> statement-breakpoint
CREATE TRIGGER score_definitions_reject_unapproved_activation
BEFORE INSERT OR UPDATE ON score_definitions
FOR EACH ROW EXECUTE FUNCTION adp_reject_unapproved_scoring_activation();--> statement-breakpoint
CREATE TRIGGER score_definition_versions_reject_unapproved_activation
BEFORE INSERT OR UPDATE ON score_definition_versions
FOR EACH ROW EXECUTE FUNCTION adp_reject_unapproved_scoring_activation();--> statement-breakpoint
CREATE TRIGGER completeness_definition_versions_reject_active_rewrite
BEFORE UPDATE ON completeness_definition_versions
FOR EACH ROW EXECUTE FUNCTION adp_reject_active_scoring_version_rewrite();--> statement-breakpoint
CREATE TRIGGER score_definition_versions_reject_active_rewrite
BEFORE UPDATE ON score_definition_versions
FOR EACH ROW EXECUTE FUNCTION adp_reject_active_scoring_version_rewrite();--> statement-breakpoint
CREATE TRIGGER completeness_results_append_only
BEFORE UPDATE OR DELETE ON completeness_results
FOR EACH ROW EXECUTE FUNCTION adp_reject_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER score_input_snapshots_append_only
BEFORE UPDATE OR DELETE ON score_input_snapshots
FOR EACH ROW EXECUTE FUNCTION adp_reject_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER score_results_append_only
BEFORE UPDATE OR DELETE ON score_results
FOR EACH ROW EXECUTE FUNCTION adp_reject_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER score_factors_append_only
BEFORE UPDATE OR DELETE ON score_factors
FOR EACH ROW EXECUTE FUNCTION adp_reject_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER score_recalculation_jobs_reject_hard_delete
BEFORE DELETE ON score_recalculation_jobs
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();
