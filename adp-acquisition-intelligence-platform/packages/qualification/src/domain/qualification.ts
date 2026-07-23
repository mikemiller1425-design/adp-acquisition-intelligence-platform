import type { ProspectStage } from './operational-state.js';

export const qualificationReviewStatuses = [
  'pending',
  'in_review',
  'decided',
  'superseded',
  'cancelled',
] as const;

export const qualificationOutcomes = [
  'qualified',
  'conditionally_qualified',
  'research_required',
  'nurture',
  'disqualified',
  'duplicate',
  'existing_relationship',
  'out_of_territory',
] as const;

export const qualificationConditionTypes = ['blocking', 'non_blocking'] as const;
export const qualificationConditionStatuses = [
  'pending',
  'resolved',
  'waived',
  'cancelled',
] as const;
export const qualificationActorRoles = ['researcher', 'sales', 'reviewer', 'admin'] as const;

export type QualificationReviewStatus = (typeof qualificationReviewStatuses)[number];
export type QualificationOutcome = (typeof qualificationOutcomes)[number];
export type QualificationConditionType = (typeof qualificationConditionTypes)[number];
export type QualificationConditionStatus = (typeof qualificationConditionStatuses)[number];
export type QualificationActorRole = (typeof qualificationActorRoles)[number];

export type QualificationActor = {
  userId: string | null;
  roles: readonly QualificationActorRole[];
};

export type QualificationConditionInput = {
  type: QualificationConditionType;
  key: string;
  title: string;
  description?: string | null;
  ownerUserId: string;
  dueDate: string;
  metadata?: Record<string, unknown>;
};

export type QualificationDecisionRule = {
  outcome: QualificationOutcome;
  targetProspectStage: ProspectStage;
  allowedRoles: readonly QualificationActorRole[];
  requiresDisqualificationReason: boolean;
  requiresBlockingConditions: boolean;
  requiresResearchGaps: boolean;
  createsBlockingTasks: boolean;
  preservesIntel: boolean;
  requiresTerritoryValidation: boolean;
  requiresAssignmentValidation: boolean;
  consentChangesFit: false;
};

export const qualificationDecisionMatrix = {
  qualified: {
    outcome: 'qualified',
    targetProspectStage: 'qualified',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: false,
    requiresBlockingConditions: false,
    requiresResearchGaps: false,
    createsBlockingTasks: false,
    preservesIntel: true,
    requiresTerritoryValidation: true,
    requiresAssignmentValidation: true,
    consentChangesFit: false,
  },
  conditionally_qualified: {
    outcome: 'conditionally_qualified',
    targetProspectStage: 'qualified',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: false,
    requiresBlockingConditions: true,
    requiresResearchGaps: false,
    createsBlockingTasks: true,
    preservesIntel: true,
    requiresTerritoryValidation: true,
    requiresAssignmentValidation: true,
    consentChangesFit: false,
  },
  research_required: {
    outcome: 'research_required',
    targetProspectStage: 'research_required',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: false,
    requiresBlockingConditions: false,
    requiresResearchGaps: true,
    createsBlockingTasks: true,
    preservesIntel: true,
    requiresTerritoryValidation: false,
    requiresAssignmentValidation: false,
    consentChangesFit: false,
  },
  nurture: {
    outcome: 'nurture',
    targetProspectStage: 'nurture',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: false,
    requiresBlockingConditions: false,
    requiresResearchGaps: false,
    createsBlockingTasks: false,
    preservesIntel: true,
    requiresTerritoryValidation: false,
    requiresAssignmentValidation: false,
    consentChangesFit: false,
  },
  disqualified: {
    outcome: 'disqualified',
    targetProspectStage: 'disqualified',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: true,
    requiresBlockingConditions: false,
    requiresResearchGaps: false,
    createsBlockingTasks: false,
    preservesIntel: true,
    requiresTerritoryValidation: false,
    requiresAssignmentValidation: false,
    consentChangesFit: false,
  },
  duplicate: {
    outcome: 'duplicate',
    targetProspectStage: 'duplicate',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: false,
    requiresBlockingConditions: false,
    requiresResearchGaps: false,
    createsBlockingTasks: false,
    preservesIntel: true,
    requiresTerritoryValidation: false,
    requiresAssignmentValidation: false,
    consentChangesFit: false,
  },
  existing_relationship: {
    outcome: 'existing_relationship',
    targetProspectStage: 'existing_relationship',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: false,
    requiresBlockingConditions: false,
    requiresResearchGaps: false,
    createsBlockingTasks: false,
    preservesIntel: true,
    requiresTerritoryValidation: false,
    requiresAssignmentValidation: false,
    consentChangesFit: false,
  },
  out_of_territory: {
    outcome: 'out_of_territory',
    targetProspectStage: 'out_of_territory',
    allowedRoles: ['reviewer', 'admin'],
    requiresDisqualificationReason: false,
    requiresBlockingConditions: false,
    requiresResearchGaps: false,
    createsBlockingTasks: false,
    preservesIntel: true,
    requiresTerritoryValidation: true,
    requiresAssignmentValidation: false,
    consentChangesFit: false,
  },
} as const satisfies Record<QualificationOutcome, QualificationDecisionRule>;

export function ruleForOutcome(outcome: QualificationOutcome): QualificationDecisionRule {
  return qualificationDecisionMatrix[outcome];
}

export function actorHasRole(
  actor: QualificationActor,
  allowedRoles: readonly QualificationActorRole[],
): boolean {
  return actor.roles.some((role) => allowedRoles.includes(role));
}
