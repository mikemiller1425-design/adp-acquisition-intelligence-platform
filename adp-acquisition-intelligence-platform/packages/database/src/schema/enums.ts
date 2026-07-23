import { pgEnum } from 'drizzle-orm/pg-core';

export const prospectStageEnum = pgEnum('prospect_stage', [
  'raw',
  'normalization',
  'research',
  'scored',
  'review',
  'research_required',
  'qualified',
  'discovery_scheduled',
  'discovery_completed',
  'outreach_ready',
  'outreach_active',
  'opportunity',
  'nurture',
  'disqualified',
  'duplicate',
  'existing_relationship',
  'out_of_territory',
]);

export const researchStatusEnum = pgEnum('research_status', [
  'not_started',
  'in_progress',
  'gaps_open',
  'awaiting_review',
  'sufficient_for_purpose',
  'blocked_conflict',
  'paused',
]);

export const outreachStatusEnum = pgEnum('outreach_status', [
  'not_started',
  'ready',
  'active',
  'waiting_response',
  'paused',
  'completed',
  'blocked_restriction',
  'do_not_contact',
]);

export const dataFreshnessStatusEnum = pgEnum('data_freshness_status', [
  'current',
  'aging',
  'stale',
  'mixed',
  'unknown',
]);

export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'open',
  'discovery_validation',
  'solution_alignment',
  'commercial_review',
  'won',
  'lost',
  'nurture',
]);

export const recordStatusEnum = pgEnum('record_status', ['active', 'archived']);

export const channelEnum = pgEnum('channel', [
  'email',
  'phone',
  'voicemail',
  'linkedin',
  'internal_introduction',
  'meeting',
  'manual_follow_up',
]);

export const permissionStateEnum = pgEnum('permission_state', [
  'allowed',
  'unknown',
  'restricted',
  'opted_out',
  'not_applicable',
]);

export const permissionScopeEnum = pgEnum('permission_scope', [
  'contact_channel',
  'organization',
  'organization_channel',
  'global',
  'global_channel',
]);

export const permissionSourceEnum = pgEnum('permission_source', [
  'user_asserted',
  'import',
  'discovery',
  'response_unsubscribe',
  'admin',
  'policy',
  'system',
]);

export const actorTypeEnum = pgEnum('actor_type', ['user', 'system']);

export const operationalDimensionEnum = pgEnum('operational_dimension', [
  'prospect_stage',
  'research_status',
  'outreach_status',
  'data_freshness_status',
  'opportunity_stage',
]);

export const subjectTypeEnum = pgEnum('subject_type', [
  'organization',
  'opportunity',
  'contact',
  'user',
  'system',
]);

export const sourceTypeEnum = pgEnum('source_type', [
  'company_website',
  'public_directory',
  'regulatory_record',
  'news',
  'user_entry',
  'import',
  'discovery',
  'internal_record',
  'calculated',
  'ai_assisted_extraction',
  'other',
]);

export const sourceStatusEnum = pgEnum('source_status', ['active', 'disabled']);

export const accessClassificationEnum = pgEnum('access_classification', [
  'public',
  'authenticated',
  'licensed',
  'internal',
  'restricted',
]);

export const evidenceTypeEnum = pgEnum('evidence_type', [
  'verified_fact',
  'source_derived_fact',
  'user_entered_fact',
  'calculated',
  'ai_inference',
  'unknown',
]);

export const valueStatusEnum = pgEnum('value_status', [
  'known',
  'unknown',
  'not_applicable',
  'withheld',
  'contradicted',
  'stale',
]);

export const valueLifecycleEnum = pgEnum('value_lifecycle', [
  'proposed',
  'current',
  'superseded',
  'contradicted',
  'stale',
  'archived',
]);

export const observationLifecycleEnum = pgEnum('observation_lifecycle', [
  'proposed',
  'accepted',
  'rejected',
  'contradicted',
  'superseded',
]);

export const definitionLifecycleEnum = pgEnum('definition_lifecycle', [
  'draft',
  'active',
  'retired',
]);

export const scoringApprovalStatusEnum = pgEnum('scoring_approval_status', [
  'draft_unapproved',
  'pending',
  'approved',
  'rejected',
]);

export const scoreResultStatusEnum = pgEnum('score_result_status', [
  'final',
  'provisional',
  'insufficient_data',
]);

export const scoreRecalculationJobStatusEnum = pgEnum('score_recalculation_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const qualificationReviewStatusEnum = pgEnum('qualification_review_status', [
  'pending',
  'in_review',
  'decided',
  'superseded',
  'cancelled',
]);

export const qualificationOutcomeEnum = pgEnum('qualification_outcome', [
  'qualified',
  'conditionally_qualified',
  'research_required',
  'nurture',
  'disqualified',
  'duplicate',
  'existing_relationship',
  'out_of_territory',
]);

export const qualificationConditionTypeEnum = pgEnum('qualification_condition_type', [
  'blocking',
  'non_blocking',
]);

export const qualificationConditionStatusEnum = pgEnum('qualification_condition_status', [
  'pending',
  'resolved',
  'waived',
  'cancelled',
]);

export const variableDataTypeEnum = pgEnum('variable_data_type', [
  'boolean',
  'integer',
  'decimal',
  'percentage',
  'currency',
  'string',
  'enum',
  'date',
  'datetime',
  'integer_range',
  'decimal_range',
  'currency_range',
  'categorized_list',
  'controlled_multiselect',
  'ordinal_rubric',
]);

export const evidenceRelationshipTypeEnum = pgEnum('evidence_relationship_type', [
  'supports',
  'contradicts',
  'verifies',
  'contextualizes',
]);

export const reviewerStatusEnum = pgEnum('reviewer_status', [
  'pending',
  'approved',
  'rejected',
  'needs_review',
]);

export const confidenceAssessmentStatusEnum = pgEnum('confidence_assessment_status', [
  'unassessed',
  'provisional',
  'assessed',
]);

export const confidenceAssessmentSubjectTypeEnum = pgEnum('confidence_assessment_subject_type', [
  'variable_value',
  'evidence_record',
]);

export const freshnessResultEnum = pgEnum('freshness_result', [
  'fresh',
  'expiring',
  'stale',
  'no_policy',
  'unknown',
]);

export const sensitivityClassificationEnum = pgEnum('sensitivity_classification', [
  'public',
  'internal',
  'confidential',
  'restricted',
]);

export const permissionEvidenceSubjectTypeEnum = pgEnum('permission_evidence_subject_type', [
  'contact_channel_permission',
  'organization_communication_restriction',
  'suppression_entry',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'open',
  'in_progress',
  'completed',
  'cancelled',
]);

export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'suspended']);

export const configurationStatusEnum = pgEnum('configuration_status', ['active', 'retired']);

export const territoryStatusEnum = pgEnum('territory_status', ['active', 'retired']);

export const locationStatusEnum = pgEnum('location_status', ['active', 'closed', 'archived']);

export const organizationRoleStatusEnum = pgEnum('organization_role_status', [
  'assigned',
  'retired',
]);

export const contactStatusEnum = pgEnum('contact_status', ['active', 'inactive', 'archived']);

export const contactRoleStatusEnum = pgEnum('contact_role_status', ['active', 'retired']);

export const tagStatusEnum = pgEnum('tag_status', ['active', 'retired']);

export const outboxEventStatusEnum = pgEnum('outbox_event_status', [
  'pending',
  'published',
  'failed',
  'dead_letter',
]);

export const importBatchSourceEnum = pgEnum('import_batch_source', ['manual', 'csv_upload']);

export const importBatchLifecycleStatusEnum = pgEnum('import_batch_lifecycle_status', [
  'uploaded',
  'mapping_required',
  'mapped',
  'validating',
  'validation_failed',
  'preview_ready',
  'duplicate_review_required',
  'ready_to_commit',
  'committing',
  'committed',
  'partially_committed',
  'commit_failed',
  'reverting',
  'reverted',
  'partially_reverted',
  'expired',
  'archived',
]);

export const duplicateDispositionEnum = pgEnum('duplicate_disposition', [
  'pending',
  'unique',
  'link',
  'skip',
  'merge_candidate',
  'rejected',
]);

export const importCommitResultEnum = pgEnum('import_commit_result', [
  'pending',
  'created',
  'linked',
  'updated',
  'skipped',
  'failed',
  'reverted',
]);

export const importEntityTypeEnum = pgEnum('import_entity_type', [
  'organization',
  'contact',
  'location',
  'alias',
  'assignment',
  'evidence',
  'observation',
  'variable_value',
  'consent_permission',
]);

export const importEntityLinkActionEnum = pgEnum('import_entity_link_action', [
  'created',
  'updated',
  'linked',
  'proposed',
  'merged',
  'skipped',
  'archived',
  'reverted',
]);

export const duplicateMatchTierEnum = pgEnum('duplicate_match_tier', [
  'exact',
  'strong',
  'ambiguous',
  'weak',
]);

export const duplicateCandidateDispositionEnum = pgEnum('duplicate_candidate_disposition', [
  'pending',
  'confirmed_duplicate',
  'not_duplicate',
  'merged',
  'deferred',
]);

export const mergeEventStatusEnum = pgEnum('merge_event_status', [
  'planned',
  'completed',
  'reversal_blocked',
  'reversed',
  'manual_remediation_required',
]);
