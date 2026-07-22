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
