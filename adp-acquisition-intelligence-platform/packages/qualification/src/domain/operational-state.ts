export const prospectStages = [
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
] as const;

export const researchStatuses = [
  'not_started',
  'in_progress',
  'gaps_open',
  'awaiting_review',
  'sufficient_for_purpose',
  'blocked_conflict',
  'paused',
] as const;

export const outreachStatuses = [
  'not_started',
  'ready',
  'active',
  'waiting_response',
  'paused',
  'completed',
  'blocked_restriction',
  'do_not_contact',
] as const;

export const dataFreshnessStatuses = ['current', 'aging', 'stale', 'mixed', 'unknown'] as const;

export type ProspectStage = (typeof prospectStages)[number];
export type ResearchStatus = (typeof researchStatuses)[number];
export type OutreachStatus = (typeof outreachStatuses)[number];
export type DataFreshnessStatus = (typeof dataFreshnessStatuses)[number];

export type OperationalDimension =
  'prospect_stage' | 'research_status' | 'outreach_status' | 'data_freshness_status';

export type OperationalStateValue =
  ProspectStage | ResearchStatus | OutreachStatus | DataFreshnessStatus;

export type TransitionRule = 'Y' | 'R' | 'S';

type Matrix<TState extends string> = Partial<
  Record<TState, Partial<Record<TState, TransitionRule>>>
>;

export const prospectStageMatrix: Matrix<ProspectStage> = {
  raw: { normalization: 'Y' },
  normalization: { research: 'Y', duplicate: 'R' },
  research: { scored: 'Y' },
  scored: { review: 'Y' },
  review: {
    research_required: 'Y',
    qualified: 'Y',
    nurture: 'Y',
    disqualified: 'Y',
    duplicate: 'Y',
    existing_relationship: 'Y',
    out_of_territory: 'Y',
  },
  research_required: { research: 'Y' },
  qualified: { discovery_scheduled: 'Y', nurture: 'R', disqualified: 'R' },
  discovery_scheduled: { discovery_completed: 'Y', nurture: 'R' },
  discovery_completed: { outreach_ready: 'Y', nurture: 'R' },
  outreach_ready: { outreach_active: 'Y', nurture: 'R' },
  outreach_active: { opportunity: 'Y', nurture: 'R' },
  opportunity: { outreach_active: 'R', nurture: 'R' },
  nurture: { qualified: 'R', research: 'R', review: 'R' },
  disqualified: { review: 'R', research: 'R' },
  duplicate: { research: 'R', review: 'R' },
  existing_relationship: { review: 'R', qualified: 'R' },
  out_of_territory: { research: 'R', review: 'R', qualified: 'R' },
};

export const researchStatusMatrix: Matrix<ResearchStatus> = {
  not_started: { in_progress: 'Y', gaps_open: 'Y', paused: 'Y' },
  in_progress: {
    gaps_open: 'Y',
    awaiting_review: 'Y',
    sufficient_for_purpose: 'Y',
    blocked_conflict: 'Y',
    paused: 'Y',
  },
  gaps_open: { in_progress: 'Y', awaiting_review: 'Y', blocked_conflict: 'Y', paused: 'Y' },
  awaiting_review: {
    in_progress: 'Y',
    gaps_open: 'Y',
    sufficient_for_purpose: 'Y',
    blocked_conflict: 'Y',
    paused: 'Y',
  },
  sufficient_for_purpose: { in_progress: 'Y', gaps_open: 'Y', blocked_conflict: 'Y', paused: 'Y' },
  blocked_conflict: { in_progress: 'Y', gaps_open: 'Y', awaiting_review: 'Y', paused: 'Y' },
  paused: { in_progress: 'Y', gaps_open: 'Y' },
};

export const outreachStatusMatrix: Matrix<OutreachStatus> = {
  not_started: { ready: 'Y', blocked_restriction: 'Y', do_not_contact: 'Y' },
  ready: { active: 'Y', paused: 'Y', blocked_restriction: 'Y', do_not_contact: 'Y' },
  active: {
    waiting_response: 'Y',
    paused: 'Y',
    completed: 'Y',
    blocked_restriction: 'Y',
    do_not_contact: 'Y',
  },
  waiting_response: {
    active: 'Y',
    paused: 'Y',
    completed: 'Y',
    blocked_restriction: 'Y',
    do_not_contact: 'Y',
  },
  paused: { ready: 'Y', active: 'Y', blocked_restriction: 'Y', do_not_contact: 'Y' },
  completed: { ready: 'R', do_not_contact: 'Y' },
  blocked_restriction: { ready: 'R', do_not_contact: 'Y' },
  do_not_contact: {},
};

export const dataFreshnessStatusMatrix: Matrix<DataFreshnessStatus> = {
  unknown: { current: 'S', aging: 'S', stale: 'S', mixed: 'S' },
  current: { aging: 'S', stale: 'S', mixed: 'S', unknown: 'S' },
  aging: { current: 'S', stale: 'S', mixed: 'S', unknown: 'S' },
  stale: { current: 'S', aging: 'S', mixed: 'S', unknown: 'S' },
  mixed: { current: 'S', aging: 'S', stale: 'S', unknown: 'S' },
};

export function ruleForTransition(
  dimension: OperationalDimension,
  from: OperationalStateValue,
  to: OperationalStateValue,
): TransitionRule | null {
  switch (dimension) {
    case 'prospect_stage':
      return prospectStageMatrix[from as ProspectStage]?.[to as ProspectStage] ?? null;
    case 'research_status':
      return researchStatusMatrix[from as ResearchStatus]?.[to as ResearchStatus] ?? null;
    case 'outreach_status':
      return outreachStatusMatrix[from as OutreachStatus]?.[to as OutreachStatus] ?? null;
    case 'data_freshness_status':
      return (
        dataFreshnessStatusMatrix[from as DataFreshnessStatus]?.[to as DataFreshnessStatus] ?? null
      );
  }
}

export function columnForDimension(
  dimension: OperationalDimension,
): 'prospectStage' | 'researchStatus' | 'outreachStatus' | 'dataFreshnessStatus' {
  switch (dimension) {
    case 'prospect_stage':
      return 'prospectStage';
    case 'research_status':
      return 'researchStatus';
    case 'outreach_status':
      return 'outreachStatus';
    case 'data_freshness_status':
      return 'dataFreshnessStatus';
  }
}
