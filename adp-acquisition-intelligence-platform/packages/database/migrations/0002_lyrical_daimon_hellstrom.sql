CREATE TYPE "public"."access_classification" AS ENUM('public', 'authenticated', 'licensed', 'internal', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."confidence_assessment_status" AS ENUM('unassessed', 'provisional', 'assessed');--> statement-breakpoint
CREATE TYPE "public"."confidence_assessment_subject_type" AS ENUM('variable_value', 'evidence_record');--> statement-breakpoint
CREATE TYPE "public"."definition_lifecycle" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."evidence_relationship_type" AS ENUM('supports', 'contradicts', 'verifies', 'contextualizes');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('verified_fact', 'source_derived_fact', 'user_entered_fact', 'calculated', 'ai_inference', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."freshness_result" AS ENUM('fresh', 'expiring', 'stale', 'no_policy', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."observation_lifecycle" AS ENUM('proposed', 'accepted', 'rejected', 'contradicted', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."permission_evidence_subject_type" AS ENUM('contact_channel_permission', 'organization_communication_restriction', 'suppression_entry');--> statement-breakpoint
CREATE TYPE "public"."reviewer_status" AS ENUM('pending', 'approved', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."sensitivity_classification" AS ENUM('public', 'internal', 'confidential', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('company_website', 'public_directory', 'regulatory_record', 'news', 'user_entry', 'import', 'discovery', 'internal_record', 'calculated', 'ai_assisted_extraction', 'other');--> statement-breakpoint
CREATE TYPE "public"."value_lifecycle" AS ENUM('proposed', 'current', 'superseded', 'contradicted', 'stale', 'archived');--> statement-breakpoint
CREATE TYPE "public"."value_status" AS ENUM('known', 'unknown', 'not_applicable', 'withheld', 'contradicted', 'stale');--> statement-breakpoint
CREATE TYPE "public"."variable_data_type" AS ENUM('boolean', 'integer', 'decimal', 'percentage', 'currency', 'string', 'enum', 'date', 'datetime', 'integer_range', 'decimal_range', 'currency_range', 'categorized_list', 'controlled_multiselect', 'ordinal_rubric');--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"source_id" uuid,
	"claim" text NOT NULL,
	"structured_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"source_reliability" numeric(5, 4),
	"specificity" numeric(5, 4),
	"recency" numeric(5, 4),
	"cross_source_agreement" numeric(5, 4),
	"extraction_certainty" numeric(5, 4),
	"reviewer_status" "reviewer_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"content_hash" text NOT NULL,
	"actor_user_id" uuid,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_records_subject_org_or_contact" CHECK (("evidence_records"."subject_type" = 'organization' and "evidence_records"."organization_id" is not null and "evidence_records"."contact_id" is null)
        or ("evidence_records"."subject_type" = 'contact' and "evidence_records"."contact_id" is not null and "evidence_records"."organization_id" is null)),
	CONSTRAINT "evidence_records_effective_window_valid" CHECK ("evidence_records"."expires_at" is null or "evidence_records"."effective_at" is null or "evidence_records"."expires_at" > "evidence_records"."effective_at"),
	CONSTRAINT "evidence_records_reviewed_when_terminal" CHECK ("evidence_records"."reviewer_status" in ('pending', 'needs_review') or "evidence_records"."reviewed_at" is not null),
	CONSTRAINT "evidence_records_source_reliability_unit_interval" CHECK ("evidence_records"."source_reliability" is null or ("evidence_records"."source_reliability" >= 0 and "evidence_records"."source_reliability" <= 1)),
	CONSTRAINT "evidence_records_specificity_unit_interval" CHECK ("evidence_records"."specificity" is null or ("evidence_records"."specificity" >= 0 and "evidence_records"."specificity" <= 1)),
	CONSTRAINT "evidence_records_recency_unit_interval" CHECK ("evidence_records"."recency" is null or ("evidence_records"."recency" >= 0 and "evidence_records"."recency" <= 1)),
	CONSTRAINT "evidence_records_cross_source_agreement_unit_interval" CHECK ("evidence_records"."cross_source_agreement" is null or ("evidence_records"."cross_source_agreement" >= 0 and "evidence_records"."cross_source_agreement" <= 1)),
	CONSTRAINT "evidence_records_extraction_certainty_unit_interval" CHECK ("evidence_records"."extraction_certainty" is null or ("evidence_records"."extraction_certainty" >= 0 and "evidence_records"."extraction_certainty" <= 1))
);
--> statement-breakpoint
CREATE TABLE "permission_evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "permission_evidence_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"evidence_record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"locator" text,
	"publisher" text,
	"default_reliability" numeric(5, 4),
	"access_classification" "access_classification" DEFAULT 'public' NOT NULL,
	"retrieval_restrictions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_default_reliability_unit_interval" CHECK ("sources"."default_reliability" is null or ("sources"."default_reliability" >= 0 and "sources"."default_reliability" <= 1))
);
--> statement-breakpoint
CREATE TABLE "confidence_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "confidence_assessment_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aggregate_score" numeric(5, 4),
	"status" "confidence_assessment_status" DEFAULT 'unassessed' NOT NULL,
	"policy_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "confidence_assessments_aggregate_score_unit_interval" CHECK ("confidence_assessments"."aggregate_score" is null or ("confidence_assessments"."aggregate_score" >= 0 and "confidence_assessments"."aggregate_score" <= 1))
);
--> statement-breakpoint
CREATE TABLE "research_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"claim" text NOT NULL,
	"evidence_id" uuid,
	"proposed_definition_version_id" uuid,
	"proposed_typed_value" jsonb,
	"normalized_interpretation" text,
	"proposing_user_id" uuid,
	"review_user_id" uuid,
	"lifecycle_status" "observation_lifecycle" DEFAULT 'proposed' NOT NULL,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"resulting_variable_value_id" uuid,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_observations_subject_org_or_contact" CHECK (("research_observations"."subject_type" = 'organization' and "research_observations"."organization_id" is not null and "research_observations"."contact_id" is null)
        or ("research_observations"."subject_type" = 'contact' and "research_observations"."contact_id" is not null and "research_observations"."organization_id" is null)),
	CONSTRAINT "research_observations_decision_metadata_valid" CHECK ("research_observations"."lifecycle_status" = 'proposed' or "research_observations"."decided_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "variable_definition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"unit" text,
	"allowed_values" jsonb,
	"range_constraints" jsonb,
	"null_status_semantics" jsonb,
	"collection_methods" jsonb,
	"evidence_requirements" jsonb,
	"confidence_requirements" jsonb,
	"freshness_policy" jsonb,
	"sensitivity" "sensitivity_classification" DEFAULT 'internal' NOT NULL,
	"applicable_workflows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score_consumer_metadata" jsonb,
	"help_text" text,
	"lifecycle_status" "definition_lifecycle" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variable_definition_versions_version_positive" CHECK ("variable_definition_versions"."version" > 0),
	CONSTRAINT "variable_definition_versions_published_when_active" CHECK ("variable_definition_versions"."lifecycle_status" <> 'active' or "variable_definition_versions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "variable_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_label" text NOT NULL,
	"description" text NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"data_type" "variable_data_type" NOT NULL,
	"status" "definition_lifecycle" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variable_definitions_subject_org_or_contact" CHECK ("variable_definitions"."subject_type" in ('organization', 'contact'))
);
--> statement-breakpoint
CREATE TABLE "variable_value_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"relationship_type" "evidence_relationship_type" NOT NULL,
	"contribution_role" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variable_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"variable_definition_id" uuid NOT NULL,
	"definition_version_id" uuid NOT NULL,
	"typed_value" jsonb NOT NULL,
	"normalized_value" jsonb,
	"value_status" "value_status" DEFAULT 'known' NOT NULL,
	"evidence_type" "evidence_type" DEFAULT 'unknown' NOT NULL,
	"confidence_status" "confidence_assessment_status" DEFAULT 'unassessed' NOT NULL,
	"confidence_assessment_id" uuid,
	"lifecycle" "value_lifecycle" DEFAULT 'proposed' NOT NULL,
	"freshness_result" "freshness_result" DEFAULT 'unknown' NOT NULL,
	"effective_at" timestamp with time zone,
	"observed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"source_actor_user_id" uuid,
	"calculation_actor" text,
	"superseded_by_id" uuid,
	"manual_override_flag" boolean DEFAULT false NOT NULL,
	"override_actor" uuid,
	"override_reason_code" text,
	"override_reason_note" text,
	"override_at" timestamp with time zone,
	"original_value_id" uuid,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variable_values_subject_org_or_contact" CHECK (("variable_values"."subject_type" = 'organization' and "variable_values"."organization_id" is not null and "variable_values"."contact_id" is null)
        or ("variable_values"."subject_type" = 'contact' and "variable_values"."contact_id" is not null and "variable_values"."organization_id" is null)),
	CONSTRAINT "variable_values_record_version_positive" CHECK ("variable_values"."record_version" > 0),
	CONSTRAINT "variable_values_effective_window_valid" CHECK ("variable_values"."expires_at" is null or "variable_values"."effective_at" is null or "variable_values"."expires_at" > "variable_values"."effective_at"),
	CONSTRAINT "variable_values_override_metadata_valid" CHECK ("variable_values"."manual_override_flag" = false or ("variable_values"."override_actor" is not null and "variable_values"."override_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."evidence_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_evidence_links" ADD CONSTRAINT "permission_evidence_links_evidence_record_id_evidence_records_id_fk" FOREIGN KEY ("evidence_record_id") REFERENCES "public"."evidence_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_evidence_links" ADD CONSTRAINT "permission_evidence_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_evidence_id_evidence_records_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_proposed_definition_version_id_variable_definition_versions_id_fk" FOREIGN KEY ("proposed_definition_version_id") REFERENCES "public"."variable_definition_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_proposing_user_id_users_id_fk" FOREIGN KEY ("proposing_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_review_user_id_users_id_fk" FOREIGN KEY ("review_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_resulting_variable_value_id_variable_values_id_fk" FOREIGN KEY ("resulting_variable_value_id") REFERENCES "public"."variable_values"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_definition_versions" ADD CONSTRAINT "variable_definition_versions_definition_id_variable_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."variable_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_definition_versions" ADD CONSTRAINT "variable_definition_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_value_evidence" ADD CONSTRAINT "variable_value_evidence_value_id_variable_values_id_fk" FOREIGN KEY ("value_id") REFERENCES "public"."variable_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_value_evidence" ADD CONSTRAINT "variable_value_evidence_evidence_id_evidence_records_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_value_evidence" ADD CONSTRAINT "variable_value_evidence_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_variable_definition_id_variable_definitions_id_fk" FOREIGN KEY ("variable_definition_id") REFERENCES "public"."variable_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_definition_version_id_variable_definition_versions_id_fk" FOREIGN KEY ("definition_version_id") REFERENCES "public"."variable_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_confidence_assessment_id_confidence_assessments_id_fk" FOREIGN KEY ("confidence_assessment_id") REFERENCES "public"."confidence_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_source_actor_user_id_users_id_fk" FOREIGN KEY ("source_actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_override_actor_users_id_fk" FOREIGN KEY ("override_actor") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."variable_values"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_values" ADD CONSTRAINT "variable_values_original_value_fk" FOREIGN KEY ("original_value_id") REFERENCES "public"."variable_values"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_records_content_hash_unique" ON "evidence_records" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "evidence_records_subject_created_idx" ON "evidence_records" USING btree ("subject_type","organization_id","contact_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_records_source_id_idx" ON "evidence_records" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "evidence_records_type_idx" ON "evidence_records" USING btree ("evidence_type");--> statement-breakpoint
CREATE INDEX "evidence_records_reviewer_status_idx" ON "evidence_records" USING btree ("reviewer_status");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_evidence_links_subject_evidence_unique" ON "permission_evidence_links" USING btree ("subject_type","subject_id","evidence_record_id");--> statement-breakpoint
CREATE INDEX "permission_evidence_links_evidence_record_id_idx" ON "permission_evidence_links" USING btree ("evidence_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_locator_unique" ON "sources" USING btree ("locator") WHERE "sources"."locator" is not null;--> statement-breakpoint
CREATE INDEX "sources_source_type_idx" ON "sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "sources_status_idx" ON "sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "confidence_assessments_subject_idx" ON "confidence_assessments" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_observations_correlation_id_unique" ON "research_observations" USING btree ("correlation_id") WHERE "research_observations"."correlation_id" is not null;--> statement-breakpoint
CREATE INDEX "research_observations_subject_idx" ON "research_observations" USING btree ("subject_type","organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "research_observations_lifecycle_status_idx" ON "research_observations" USING btree ("lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "variable_definition_versions_definition_version_unique" ON "variable_definition_versions" USING btree ("definition_id","version");--> statement-breakpoint
CREATE INDEX "variable_definition_versions_definition_id_idx" ON "variable_definition_versions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "variable_definition_versions_lifecycle_status_idx" ON "variable_definition_versions" USING btree ("lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "variable_definitions_key_unique" ON "variable_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "variable_definitions_subject_type_idx" ON "variable_definitions" USING btree ("subject_type");--> statement-breakpoint
CREATE INDEX "variable_definitions_status_idx" ON "variable_definitions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "variable_value_evidence_value_evidence_relationship_unique" ON "variable_value_evidence" USING btree ("value_id","evidence_id","relationship_type");--> statement-breakpoint
CREATE INDEX "variable_value_evidence_evidence_id_idx" ON "variable_value_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variable_values_current_org_definition_unique" ON "variable_values" USING btree ("organization_id","variable_definition_id") WHERE "variable_values"."organization_id" is not null and "variable_values"."lifecycle" = 'current' and "variable_values"."value_status" <> 'contradicted';--> statement-breakpoint
CREATE UNIQUE INDEX "variable_values_current_contact_definition_unique" ON "variable_values" USING btree ("contact_id","variable_definition_id") WHERE "variable_values"."contact_id" is not null and "variable_values"."lifecycle" = 'current' and "variable_values"."value_status" <> 'contradicted';--> statement-breakpoint
CREATE INDEX "variable_values_subject_definition_idx" ON "variable_values" USING btree ("subject_type","organization_id","contact_id","variable_definition_id");--> statement-breakpoint
CREATE INDEX "variable_values_definition_version_id_idx" ON "variable_values" USING btree ("definition_version_id");--> statement-breakpoint
CREATE INDEX "variable_values_lifecycle_idx" ON "variable_values" USING btree ("lifecycle");--> statement-breakpoint
CREATE OR REPLACE FUNCTION adp_reject_evidence_record_material_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.claim IS DISTINCT FROM NEW.claim
    OR OLD.structured_payload IS DISTINCT FROM NEW.structured_payload
    OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
    OR OLD.evidence_type IS DISTINCT FROM NEW.evidence_type THEN
    RAISE EXCEPTION 'evidence_records material evidence fields are immutable after insert.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION adp_reject_active_definition_version_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lifecycle_status = 'active' AND to_jsonb(OLD) <> to_jsonb(NEW) THEN
    RAISE EXCEPTION 'active variable_definition_versions rows are immutable; publish a new version instead.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER evidence_records_reject_material_rewrite
BEFORE UPDATE ON evidence_records
FOR EACH ROW EXECUTE FUNCTION adp_reject_evidence_record_material_rewrite();--> statement-breakpoint
CREATE TRIGGER variable_definition_versions_reject_active_rewrite
BEFORE UPDATE ON variable_definition_versions
FOR EACH ROW EXECUTE FUNCTION adp_reject_active_definition_version_rewrite();