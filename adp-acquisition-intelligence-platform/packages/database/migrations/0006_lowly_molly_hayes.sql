CREATE TYPE "public"."discovery_agenda_status" AS ENUM('generated', 'customized', 'deferred');
--> statement-breakpoint
CREATE TYPE "public"."discovery_answer_status" AS ENUM('answered', 'unknown', 'declined', 'not_applicable', 'not_asked');
--> statement-breakpoint
CREATE TYPE "public"."discovery_answer_type" AS ENUM('text', 'number', 'boolean', 'date', 'datetime', 'single_select', 'multi_select', 'money', 'percentage', 'json');
--> statement-breakpoint
CREATE TYPE "public"."discovery_follow_up_status" AS ENUM('open', 'completed', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."discovery_interpretation_status" AS ENUM('proposed', 'superseded', 'accepted', 'rejected');
--> statement-breakpoint
CREATE TYPE "public"."discovery_mapping_status" AS ENUM('proposed', 'confirmed', 'rejected');
--> statement-breakpoint
CREATE TYPE "public"."discovery_participant_role" AS ENUM('host', 'seller', 'buyer', 'advisor', 'observer');
--> statement-breakpoint
CREATE TYPE "public"."discovery_participant_status" AS ENUM('invited', 'confirmed', 'attended', 'declined', 'no_show');
--> statement-breakpoint
CREATE TYPE "public"."discovery_question_status" AS ENUM('draft', 'published', 'retired');
--> statement-breakpoint
CREATE TYPE "public"."discovery_session_status" AS ENUM('draft', 'prepared', 'scheduled', 'in_progress', 'completed', 'reviewed', 'cancelled', 'no_show', 'incomplete');
--> statement-breakpoint
CREATE TYPE "public"."discovery_template_status" AS ENUM('draft', 'published', 'retired');
--> statement-breakpoint
CREATE TABLE "discovery_agenda_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agenda_id" uuid NOT NULL,
	"question_id" uuid,
	"prompt" text NOT NULL,
	"reason" text NOT NULL,
	"reason_code" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scores_affected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"deferred" boolean DEFAULT false NOT NULL,
	"display_order" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_agenda_items_priority_non_negative" CHECK ("discovery_agenda_items"."priority" >= 0),
	CONSTRAINT "discovery_agenda_items_display_order_non_negative" CHECK ("discovery_agenda_items"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discovery_agendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"template_id" uuid,
	"status" "discovery_agenda_status" DEFAULT 'generated' NOT NULL,
	"motion" text,
	"organization_type" text,
	"contact_type" text,
	"qualification_outcome" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"customizations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_by_user_id" uuid,
	"command_correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"agenda_item_id" uuid,
	"question_id" uuid,
	"participant_id" uuid,
	"answer_type" "discovery_answer_type" NOT NULL,
	"answer_status" "discovery_answer_status" NOT NULL,
	"original_answer" jsonb,
	"transcript_ref" text,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_answers_answered_has_payload" CHECK ("discovery_answers"."answer_status" <> 'answered' or "discovery_answers"."original_answer" is not null)
);
--> statement-breakpoint
CREATE TABLE "discovery_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"answer_id" uuid,
	"mapping_id" uuid,
	"qualification_condition_id" uuid,
	"qualification_review_id" uuid,
	"task_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" "discovery_follow_up_status" DEFAULT 'open' NOT NULL,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_interpretations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"normalized_value" jsonb,
	"variable_definition_id" uuid,
	"variable_definition_version_id" uuid,
	"confidence" integer,
	"rationale" text NOT NULL,
	"status" "discovery_interpretation_status" DEFAULT 'proposed' NOT NULL,
	"proposed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_interpretations_version_positive" CHECK ("discovery_interpretations"."version" > 0),
	CONSTRAINT "discovery_interpretations_confidence_percent" CHECK ("discovery_interpretations"."confidence" is null or ("discovery_interpretations"."confidence" >= 0 and "discovery_interpretations"."confidence" <= 100))
);
--> statement-breakpoint
CREATE TABLE "discovery_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"answer_id" uuid NOT NULL,
	"interpretation_id" uuid,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"variable_definition_id" uuid NOT NULL,
	"variable_definition_version_id" uuid NOT NULL,
	"proposed_typed_value" jsonb NOT NULL,
	"evidence_record_id" uuid,
	"variable_value_id" uuid,
	"status" "discovery_mapping_status" DEFAULT 'proposed' NOT NULL,
	"review_reason" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_mappings_subject_org_or_contact" CHECK (("discovery_mappings"."subject_type" = 'organization' and "discovery_mappings"."organization_id" is not null and "discovery_mappings"."contact_id" is null)
        or ("discovery_mappings"."subject_type" = 'contact' and "discovery_mappings"."contact_id" is not null and "discovery_mappings"."organization_id" is null)),
	CONSTRAINT "discovery_mappings_reviewed_when_terminal" CHECK ("discovery_mappings"."status" = 'proposed' or ("discovery_mappings"."reviewed_by_user_id" is not null and "discovery_mappings"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "discovery_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid,
	"contact_id" uuid,
	"display_name" text NOT NULL,
	"email" text,
	"role" "discovery_participant_role" NOT NULL,
	"status" "discovery_participant_status" DEFAULT 'invited' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_participants_identity_present" CHECK ("discovery_participants"."user_id" is not null or "discovery_participants"."contact_id" is not null or "discovery_participants"."email" is not null)
);
--> statement-breakpoint
CREATE TABLE "discovery_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"prompt" text NOT NULL,
	"help_text" text,
	"answer_type" "discovery_answer_type" NOT NULL,
	"variable_definition_id" uuid,
	"variable_definition_version_id" uuid,
	"score_impact" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_default" boolean DEFAULT false NOT NULL,
	"high_impact" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "discovery_question_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_questions_published_metadata_valid" CHECK ("discovery_questions"."status" <> 'published' or "discovery_questions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "discovery_score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"mapping_id" uuid,
	"subject_type" "subject_type" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"score_key" text NOT NULL,
	"before_score_result_id" uuid,
	"after_score_result_id" uuid,
	"before_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation_movement" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_score_snapshots_duration_non_negative" CHECK ("discovery_score_snapshots"."duration_ms" >= 0),
	CONSTRAINT "discovery_score_snapshots_subject_org_or_contact" CHECK (("discovery_score_snapshots"."subject_type" = 'organization' and "discovery_score_snapshots"."organization_id" is not null and "discovery_score_snapshots"."contact_id" is null)
        or ("discovery_score_snapshots"."subject_type" = 'contact' and "discovery_score_snapshots"."contact_id" is not null and "discovery_score_snapshots"."organization_id" is null))
);
--> statement-breakpoint
CREATE TABLE "discovery_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"agenda_id" uuid,
	"template_id" uuid,
	"status" "discovery_session_status" DEFAULT 'draft' NOT NULL,
	"owner_user_id" uuid,
	"scheduled_start_at" timestamp with time zone,
	"scheduled_end_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"incomplete_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_organization_record_version" integer,
	"command_correlation_id" uuid,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_sessions_record_version_positive" CHECK ("discovery_sessions"."record_version" > 0),
	CONSTRAINT "discovery_sessions_schedule_window_valid" CHECK ("discovery_sessions"."scheduled_end_at" is null or "discovery_sessions"."scheduled_start_at" is null or "discovery_sessions"."scheduled_end_at" > "discovery_sessions"."scheduled_start_at")
);
--> statement-breakpoint
CREATE TABLE "discovery_template_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"rationale" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_template_questions_display_order_non_negative" CHECK ("discovery_template_questions"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discovery_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"motion" text,
	"organization_type" text,
	"contact_type" text,
	"qualification_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendation_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "discovery_template_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_templates_published_metadata_valid" CHECK ("discovery_templates"."status" <> 'published' or "discovery_templates"."published_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "discovery_agenda_items" ADD CONSTRAINT "discovery_agenda_items_agenda_id_discovery_agendas_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."discovery_agendas"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_agenda_items" ADD CONSTRAINT "discovery_agenda_items_question_id_discovery_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."discovery_questions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_agendas" ADD CONSTRAINT "discovery_agendas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_agendas" ADD CONSTRAINT "discovery_agendas_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_agendas" ADD CONSTRAINT "discovery_agendas_template_id_discovery_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."discovery_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_agendas" ADD CONSTRAINT "discovery_agendas_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_answers" ADD CONSTRAINT "discovery_answers_session_id_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_answers" ADD CONSTRAINT "discovery_answers_agenda_item_id_discovery_agenda_items_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."discovery_agenda_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_answers" ADD CONSTRAINT "discovery_answers_question_id_discovery_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."discovery_questions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_answers" ADD CONSTRAINT "discovery_answers_participant_id_discovery_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."discovery_participants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_answers" ADD CONSTRAINT "discovery_answers_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_session_id_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_answer_id_discovery_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."discovery_answers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_mapping_id_discovery_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."discovery_mappings"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_qualification_condition_id_qualification_conditions_id_fk" FOREIGN KEY ("qualification_condition_id") REFERENCES "public"."qualification_conditions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_qualification_review_id_qualification_reviews_id_fk" FOREIGN KEY ("qualification_review_id") REFERENCES "public"."qualification_reviews"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_follow_ups" ADD CONSTRAINT "discovery_follow_ups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_interpretations" ADD CONSTRAINT "discovery_interpretations_answer_id_discovery_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."discovery_answers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_interpretations" ADD CONSTRAINT "discovery_interpretations_variable_definition_id_variable_definitions_id_fk" FOREIGN KEY ("variable_definition_id") REFERENCES "public"."variable_definitions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_interpretations" ADD CONSTRAINT "discovery_interpretations_variable_definition_version_id_variable_definition_versions_id_fk" FOREIGN KEY ("variable_definition_version_id") REFERENCES "public"."variable_definition_versions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_interpretations" ADD CONSTRAINT "discovery_interpretations_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_session_id_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_answer_id_discovery_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."discovery_answers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_interpretation_id_discovery_interpretations_id_fk" FOREIGN KEY ("interpretation_id") REFERENCES "public"."discovery_interpretations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_variable_definition_id_variable_definitions_id_fk" FOREIGN KEY ("variable_definition_id") REFERENCES "public"."variable_definitions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_variable_definition_version_id_variable_definition_versions_id_fk" FOREIGN KEY ("variable_definition_version_id") REFERENCES "public"."variable_definition_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_evidence_record_id_evidence_records_id_fk" FOREIGN KEY ("evidence_record_id") REFERENCES "public"."evidence_records"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_variable_value_id_variable_values_id_fk" FOREIGN KEY ("variable_value_id") REFERENCES "public"."variable_values"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_mappings" ADD CONSTRAINT "discovery_mappings_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_participants" ADD CONSTRAINT "discovery_participants_session_id_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_participants" ADD CONSTRAINT "discovery_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_participants" ADD CONSTRAINT "discovery_participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_questions" ADD CONSTRAINT "discovery_questions_variable_definition_id_variable_definitions_id_fk" FOREIGN KEY ("variable_definition_id") REFERENCES "public"."variable_definitions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_questions" ADD CONSTRAINT "discovery_questions_variable_definition_version_id_variable_definition_versions_id_fk" FOREIGN KEY ("variable_definition_version_id") REFERENCES "public"."variable_definition_versions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_questions" ADD CONSTRAINT "discovery_questions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_score_snapshots" ADD CONSTRAINT "discovery_score_snapshots_session_id_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_score_snapshots" ADD CONSTRAINT "discovery_score_snapshots_mapping_id_discovery_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."discovery_mappings"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_score_snapshots" ADD CONSTRAINT "discovery_score_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_score_snapshots" ADD CONSTRAINT "discovery_score_snapshots_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_score_snapshots" ADD CONSTRAINT "discovery_score_snapshots_before_score_result_id_score_results_id_fk" FOREIGN KEY ("before_score_result_id") REFERENCES "public"."score_results"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_score_snapshots" ADD CONSTRAINT "discovery_score_snapshots_after_score_result_id_score_results_id_fk" FOREIGN KEY ("after_score_result_id") REFERENCES "public"."score_results"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_agenda_id_discovery_agendas_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."discovery_agendas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_template_id_discovery_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."discovery_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_template_questions" ADD CONSTRAINT "discovery_template_questions_template_id_discovery_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."discovery_templates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_template_questions" ADD CONSTRAINT "discovery_template_questions_question_id_discovery_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."discovery_questions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discovery_templates" ADD CONSTRAINT "discovery_templates_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "discovery_agenda_items_agenda_order_idx" ON "discovery_agenda_items" USING btree ("agenda_id","display_order");
--> statement-breakpoint
CREATE INDEX "discovery_agenda_items_question_idx" ON "discovery_agenda_items" USING btree ("question_id");
--> statement-breakpoint
CREATE INDEX "discovery_agendas_org_created_idx" ON "discovery_agendas" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "discovery_agendas_template_idx" ON "discovery_agendas" USING btree ("template_id");
--> statement-breakpoint
CREATE INDEX "discovery_agendas_command_correlation_id_idx" ON "discovery_agendas" USING btree ("command_correlation_id");
--> statement-breakpoint
CREATE INDEX "discovery_answers_session_idx" ON "discovery_answers" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "discovery_answers_question_idx" ON "discovery_answers" USING btree ("question_id");
--> statement-breakpoint
CREATE INDEX "discovery_answers_agenda_item_idx" ON "discovery_answers" USING btree ("agenda_item_id");
--> statement-breakpoint
CREATE INDEX "discovery_follow_ups_session_status_idx" ON "discovery_follow_ups" USING btree ("session_id","status");
--> statement-breakpoint
CREATE INDEX "discovery_follow_ups_org_status_idx" ON "discovery_follow_ups" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_interpretations_answer_version_unique" ON "discovery_interpretations" USING btree ("answer_id","version");
--> statement-breakpoint
CREATE INDEX "discovery_interpretations_answer_status_idx" ON "discovery_interpretations" USING btree ("answer_id","status");
--> statement-breakpoint
CREATE INDEX "discovery_mappings_session_status_idx" ON "discovery_mappings" USING btree ("session_id","status");
--> statement-breakpoint
CREATE INDEX "discovery_mappings_answer_idx" ON "discovery_mappings" USING btree ("answer_id");
--> statement-breakpoint
CREATE INDEX "discovery_mappings_variable_idx" ON "discovery_mappings" USING btree ("variable_definition_id");
--> statement-breakpoint
CREATE INDEX "discovery_participants_session_idx" ON "discovery_participants" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "discovery_participants_contact_idx" ON "discovery_participants" USING btree ("contact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_questions_key_version_unique" ON "discovery_questions" USING btree ("key","version");
--> statement-breakpoint
CREATE INDEX "discovery_questions_status_idx" ON "discovery_questions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "discovery_questions_variable_definition_idx" ON "discovery_questions" USING btree ("variable_definition_id");
--> statement-breakpoint
CREATE INDEX "discovery_score_snapshots_session_idx" ON "discovery_score_snapshots" USING btree ("session_id","created_at");
--> statement-breakpoint
CREATE INDEX "discovery_score_snapshots_score_key_idx" ON "discovery_score_snapshots" USING btree ("score_key");
--> statement-breakpoint
CREATE INDEX "discovery_sessions_org_status_idx" ON "discovery_sessions" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "discovery_sessions_agenda_idx" ON "discovery_sessions" USING btree ("agenda_id");
--> statement-breakpoint
CREATE INDEX "discovery_sessions_owner_status_idx" ON "discovery_sessions" USING btree ("owner_user_id","status");
--> statement-breakpoint
CREATE INDEX "discovery_sessions_command_correlation_id_idx" ON "discovery_sessions" USING btree ("command_correlation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_template_questions_template_question_unique" ON "discovery_template_questions" USING btree ("template_id","question_id");
--> statement-breakpoint
CREATE INDEX "discovery_template_questions_template_order_idx" ON "discovery_template_questions" USING btree ("template_id","display_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_templates_key_version_unique" ON "discovery_templates" USING btree ("key","version");
--> statement-breakpoint
CREATE INDEX "discovery_templates_status_idx" ON "discovery_templates" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "discovery_templates_motion_idx" ON "discovery_templates" USING btree ("motion");
