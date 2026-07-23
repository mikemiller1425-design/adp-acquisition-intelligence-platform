CREATE TYPE "public"."opportunity_contact_role" AS ENUM('economic_buyer', 'champion', 'influencer', 'technical_evaluator', 'legal_procurement', 'operations_contact', 'executive_sponsor', 'other');--> statement-breakpoint
CREATE TYPE "public"."opportunity_loss_reason_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."opportunity_next_action_status" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."opportunity_outcome_type" AS ENUM('won', 'lost', 'nurture');--> statement-breakpoint
CREATE TYPE "public"."opportunity_probability_source" AS ENUM('manual', 'stage_default');--> statement-breakpoint
CREATE TYPE "public"."opportunity_risk_flag_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage_definition_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"primary_motion" text NOT NULL,
	"opportunity_stage" "opportunity_stage" DEFAULT 'open' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_user_id" uuid,
	"record_status" "record_status" DEFAULT 'active' NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"human_confirmation_at" timestamp with time zone,
	"human_confirmed_by_user_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_record_version_positive" CHECK ("opportunities"."record_version" > 0),
	CONSTRAINT "opportunities_human_confirmation_required" CHECK ("opportunities"."human_confirmation_at" is not null and "opportunities"."human_confirmed_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "opportunity_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" "opportunity_contact_role" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_context_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"linked_subject_type" "subject_type" NOT NULL,
	"linked_subject_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_eligibility_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"motion" text NOT NULL,
	"eligible" boolean NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessed_by_user_id" uuid,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"field_name" text,
	"prior_value" jsonb,
	"new_value" jsonb,
	"actor_user_id" uuid,
	"command_correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_loss_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "opportunity_loss_reason_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_next_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" "opportunity_next_action_status" DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" uuid,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"outcome_type" "opportunity_outcome_type" NOT NULL,
	"loss_reason_id" uuid,
	"prior_stage" "opportunity_stage",
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by_user_id" uuid,
	"notes" text,
	"superseded_at" timestamp with time zone,
	"superseded_by_outcome_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_outcomes_loss_reason_required" CHECK ("opportunity_outcomes"."outcome_type" <> 'lost' or "opportunity_outcomes"."loss_reason_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "opportunity_probabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"probability" numeric(5, 2),
	"source" "opportunity_probability_source" NOT NULL,
	"stage_key" "opportunity_stage",
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"set_by_user_id" uuid,
	"reason_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_probabilities_range_valid" CHECK ("opportunity_probabilities"."probability" is null or ("opportunity_probabilities"."probability" >= 0 and "opportunity_probabilities"."probability" <= 100))
);
--> statement-breakpoint
CREATE TABLE "opportunity_risk_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"description" text NOT NULL,
	"status" "opportunity_risk_flag_status" DEFAULT 'open' NOT NULL,
	"raised_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_stage_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_key" "opportunity_stage" NOT NULL,
	"version" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"default_probability" numeric(5, 2),
	"entry_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exit_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_age_days" integer,
	"status" "opportunity_stage_definition_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_stage" "opportunity_stage",
	"to_stage" "opportunity_stage" NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"reason_code" text,
	"reason_note" text,
	"command_correlation_id" uuid,
	"validation_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exception_authorized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_stage_transitions_value_changed" CHECK ("opportunity_stage_transitions"."from_stage" is null or "opportunity_stage_transitions"."from_stage" <> "opportunity_stage_transitions"."to_stage")
);
--> statement-breakpoint
CREATE TABLE "opportunity_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"amount" numeric(18, 2),
	"currency" text,
	"value_band" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"set_by_user_id" uuid,
	"reason_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_values_currency_required_when_amount" CHECK ("opportunity_values"."amount" is null or ("opportunity_values"."currency" is not null and length(trim("opportunity_values"."currency")) > 0))
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_human_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("human_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_contacts" ADD CONSTRAINT "opportunity_contacts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_contacts" ADD CONSTRAINT "opportunity_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_contacts" ADD CONSTRAINT "opportunity_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_context_links" ADD CONSTRAINT "opportunity_context_links_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_eligibility_assessments" ADD CONSTRAINT "opportunity_eligibility_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_eligibility_assessments" ADD CONSTRAINT "opportunity_eligibility_assessments_assessed_by_user_id_users_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_history" ADD CONSTRAINT "opportunity_history_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_history" ADD CONSTRAINT "opportunity_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_next_actions" ADD CONSTRAINT "opportunity_next_actions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_next_actions" ADD CONSTRAINT "opportunity_next_actions_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_next_actions" ADD CONSTRAINT "opportunity_next_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_outcomes" ADD CONSTRAINT "opportunity_outcomes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_outcomes" ADD CONSTRAINT "opportunity_outcomes_loss_reason_id_opportunity_loss_reasons_id_fk" FOREIGN KEY ("loss_reason_id") REFERENCES "public"."opportunity_loss_reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_outcomes" ADD CONSTRAINT "opportunity_outcomes_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_probabilities" ADD CONSTRAINT "opportunity_probabilities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_probabilities" ADD CONSTRAINT "opportunity_probabilities_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_risk_flags" ADD CONSTRAINT "opportunity_risk_flags_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_risk_flags" ADD CONSTRAINT "opportunity_risk_flags_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_risk_flags" ADD CONSTRAINT "opportunity_risk_flags_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_definitions" ADD CONSTRAINT "opportunity_stage_definitions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_transitions" ADD CONSTRAINT "opportunity_stage_transitions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_transitions" ADD CONSTRAINT "opportunity_stage_transitions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_values" ADD CONSTRAINT "opportunity_values_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_values" ADD CONSTRAINT "opportunity_values_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_organization_idx" ON "opportunities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "opportunities_stage_idx" ON "opportunities" USING btree ("opportunity_stage");--> statement-breakpoint
CREATE INDEX "opportunities_owner_idx" ON "opportunities" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "opportunities_motion_idx" ON "opportunities" USING btree ("primary_motion");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_org_motion_active_unique" ON "opportunities" USING btree ("organization_id","primary_motion") WHERE "opportunities"."opportunity_stage" not in ('won', 'lost');--> statement-breakpoint
CREATE INDEX "opportunity_contacts_opportunity_idx" ON "opportunity_contacts" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunity_contacts_contact_idx" ON "opportunity_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_contacts_active_role_unique" ON "opportunity_contacts" USING btree ("opportunity_id","contact_id","role") WHERE "opportunity_contacts"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_context_links_unique" ON "opportunity_context_links" USING btree ("opportunity_id","link_type","linked_subject_id");--> statement-breakpoint
CREATE INDEX "opportunity_context_links_subject_idx" ON "opportunity_context_links" USING btree ("linked_subject_type","linked_subject_id");--> statement-breakpoint
CREATE INDEX "opportunity_eligibility_org_motion_assessed_idx" ON "opportunity_eligibility_assessments" USING btree ("organization_id","motion","assessed_at");--> statement-breakpoint
CREATE INDEX "opportunity_history_opportunity_created_idx" ON "opportunity_history" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_loss_reasons_key_unique" ON "opportunity_loss_reasons" USING btree ("key");--> statement-breakpoint
CREATE INDEX "opportunity_loss_reasons_status_idx" ON "opportunity_loss_reasons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opportunity_next_actions_opportunity_status_idx" ON "opportunity_next_actions" USING btree ("opportunity_id","status");--> statement-breakpoint
CREATE INDEX "opportunity_next_actions_due_idx" ON "opportunity_next_actions" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "opportunity_outcomes_opportunity_created_idx" ON "opportunity_outcomes" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunity_outcomes_current_idx" ON "opportunity_outcomes" USING btree ("opportunity_id") WHERE "opportunity_outcomes"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "opportunity_probabilities_opportunity_effective_idx" ON "opportunity_probabilities" USING btree ("opportunity_id","effective_from");--> statement-breakpoint
CREATE INDEX "opportunity_risk_flags_opportunity_status_idx" ON "opportunity_risk_flags" USING btree ("opportunity_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_risk_flags_open_key_unique" ON "opportunity_risk_flags" USING btree ("opportunity_id","flag_key") WHERE "opportunity_risk_flags"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_stage_definitions_key_version_unique" ON "opportunity_stage_definitions" USING btree ("stage_key","version");--> statement-breakpoint
CREATE INDEX "opportunity_stage_definitions_status_idx" ON "opportunity_stage_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opportunity_stage_transitions_opportunity_created_idx" ON "opportunity_stage_transitions" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunity_stage_transitions_correlation_idx" ON "opportunity_stage_transitions" USING btree ("command_correlation_id");--> statement-breakpoint
CREATE INDEX "opportunity_values_opportunity_effective_idx" ON "opportunity_values" USING btree ("opportunity_id","effective_from");