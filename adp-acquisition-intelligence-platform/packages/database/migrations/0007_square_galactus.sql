CREATE TYPE "public"."campaign_enrollment_status" AS ENUM('pending', 'active', 'paused', 'completed', 'exited', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."message_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."message_draft_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'exported', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outreach_activity_type" AS ENUM('drafted', 'submitted_for_approval', 'approved', 'rejected', 'exported', 'marked_sent', 'response_received', 'permission_blocked', 'sequence_advanced', 'enrollment_paused', 'enrollment_resumed', 'enrollment_exited');--> statement-breakpoint
CREATE TYPE "public"."outreach_definition_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."outreach_next_action_status" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outreach_recipient_status" AS ENUM('active', 'paused', 'opted_out', 'completed');--> statement-breakpoint
CREATE TYPE "public"."outreach_response_classification" AS ENUM('positive', 'negative', 'referral_to_another_contact', 'existing_provider', 'timing_issue', 'needs_information', 'meeting_booked', 'unsubscribe', 'no_longer_relevant', 'out_of_office', 'wrong_contact', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."outreach_sequence_step_status" AS ENUM('pending', 'active', 'completed', 'skipped', 'blocked');--> statement-breakpoint
CREATE TABLE "campaign_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"campaign_version_id" uuid NOT NULL,
	"sequence_version_id" uuid NOT NULL,
	"status" "campaign_enrollment_status" DEFAULT 'pending' NOT NULL,
	"owner_user_id" uuid,
	"current_step_id" uuid,
	"permission_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enrolled_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"exited_at" timestamp with time zone,
	"exit_reason" text,
	"command_correlation_id" uuid,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_enrollments_record_version_positive" CHECK ("campaign_enrollments"."record_version" > 0),
	CONSTRAINT "campaign_enrollments_active_requires_enrolled_at" CHECK ("campaign_enrollments"."status" not in ('active', 'paused', 'completed') or "campaign_enrollments"."enrolled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "message_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"status" "message_approval_status" DEFAULT 'pending' NOT NULL,
	"permission_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_approvals_terminal_requires_decision" CHECK ("message_approvals"."status" = 'pending' or ("message_approvals"."decided_by_user_id" is not null and "message_approvals"."decided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "message_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"sequence_step_id" uuid,
	"template_version_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "message_draft_status" DEFAULT 'draft' NOT NULL,
	"rendered_subject" text,
	"rendered_body" text NOT NULL,
	"context_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permission_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" text NOT NULL,
	"subject_template" text,
	"body_template" text NOT NULL,
	"context_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outreach_definition_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_template_versions_published_metadata_valid" CHECK ("message_template_versions"."status" <> 'published' or "message_template_versions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "outreach_definition_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"draft_id" uuid,
	"activity_type" "outreach_activity_type" NOT NULL,
	"channel" "channel" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"immutable_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permission_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_campaign_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"sequence_version_id" uuid,
	"default_channel" "channel",
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outreach_definition_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_campaign_versions_published_metadata_valid" CHECK ("outreach_campaign_versions"."status" <> 'published' or "outreach_campaign_versions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" "outreach_definition_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_next_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"status" "outreach_next_action_status" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_readiness_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"channel" "channel",
	"ready" boolean NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permission_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "outreach_recipient_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"activity_id" uuid,
	"channel" "channel" NOT NULL,
	"original_text" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sequence_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"status" "outreach_sequence_step_status" DEFAULT 'pending' NOT NULL,
	"advanced_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_version_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"template_version_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"wait_for_response" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_sequence_steps_step_order_positive" CHECK ("outreach_sequence_steps"."step_order" > 0),
	CONSTRAINT "outreach_sequence_steps_delay_non_negative" CHECK ("outreach_sequence_steps"."delay_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outreach_sequence_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outreach_definition_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_sequence_versions_published_metadata_valid" CHECK ("outreach_sequence_versions"."status" <> 'published' or "outreach_sequence_versions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "outreach_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" "outreach_definition_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"classification" "outreach_response_classification" NOT NULL,
	"classified_by_user_id" uuid,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_campaign_version_id_outreach_campaign_versions_id_fk" FOREIGN KEY ("campaign_version_id") REFERENCES "public"."outreach_campaign_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_sequence_version_id_outreach_sequence_versions_id_fk" FOREIGN KEY ("sequence_version_id") REFERENCES "public"."outreach_sequence_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_current_step_id_outreach_sequence_steps_id_fk" FOREIGN KEY ("current_step_id") REFERENCES "public"."outreach_sequence_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_approvals" ADD CONSTRAINT "message_approvals_draft_id_message_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."message_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_approvals" ADD CONSTRAINT "message_approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_enrollment_id_campaign_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_sequence_step_id_outreach_sequence_steps_id_fk" FOREIGN KEY ("sequence_step_id") REFERENCES "public"."outreach_sequence_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_template_version_id_message_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."message_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_template_versions" ADD CONSTRAINT "message_template_versions_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_template_versions" ADD CONSTRAINT "message_template_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_enrollment_id_campaign_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_draft_id_message_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."message_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaign_versions" ADD CONSTRAINT "outreach_campaign_versions_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaign_versions" ADD CONSTRAINT "outreach_campaign_versions_sequence_version_id_outreach_sequence_versions_id_fk" FOREIGN KEY ("sequence_version_id") REFERENCES "public"."outreach_sequence_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaign_versions" ADD CONSTRAINT "outreach_campaign_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_next_actions" ADD CONSTRAINT "outreach_next_actions_enrollment_id_campaign_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_readiness_assessments" ADD CONSTRAINT "outreach_readiness_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_readiness_assessments" ADD CONSTRAINT "outreach_readiness_assessments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_readiness_assessments" ADD CONSTRAINT "outreach_readiness_assessments_assessed_by_user_id_users_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_recipients" ADD CONSTRAINT "outreach_recipients_enrollment_id_campaign_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_recipients" ADD CONSTRAINT "outreach_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_responses" ADD CONSTRAINT "outreach_responses_enrollment_id_campaign_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_responses" ADD CONSTRAINT "outreach_responses_activity_id_outreach_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."outreach_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_history" ADD CONSTRAINT "outreach_sequence_history_enrollment_id_campaign_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_history" ADD CONSTRAINT "outreach_sequence_history_step_id_outreach_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."outreach_sequence_steps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_steps" ADD CONSTRAINT "outreach_sequence_steps_sequence_version_id_outreach_sequence_versions_id_fk" FOREIGN KEY ("sequence_version_id") REFERENCES "public"."outreach_sequence_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_steps" ADD CONSTRAINT "outreach_sequence_steps_template_version_id_message_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."message_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_versions" ADD CONSTRAINT "outreach_sequence_versions_sequence_id_outreach_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_versions" ADD CONSTRAINT "outreach_sequence_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_classifications" ADD CONSTRAINT "response_classifications_response_id_outreach_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."outreach_responses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_classifications" ADD CONSTRAINT "response_classifications_classified_by_user_id_users_id_fk" FOREIGN KEY ("classified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_enrollments_org_status_idx" ON "campaign_enrollments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "campaign_enrollments_contact_idx" ON "campaign_enrollments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "campaign_enrollments_command_correlation_id_idx" ON "campaign_enrollments" USING btree ("command_correlation_id");--> statement-breakpoint
CREATE INDEX "message_approvals_draft_status_idx" ON "message_approvals" USING btree ("draft_id","status");--> statement-breakpoint
CREATE INDEX "message_drafts_enrollment_status_idx" ON "message_drafts" USING btree ("enrollment_id","status");--> statement-breakpoint
CREATE INDEX "message_drafts_template_version_idx" ON "message_drafts" USING btree ("template_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_template_versions_template_version_unique" ON "message_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "message_template_versions_status_idx" ON "message_template_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_key_unique" ON "message_templates" USING btree ("key");--> statement-breakpoint
CREATE INDEX "message_templates_channel_idx" ON "message_templates" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "message_templates_status_idx" ON "message_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outreach_activities_enrollment_occurred_idx" ON "outreach_activities" USING btree ("enrollment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "outreach_activities_type_idx" ON "outreach_activities" USING btree ("activity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_campaign_versions_campaign_version_unique" ON "outreach_campaign_versions" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE INDEX "outreach_campaign_versions_status_idx" ON "outreach_campaign_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_campaigns_key_unique" ON "outreach_campaigns" USING btree ("key");--> statement-breakpoint
CREATE INDEX "outreach_campaigns_status_idx" ON "outreach_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outreach_next_actions_enrollment_status_idx" ON "outreach_next_actions" USING btree ("enrollment_id","status");--> statement-breakpoint
CREATE INDEX "outreach_next_actions_due_idx" ON "outreach_next_actions" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "outreach_readiness_assessments_org_assessed_idx" ON "outreach_readiness_assessments" USING btree ("organization_id","assessed_at");--> statement-breakpoint
CREATE INDEX "outreach_readiness_assessments_contact_idx" ON "outreach_readiness_assessments" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_recipients_enrollment_channel_unique" ON "outreach_recipients" USING btree ("enrollment_id","channel");--> statement-breakpoint
CREATE INDEX "outreach_recipients_contact_idx" ON "outreach_recipients" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "outreach_responses_enrollment_received_idx" ON "outreach_responses" USING btree ("enrollment_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_sequence_history_enrollment_step_unique" ON "outreach_sequence_history" USING btree ("enrollment_id","step_id");--> statement-breakpoint
CREATE INDEX "outreach_sequence_history_enrollment_status_idx" ON "outreach_sequence_history" USING btree ("enrollment_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_sequence_steps_version_order_unique" ON "outreach_sequence_steps" USING btree ("sequence_version_id","step_order");--> statement-breakpoint
CREATE INDEX "outreach_sequence_steps_template_idx" ON "outreach_sequence_steps" USING btree ("template_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_sequence_versions_sequence_version_unique" ON "outreach_sequence_versions" USING btree ("sequence_id","version");--> statement-breakpoint
CREATE INDEX "outreach_sequence_versions_status_idx" ON "outreach_sequence_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_sequences_key_unique" ON "outreach_sequences" USING btree ("key");--> statement-breakpoint
CREATE INDEX "outreach_sequences_status_idx" ON "outreach_sequences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "response_classifications_response_idx" ON "response_classifications" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "response_classifications_classification_idx" ON "response_classifications" USING btree ("classification");