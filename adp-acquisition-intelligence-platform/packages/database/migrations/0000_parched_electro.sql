CREATE TYPE "public"."actor_type" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('email', 'phone', 'voicemail', 'linkedin', 'internal_introduction', 'meeting', 'manual_follow_up');--> statement-breakpoint
CREATE TYPE "public"."configuration_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."contact_role_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."data_freshness_status" AS ENUM('current', 'aging', 'stale', 'mixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."location_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."operational_dimension" AS ENUM('prospect_stage', 'research_status', 'outreach_status', 'data_freshness_status', 'opportunity_stage');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('open', 'discovery_validation', 'solution_alignment', 'commercial_review', 'won', 'lost', 'nurture');--> statement-breakpoint
CREATE TYPE "public"."organization_role_status" AS ENUM('assigned', 'retired');--> statement-breakpoint
CREATE TYPE "public"."outbox_event_status" AS ENUM('pending', 'published', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."outreach_status" AS ENUM('not_started', 'ready', 'active', 'waiting_response', 'paused', 'completed', 'blocked_restriction', 'do_not_contact');--> statement-breakpoint
CREATE TYPE "public"."permission_scope" AS ENUM('contact_channel', 'organization', 'organization_channel', 'global', 'global_channel');--> statement-breakpoint
CREATE TYPE "public"."permission_source" AS ENUM('user_asserted', 'import', 'discovery', 'response_unsubscribe', 'admin', 'policy', 'system');--> statement-breakpoint
CREATE TYPE "public"."permission_state" AS ENUM('allowed', 'unknown', 'restricted', 'opted_out', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."prospect_stage" AS ENUM('raw', 'normalization', 'research', 'scored', 'review', 'research_required', 'qualified', 'discovery_scheduled', 'discovery_completed', 'outreach_ready', 'outreach_active', 'opportunity', 'nurture', 'disqualified', 'duplicate', 'existing_relationship', 'out_of_territory');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('not_started', 'in_progress', 'gaps_open', 'awaiting_review', 'sufficient_for_purpose', 'blocked_conflict', 'paused');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('organization', 'opportunity', 'contact', 'user', 'system');--> statement-breakpoint
CREATE TYPE "public"."tag_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."territory_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "account_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"territory_id" uuid NOT NULL,
	"assignment_role" text DEFAULT 'owner' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"assigned_by_user_id" uuid,
	"reason_code" text,
	"reason_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_assignments_effective_window_valid" CHECK ("account_assignments"."effective_to" is null or "account_assignments"."effective_to" > "account_assignments"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid,
	"organization_id" uuid,
	"contact_id" uuid,
	"command_correlation_id" uuid,
	"before_data" jsonb,
	"after_data" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_user_actor_has_user" CHECK ("audit_events"."actor_type" <> 'user' or "audit_events"."actor_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" "subject_type" NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outbox_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempts_non_negative" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contact_channel_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"state" "permission_state" NOT NULL,
	"source" "permission_source" NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"captured_by_user_id" uuid,
	"reason_code" text,
	"reason_note" text,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ccp_effective_window_valid" CHECK ("contact_channel_permissions"."expires_at" is null or "contact_channel_permissions"."expires_at" > "contact_channel_permissions"."effective_at"),
	CONSTRAINT "ccp_revoked_window_valid" CHECK ("contact_channel_permissions"."revoked_at" is null or "contact_channel_permissions"."revoked_at" >= "contact_channel_permissions"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "organization_communication_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel" "channel",
	"state" "permission_state" NOT NULL,
	"source" "permission_source" NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"captured_by_user_id" uuid,
	"reason_code" text,
	"reason_note" text,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ocr_effective_window_valid" CHECK ("organization_communication_restrictions"."expires_at" is null or "organization_communication_restrictions"."expires_at" > "organization_communication_restrictions"."effective_at"),
	CONSTRAINT "ocr_revoked_window_valid" CHECK ("organization_communication_restrictions"."revoked_at" is null or "organization_communication_restrictions"."revoked_at" >= "organization_communication_restrictions"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "suppression_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "permission_scope" NOT NULL,
	"channel" "channel",
	"contact_id" uuid,
	"organization_id" uuid,
	"identifier_type" text,
	"identifier_hash" text,
	"state" "permission_state" NOT NULL,
	"source" "permission_source" NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"captured_by_user_id" uuid,
	"reason_code" text,
	"reason_note" text,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppress_contact_channel_scope_valid" CHECK ("suppression_entries"."scope" <> 'contact_channel' or ("suppression_entries"."contact_id" is not null and "suppression_entries"."channel" is not null)),
	CONSTRAINT "suppress_organization_scope_valid" CHECK ("suppression_entries"."scope" <> 'organization' or ("suppression_entries"."organization_id" is not null and "suppression_entries"."channel" is null)),
	CONSTRAINT "suppress_organization_channel_scope_valid" CHECK ("suppression_entries"."scope" <> 'organization_channel' or ("suppression_entries"."organization_id" is not null and "suppression_entries"."channel" is not null)),
	CONSTRAINT "suppress_global_channel_scope_valid" CHECK ("suppression_entries"."scope" <> 'global_channel' or "suppression_entries"."channel" is not null),
	CONSTRAINT "suppress_identifier_pair_valid" CHECK (("suppression_entries"."identifier_type" is null and "suppression_entries"."identifier_hash" is null) or ("suppression_entries"."identifier_type" is not null and "suppression_entries"."identifier_hash" is not null)),
	CONSTRAINT "suppress_effective_window_valid" CHECK ("suppression_entries"."expires_at" is null or "suppression_entries"."expires_at" > "suppression_entries"."effective_at"),
	CONSTRAINT "suppress_revoked_window_valid" CHECK ("suppression_entries"."revoked_at" is null or "suppression_entries"."revoked_at" >= "suppression_entries"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"status" "configuration_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "configuration_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_subject_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operational_state_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"dimension" "operational_dimension" NOT NULL,
	"from_value" text,
	"to_value" text NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"reason_code" text,
	"reason_note" text,
	"command_correlation_id" uuid,
	"validation_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exception_authorized" boolean DEFAULT false NOT NULL,
	"related_review_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_state_transitions_value_changed" CHECK ("operational_state_transitions"."from_value" is null or "operational_state_transitions"."from_value" <> "operational_state_transitions"."to_value")
);
--> statement-breakpoint
CREATE TABLE "contact_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"role_key" text NOT NULL,
	"role_name" text NOT NULL,
	"seniority" text,
	"status" "contact_role_status" DEFAULT 'active' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_roles_effective_window_valid" CHECK ("contact_roles"."effective_to" is null or "contact_roles"."effective_to" > "contact_roles"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"primary_location_id" uuid,
	"first_name" text,
	"last_name" text,
	"display_name" text NOT NULL,
	"title" text,
	"email" text,
	"normalized_email" text,
	"phone" text,
	"normalized_phone" text,
	"linkedin_url" text,
	"status" "contact_status" DEFAULT 'active' NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"archived_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "contacts_record_version_positive" CHECK ("contacts"."record_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"alias_name" text NOT NULL,
	"normalized_alias_name" text NOT NULL,
	"source" text,
	"record_status" "record_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"territory_id" uuid,
	"name" text,
	"location_status" "location_status" DEFAULT 'active' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country_code" text,
	"phone" text,
	"normalized_phone" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"role_name" text NOT NULL,
	"status" "organization_role_status" DEFAULT 'assigned' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_roles_effective_window_valid" CHECK ("organization_roles"."effective_to" is null or "organization_roles"."effective_to" > "organization_roles"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"domain" text,
	"normalized_domain" text,
	"firm_type" text,
	"prospect_stage" "prospect_stage" DEFAULT 'raw' NOT NULL,
	"research_status" "research_status" DEFAULT 'not_started' NOT NULL,
	"outreach_status" "outreach_status" DEFAULT 'not_started' NOT NULL,
	"data_freshness_status" "data_freshness_status" DEFAULT 'unknown' NOT NULL,
	"record_status" "record_status" DEFAULT 'active' NOT NULL,
	"existing_relationship_flag" boolean DEFAULT false NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"archived_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "organizations_record_version_positive" CHECK ("organizations"."record_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_territory_id" uuid,
	"status" "territory_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"body" text NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "taggings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"status" "tag_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"assigned_to_user_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tasks_priority_non_negative" CHECK ("tasks"."priority" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account_assignments" ADD CONSTRAINT "account_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_assignments" ADD CONSTRAINT "account_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_assignments" ADD CONSTRAINT "account_assignments_territory_id_territories_id_fk" FOREIGN KEY ("territory_id") REFERENCES "public"."territories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_assignments" ADD CONSTRAINT "account_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_channel_permissions" ADD CONSTRAINT "contact_channel_permissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_channel_permissions" ADD CONSTRAINT "contact_channel_permissions_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_channel_permissions" ADD CONSTRAINT "contact_channel_permissions_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."contact_channel_permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_communication_restrictions" ADD CONSTRAINT "ocr_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_communication_restrictions" ADD CONSTRAINT "ocr_captured_by_user_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_communication_restrictions" ADD CONSTRAINT "org_comm_restrictions_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."organization_communication_restrictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."suppression_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_state_transitions" ADD CONSTRAINT "operational_state_transitions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_location_id_organization_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."organization_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_primary_location_id_organization_locations_id_fk" FOREIGN KEY ("primary_location_id") REFERENCES "public"."organization_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_aliases" ADD CONSTRAINT "organization_aliases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_aliases" ADD CONSTRAINT "organization_aliases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_locations" ADD CONSTRAINT "organization_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_locations" ADD CONSTRAINT "organization_locations_territory_id_territories_id_fk" FOREIGN KEY ("territory_id") REFERENCES "public"."territories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_locations" ADD CONSTRAINT "organization_locations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_locations" ADD CONSTRAINT "organization_locations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_parent_territory_id_territories_id_fk" FOREIGN KEY ("parent_territory_id") REFERENCES "public"."territories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taggings" ADD CONSTRAINT "taggings_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taggings" ADD CONSTRAINT "taggings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_assignments_current_org_role_unique" ON "account_assignments" USING btree ("organization_id","assignment_role") WHERE "account_assignments"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "account_assignments_user_id_idx" ON "account_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_assignments_territory_id_idx" ON "account_assignments" USING btree ("territory_id");--> statement-breakpoint
CREATE INDEX "account_assignments_effective_window_idx" ON "account_assignments" USING btree ("organization_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_organization_id_idx" ON "audit_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_contact_id_idx" ON "audit_events" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_command_correlation_id_idx" ON "audit_events" USING btree ("command_correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_idempotency_key_unique" ON "outbox_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_events_event_type_idx" ON "outbox_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ccp_current_contact_channel_unique" ON "contact_channel_permissions" USING btree ("contact_id","channel") WHERE "contact_channel_permissions"."revoked_at" is null and "contact_channel_permissions"."superseded_by_id" is null and "contact_channel_permissions"."expires_at" is null;--> statement-breakpoint
CREATE INDEX "ccp_contact_channel_effective_idx" ON "contact_channel_permissions" USING btree ("contact_id","channel","effective_at");--> statement-breakpoint
CREATE INDEX "ccp_state_idx" ON "contact_channel_permissions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "ocr_current_org_unique" ON "organization_communication_restrictions" USING btree ("organization_id") WHERE "organization_communication_restrictions"."channel" is null and "organization_communication_restrictions"."revoked_at" is null and "organization_communication_restrictions"."superseded_by_id" is null and "organization_communication_restrictions"."expires_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ocr_current_org_channel_unique" ON "organization_communication_restrictions" USING btree ("organization_id","channel") WHERE "organization_communication_restrictions"."channel" is not null and "organization_communication_restrictions"."revoked_at" is null and "organization_communication_restrictions"."superseded_by_id" is null and "organization_communication_restrictions"."expires_at" is null;--> statement-breakpoint
CREATE INDEX "ocr_org_channel_effective_idx" ON "organization_communication_restrictions" USING btree ("organization_id","channel","effective_at");--> statement-breakpoint
CREATE INDEX "ocr_state_idx" ON "organization_communication_restrictions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "suppress_current_contact_channel_unique" ON "suppression_entries" USING btree ("contact_id","channel") WHERE "suppression_entries"."scope" = 'contact_channel' and "suppression_entries"."revoked_at" is null and "suppression_entries"."superseded_by_id" is null and "suppression_entries"."expires_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppress_current_org_unique" ON "suppression_entries" USING btree ("organization_id") WHERE "suppression_entries"."scope" = 'organization' and "suppression_entries"."revoked_at" is null and "suppression_entries"."superseded_by_id" is null and "suppression_entries"."expires_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppress_current_org_channel_unique" ON "suppression_entries" USING btree ("organization_id","channel") WHERE "suppression_entries"."scope" = 'organization_channel' and "suppression_entries"."revoked_at" is null and "suppression_entries"."superseded_by_id" is null and "suppression_entries"."expires_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppress_current_global_identifier_unique" ON "suppression_entries" USING btree ("scope","identifier_type","identifier_hash") WHERE "suppression_entries"."scope" = 'global' and "suppression_entries"."identifier_hash" is not null and "suppression_entries"."revoked_at" is null and "suppression_entries"."superseded_by_id" is null and "suppression_entries"."expires_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppress_current_global_channel_identifier_unique" ON "suppression_entries" USING btree ("scope","channel","identifier_type","identifier_hash") WHERE "suppression_entries"."scope" = 'global_channel' and "suppression_entries"."identifier_hash" is not null and "suppression_entries"."revoked_at" is null and "suppression_entries"."superseded_by_id" is null and "suppression_entries"."expires_at" is null;--> statement-breakpoint
CREATE INDEX "suppress_eval_contact_channel_idx" ON "suppression_entries" USING btree ("contact_id","channel","effective_at");--> statement-breakpoint
CREATE INDEX "suppress_eval_org_channel_idx" ON "suppression_entries" USING btree ("organization_id","channel","effective_at");--> statement-breakpoint
CREATE INDEX "suppress_identifier_hash_idx" ON "suppression_entries" USING btree ("identifier_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_unique" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "permissions_status_idx" ON "permissions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_unique" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_unique" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE INDEX "roles_status_idx" ON "roles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_id_role_id_unique" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_external_subject_id_unique" ON "users" USING btree ("external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "operational_state_transitions_subject_dimension_created_idx" ON "operational_state_transitions" USING btree ("subject_type","subject_id","dimension","created_at");--> statement-breakpoint
CREATE INDEX "operational_state_transitions_dimension_to_created_idx" ON "operational_state_transitions" USING btree ("dimension","to_value","created_at");--> statement-breakpoint
CREATE INDEX "operational_state_transitions_command_correlation_id_idx" ON "operational_state_transitions" USING btree ("command_correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_roles_current_role_unique" ON "contact_roles" USING btree ("contact_id","organization_id","role_key") WHERE "contact_roles"."effective_to" is null and "contact_roles"."status" = 'active';--> statement-breakpoint
CREATE INDEX "contact_roles_organization_id_idx" ON "contact_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contact_roles_location_id_idx" ON "contact_roles" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_active_org_normalized_email_unique" ON "contacts" USING btree ("organization_id","normalized_email") WHERE "contacts"."normalized_email" is not null and "contacts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "contacts_organization_id_idx" ON "contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contacts_primary_location_id_idx" ON "contacts" USING btree ("primary_location_id");--> statement-breakpoint
CREATE INDEX "contacts_status_idx" ON "contacts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_aliases_active_org_normalized_alias_unique" ON "organization_aliases" USING btree ("organization_id","normalized_alias_name") WHERE "organization_aliases"."record_status" = 'active';--> statement-breakpoint
CREATE INDEX "organization_aliases_normalized_alias_name_idx" ON "organization_aliases" USING btree ("normalized_alias_name");--> statement-breakpoint
CREATE INDEX "organization_locations_organization_id_idx" ON "organization_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_locations_territory_id_idx" ON "organization_locations" USING btree ("territory_id");--> statement-breakpoint
CREATE INDEX "organization_locations_status_idx" ON "organization_locations" USING btree ("location_status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_locations_one_active_primary_per_org_unique" ON "organization_locations" USING btree ("organization_id") WHERE "organization_locations"."is_primary" = true and "organization_locations"."location_status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_roles_current_role_unique" ON "organization_roles" USING btree ("organization_id","role_key") WHERE "organization_roles"."effective_to" is null and "organization_roles"."status" = 'assigned';--> statement-breakpoint
CREATE INDEX "organization_roles_role_key_idx" ON "organization_roles" USING btree ("role_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_active_normalized_domain_unique" ON "organizations" USING btree ("normalized_domain") WHERE "organizations"."normalized_domain" is not null and "organizations"."record_status" = 'active';--> statement-breakpoint
CREATE INDEX "organizations_normalized_name_idx" ON "organizations" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "organizations_prospect_stage_idx" ON "organizations" USING btree ("prospect_stage");--> statement-breakpoint
CREATE INDEX "organizations_research_status_idx" ON "organizations" USING btree ("research_status");--> statement-breakpoint
CREATE INDEX "organizations_outreach_status_idx" ON "organizations" USING btree ("outreach_status");--> statement-breakpoint
CREATE INDEX "organizations_data_freshness_status_idx" ON "organizations" USING btree ("data_freshness_status");--> statement-breakpoint
CREATE INDEX "organizations_record_status_idx" ON "organizations" USING btree ("record_status");--> statement-breakpoint
CREATE UNIQUE INDEX "territories_code_unique" ON "territories" USING btree ("code");--> statement-breakpoint
CREATE INDEX "territories_parent_territory_id_idx" ON "territories" USING btree ("parent_territory_id");--> statement-breakpoint
CREATE INDEX "territories_status_idx" ON "territories" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notes_subject_idx" ON "notes" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "notes_organization_id_idx" ON "notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notes_contact_id_idx" ON "notes" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "notes_created_by_user_id_idx" ON "notes" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taggings_tag_subject_unique" ON "taggings" USING btree ("tag_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "taggings_subject_idx" ON "taggings" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_key_unique" ON "tags" USING btree ("key");--> statement-breakpoint
CREATE INDEX "tags_status_idx" ON "tags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_subject_idx" ON "tasks" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "tasks_organization_id_idx" ON "tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tasks_contact_id_idx" ON "tasks" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "tasks_assigned_to_status_due_idx" ON "tasks" USING btree ("assigned_to_user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");