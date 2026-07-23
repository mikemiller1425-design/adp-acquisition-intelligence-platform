import type { ProspectStage } from './operational-state.js';
import type { QualificationActorRole } from './qualification.js';

export type ReentryReasonCode =
  | 'timing_window_opened'
  | 'new_buying_signal'
  | 'new_source_available'
  | 'stale_data_refresh'
  | 'review_requested'
  | 'score_changed'
  | 'disqualification_reversed'
  | 'new_evidence'
  | 'data_correction'
  | 'policy_exception_approved'
  | 'false_duplicate'
  | 'merge_reversed'
  | 'identity_correction'
  | 'relationship_ended'
  | 'relationship_scope_changed'
  | 'relationship_waived'
  | 'approved_cross_sell_exception'
  | 'territory_corrected'
  | 'assignment_changed'
  | 'owner_approved_exception'
  | 'other_authorized';

export type ReentryRoute = {
  from: ProspectStage;
  to: ProspectStage;
  roles: readonly QualificationActorRole[];
  reasonCodes: readonly ReentryReasonCode[];
  requiresAssignmentValidation: boolean;
  createsTask: boolean;
  blocksDirectOutreach: true;
};

export const reentryRoutes = [
  route(
    'nurture',
    'qualified',
    ['reviewer', 'admin'],
    ['timing_window_opened', 'new_buying_signal', 'owner_approved_exception'],
  ),
  route(
    'nurture',
    'research',
    ['researcher', 'reviewer', 'admin'],
    ['new_source_available', 'stale_data_refresh', 'owner_approved_exception'],
  ),
  route(
    'nurture',
    'review',
    ['reviewer', 'admin'],
    ['review_requested', 'score_changed', 'owner_approved_exception'],
  ),
  route(
    'disqualified',
    'review',
    ['reviewer', 'admin'],
    ['disqualification_reversed', 'new_evidence', 'policy_exception_approved'],
  ),
  route(
    'disqualified',
    'research',
    ['reviewer', 'admin'],
    ['new_evidence', 'data_correction', 'policy_exception_approved'],
  ),
  route(
    'duplicate',
    'research',
    ['researcher', 'admin'],
    ['false_duplicate', 'merge_reversed', 'identity_correction'],
  ),
  route(
    'duplicate',
    'review',
    ['reviewer', 'admin'],
    ['false_duplicate', 'merge_reversed', 'owner_approved_exception'],
  ),
  route(
    'existing_relationship',
    'review',
    ['reviewer', 'admin'],
    ['relationship_ended', 'relationship_scope_changed', 'owner_approved_exception'],
  ),
  route(
    'existing_relationship',
    'qualified',
    ['reviewer', 'admin'],
    ['relationship_waived', 'approved_cross_sell_exception'],
  ),
  route(
    'out_of_territory',
    'research',
    ['researcher', 'reviewer', 'admin'],
    ['territory_corrected', 'assignment_changed', 'owner_approved_exception'],
  ),
  route(
    'out_of_territory',
    'review',
    ['reviewer', 'admin'],
    ['territory_corrected', 'assignment_changed', 'owner_approved_exception'],
  ),
  {
    ...route(
      'out_of_territory',
      'qualified',
      ['reviewer', 'admin'],
      ['territory_corrected', 'assignment_changed'],
    ),
    requiresAssignmentValidation: true,
  },
] as const satisfies readonly ReentryRoute[];

export function findReentryRoute(from: ProspectStage, to: ProspectStage): ReentryRoute | null {
  return reentryRoutes.find((entry) => entry.from === from && entry.to === to) ?? null;
}

function route(
  from: ProspectStage,
  to: ProspectStage,
  roles: readonly QualificationActorRole[],
  reasonCodes: readonly ReentryReasonCode[],
): ReentryRoute {
  return {
    from,
    to,
    roles,
    reasonCodes,
    requiresAssignmentValidation: false,
    createsTask: true,
    blocksDirectOutreach: true,
  };
}
