CREATE TYPE "public"."qualification_review_status" AS ENUM('pending', 'in_review', 'decided', 'superseded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."qualification_outcome" AS ENUM('qualified', 'conditionally_qualified', 'research_required', 'nurture', 'disqualified', 'duplicate', 'existing_relationship', 'out_of_territory');--> statement-breakpoint
CREATE TYPE "public"."qualification_condition_type" AS ENUM('blocking', 'non_blocking');--> statement-breakpoint
CREATE TYPE "public"."qualification_condition_status" AS ENUM('pending', 'resolved', 'waived', 'cancelled');--> statement-breakpoint
CREATE TABLE "qualification_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "qualification_review_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" uuid,
	"assigned_to_user_id" uuid,
	"started_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"computed_recommendation" jsonb,
	"reviewer_recommendation" jsonb,
	"recommendation_overridden" boolean DEFAULT false NOT NULL,
	"override_reason_code" text,
	"override_reason_note" text,
	"required_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consent_indicators" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"command_correlation_id" uuid,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualification_reviews_record_version_positive" CHECK ("qualification_reviews"."record_version" > 0),
	CONSTRAINT "qualification_reviews_override_metadata_valid" CHECK ("qualification_reviews"."recommendation_overridden" = false or ("qualification_reviews"."reviewer_recommendation" is not null and "qualification_reviews"."override_reason_code" is not null))
);--> statement-breakpoint
CREATE TABLE "qualification_review_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"score_result_id" uuid NOT NULL,
	"purpose" text DEFAULT 'qualification' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"computed_recommendation_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "disqualification_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"applies_to_outcomes" jsonb DEFAULT '["disqualified"]'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disqualification_reasons_effective_window_valid" CHECK ("disqualification_reasons"."effective_to" is null or "disqualification_reasons"."effective_to" > "disqualification_reasons"."effective_from")
);--> statement-breakpoint
CREATE TABLE "qualification_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "qualification_condition_type" NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_user_id" uuid,
	"due_date" date,
	"status" "qualification_condition_status" DEFAULT 'pending' NOT NULL,
	"task_id" uuid,
	"created_by_user_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"waived_by_user_id" uuid,
	"waived_at" timestamp with time zone,
	"waiver_reason_code" text,
	"waiver_reason_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualification_conditions_blocking_owner_due_required" CHECK ("qualification_conditions"."type" <> 'blocking' or ("qualification_conditions"."owner_user_id" is not null and "qualification_conditions"."due_date" is not null)),
	CONSTRAINT "qualification_conditions_resolved_metadata_valid" CHECK ("qualification_conditions"."status" <> 'resolved' or ("qualification_conditions"."resolved_by_user_id" is not null and "qualification_conditions"."resolved_at" is not null)),
	CONSTRAINT "qualification_conditions_waiver_metadata_valid" CHECK ("qualification_conditions"."status" <> 'waived' or ("qualification_conditions"."waived_by_user_id" is not null and "qualification_conditions"."waived_at" is not null and "qualification_conditions"."waiver_reason_code" is not null))
);--> statement-breakpoint
CREATE TABLE "qualification_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"outcome" "qualification_outcome" NOT NULL,
	"disqualification_reason_id" uuid,
	"supersedes_decision_id" uuid,
	"actor_user_id" uuid,
	"reason_code" text NOT NULL,
	"reason_note" text,
	"decision_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"command_correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualification_decisions_disqualification_reason_required" CHECK ("qualification_decisions"."outcome" <> 'disqualified' or "qualification_decisions"."disqualification_reason_id" is not null)
);--> statement-breakpoint
CREATE TABLE "qualification_recommendation_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"score_result_id" uuid,
	"computed_recommendation" jsonb NOT NULL,
	"reviewer_recommendation" jsonb NOT NULL,
	"actor_user_id" uuid,
	"reason_code" text NOT NULL,
	"reason_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "qualification_reviews" ADD CONSTRAINT "qualification_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_reviews" ADD CONSTRAINT "qualification_reviews_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_reviews" ADD CONSTRAINT "qualification_reviews_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_review_scores" ADD CONSTRAINT "qualification_review_scores_review_id_qualification_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."qualification_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_review_scores" ADD CONSTRAINT "qualification_review_scores_score_result_id_score_results_id_fk" FOREIGN KEY ("score_result_id") REFERENCES "public"."score_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_conditions" ADD CONSTRAINT "qualification_conditions_review_id_qualification_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."qualification_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_conditions" ADD CONSTRAINT "qualification_conditions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_conditions" ADD CONSTRAINT "qualification_conditions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_conditions" ADD CONSTRAINT "qualification_conditions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_conditions" ADD CONSTRAINT "qualification_conditions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_conditions" ADD CONSTRAINT "qualification_conditions_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_conditions" ADD CONSTRAINT "qualification_conditions_waived_by_user_id_users_id_fk" FOREIGN KEY ("waived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_decisions" ADD CONSTRAINT "qualification_decisions_review_id_qualification_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."qualification_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_decisions" ADD CONSTRAINT "qualification_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_decisions" ADD CONSTRAINT "qualification_decisions_disqualification_reason_id_disqualification_reasons_id_fk" FOREIGN KEY ("disqualification_reason_id") REFERENCES "public"."disqualification_reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_decisions" ADD CONSTRAINT "qualification_decisions_supersedes_decision_fk" FOREIGN KEY ("supersedes_decision_id") REFERENCES "public"."qualification_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_decisions" ADD CONSTRAINT "qualification_decisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_recommendation_overrides" ADD CONSTRAINT "qualification_recommendation_overrides_review_id_qualification_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."qualification_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_recommendation_overrides" ADD CONSTRAINT "qualification_recommendation_overrides_score_result_id_score_results_id_fk" FOREIGN KEY ("score_result_id") REFERENCES "public"."score_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_recommendation_overrides" ADD CONSTRAINT "qualification_recommendation_overrides_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qualification_reviews_org_status_idx" ON "qualification_reviews" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "qualification_reviews_assigned_status_idx" ON "qualification_reviews" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "qualification_reviews_command_correlation_id_idx" ON "qualification_reviews" USING btree ("command_correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_review_scores_review_score_unique" ON "qualification_review_scores" USING btree ("review_id","score_result_id");--> statement-breakpoint
CREATE INDEX "qualification_review_scores_score_result_id_idx" ON "qualification_review_scores" USING btree ("score_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disqualification_reasons_key_version_unique" ON "disqualification_reasons" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "disqualification_reasons_key_status_idx" ON "disqualification_reasons" USING btree ("key","status");--> statement-breakpoint
CREATE INDEX "qualification_conditions_review_status_idx" ON "qualification_conditions" USING btree ("review_id","status");--> statement-breakpoint
CREATE INDEX "qualification_conditions_org_status_idx" ON "qualification_conditions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "qualification_conditions_owner_due_idx" ON "qualification_conditions" USING btree ("owner_user_id","due_date");--> statement-breakpoint
CREATE INDEX "qualification_decisions_review_created_idx" ON "qualification_decisions" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "qualification_decisions_org_created_idx" ON "qualification_decisions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "qualification_decisions_outcome_idx" ON "qualification_decisions" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "qualification_recommendation_overrides_review_idx" ON "qualification_recommendation_overrides" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "qualification_recommendation_overrides_score_result_idx" ON "qualification_recommendation_overrides" USING btree ("score_result_id");--> statement-breakpoint
INSERT INTO "disqualification_reasons" ("key", "version", "display_name", "description", "category", "applies_to_outcomes")
VALUES
	('poor_fit', '1.0.0', 'Poor fit', 'The organization does not match the Phase 1 ideal customer profile after review.', 'fit', '["disqualified"]'::jsonb),
	('insufficient_size', '1.0.0', 'Insufficient size', 'Firm size, book, or market footprint is below the approved pursuit threshold.', 'fit', '["disqualified","nurture"]'::jsonb),
	('low_revenue_potential', '1.0.0', 'Low revenue potential', 'Estimated economics do not justify active pursuit.', 'fit', '["disqualified","nurture"]'::jsonb),
	('no_adp_alignment', '1.0.0', 'No ADP alignment', 'No currently supported ADP commercial motion is appropriate.', 'fit', '["disqualified"]'::jsonb),
	('existing_adp_relationship', '1.0.0', 'Existing ADP relationship', 'A current ADP relationship blocks or redirects acquisition pursuit.', 'relationship', '["existing_relationship","disqualified"]'::jsonb),
	('existing_partner_relationship', '1.0.0', 'Existing partner relationship', 'An incompatible partner or referral relationship blocks pursuit.', 'relationship', '["existing_relationship","disqualified"]'::jsonb),
	('duplicate_record', '1.0.0', 'Duplicate record', 'The organization is a duplicate or absorbed identity.', 'identity', '["duplicate"]'::jsonb),
	('out_of_territory', '1.0.0', 'Out of territory', 'Territory or assignment policy prevents current pursuit.', 'territory', '["out_of_territory","disqualified"]'::jsonb),
	('compliance_restriction', '1.0.0', 'Compliance restriction', 'A compliance, consent, or restriction signal blocks pursuit.', 'policy', '["disqualified"]'::jsonb),
	('do_not_contact', '1.0.0', 'Do not contact', 'Consent or suppression status prevents outreach and active pursuit.', 'policy', '["disqualified","nurture"]'::jsonb),
	('data_quality_unusable', '1.0.0', 'Data quality unusable', 'Required identity or qualification data remains unusable after research.', 'data_quality', '["disqualified","research_required"]'::jsonb),
	('no_buying_signal', '1.0.0', 'No buying signal', 'The organization is plausible but shows no current buying trigger.', 'timing', '["nurture","disqualified"]'::jsonb),
	('timing_not_aligned', '1.0.0', 'Timing not aligned', 'The opportunity should be revisited later rather than pursued now.', 'timing', '["nurture"]'::jsonb),
	('competitor_lock_in', '1.0.0', 'Competitor lock-in', 'Known contractual or strategic lock-in makes active pursuit inappropriate.', 'timing', '["nurture","disqualified"]'::jsonb),
	('other_authorized', '1.0.0', 'Other authorized reason', 'Admin-only fallback reason; reviewer note is required.', 'exception', '["disqualified","duplicate","existing_relationship","out_of_territory","nurture"]'::jsonb)
ON CONFLICT ("key", "version") DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_qualification_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'hard delete is not allowed for qualification workflow tables; use status/history instead'
		USING ERRCODE = 'check_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "qualification_reviews_prevent_delete" BEFORE DELETE ON "qualification_reviews" FOR EACH ROW EXECUTE FUNCTION prevent_qualification_hard_delete();--> statement-breakpoint
CREATE TRIGGER "qualification_review_scores_prevent_delete" BEFORE DELETE ON "qualification_review_scores" FOR EACH ROW EXECUTE FUNCTION prevent_qualification_hard_delete();--> statement-breakpoint
CREATE TRIGGER "disqualification_reasons_prevent_delete" BEFORE DELETE ON "disqualification_reasons" FOR EACH ROW EXECUTE FUNCTION prevent_qualification_hard_delete();--> statement-breakpoint
CREATE TRIGGER "qualification_conditions_prevent_delete" BEFORE DELETE ON "qualification_conditions" FOR EACH ROW EXECUTE FUNCTION prevent_qualification_hard_delete();--> statement-breakpoint
CREATE TRIGGER "qualification_decisions_prevent_delete" BEFORE DELETE ON "qualification_decisions" FOR EACH ROW EXECUTE FUNCTION prevent_qualification_hard_delete();--> statement-breakpoint
CREATE TRIGGER "qualification_recommendation_overrides_prevent_delete" BEFORE DELETE ON "qualification_recommendation_overrides" FOR EACH ROW EXECUTE FUNCTION prevent_qualification_hard_delete();
