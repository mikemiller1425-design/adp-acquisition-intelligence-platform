export const opportunityActorRoles = ['admin', 'sales', 'reviewer'] as const;
export type OpportunityActorRole = (typeof opportunityActorRoles)[number];

export type OpportunityActor = {
  userId: string;
  roles: readonly OpportunityActorRole[];
};

export const opportunityStages = [
  'open',
  'discovery_validation',
  'solution_alignment',
  'commercial_review',
  'won',
  'lost',
  'nurture',
] as const;
export type OpportunityStage = (typeof opportunityStages)[number];

export const terminalOpportunityStages = ['won', 'lost'] as const;
export type TerminalOpportunityStage = (typeof terminalOpportunityStages)[number];

export const opportunityContactRoles = [
  'economic_buyer',
  'champion',
  'influencer',
  'technical_evaluator',
  'legal_procurement',
  'operations_contact',
  'executive_sponsor',
  'other',
] as const;
export type OpportunityContactRole = (typeof opportunityContactRoles)[number];

export type TransitionRule = 'Y' | 'R';

type StageMatrix = Partial<
  Record<OpportunityStage, Partial<Record<OpportunityStage, TransitionRule>>>
>;

export const opportunityStageMatrix: StageMatrix = {
  open: { discovery_validation: 'Y', lost: 'Y', nurture: 'Y' },
  discovery_validation: { solution_alignment: 'Y', lost: 'Y', nurture: 'Y' },
  solution_alignment: {
    commercial_review: 'Y',
    discovery_validation: 'R',
    lost: 'Y',
    nurture: 'Y',
  },
  commercial_review: { won: 'Y', lost: 'Y', nurture: 'Y', solution_alignment: 'R' },
  nurture: { open: 'R', discovery_validation: 'R', lost: 'Y' },
  won: { open: 'R' },
  lost: { open: 'R' },
};

export const eligibleProspectStages = [
  'outreach_active',
  'opportunity',
  'discovery_completed',
  'outreach_ready',
] as const;

export function actorHasRole(
  actor: OpportunityActor,
  allowed: readonly OpportunityActorRole[],
): boolean {
  return actor.roles.some((role) => allowed.includes(role));
}

export function ruleForOpportunityTransition(
  from: OpportunityStage,
  to: OpportunityStage,
): TransitionRule | null {
  return opportunityStageMatrix[from]?.[to] ?? null;
}

export function isTerminalStage(stage: OpportunityStage): boolean {
  return stage === 'won' || stage === 'lost';
}

export function isActiveStage(stage: OpportunityStage): boolean {
  return !isTerminalStage(stage);
}

export function evaluateEligibility(input: {
  prospectStage: string;
  recordStatus: string;
  existingRelationshipFlag: boolean;
  ownerUserId: string | null;
  motion: string;
}): { eligible: boolean; reasons: Array<{ code: string; message: string }> } {
  const reasons: Array<{ code: string; message: string }> = [];

  if (input.recordStatus === 'archived') {
    reasons.push({ code: 'organization_archived', message: 'Organization is archived' });
  }
  if (input.existingRelationshipFlag) {
    reasons.push({
      code: 'existing_relationship',
      message: 'Organization has an existing relationship flag',
    });
  }
  if (
    !eligibleProspectStages.includes(input.prospectStage as (typeof eligibleProspectStages)[number])
  ) {
    reasons.push({
      code: 'prospect_stage_ineligible',
      message: `Prospect stage ${input.prospectStage} is not eligible for opportunity creation`,
    });
  }
  if (input.ownerUserId === null) {
    reasons.push({ code: 'missing_owner', message: 'Organization has no assigned owner' });
  }
  if (input.motion.trim().length === 0) {
    reasons.push({ code: 'missing_motion', message: 'Commercial motion is required' });
  }

  return { eligible: reasons.length === 0, reasons };
}

export function validateValueInput(input: {
  amount: string | null;
  currency: string | null;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.amount === null || input.amount.trim().length === 0) {
    return { ok: true };
  }
  const parsed = Number(input.amount);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, code: 'invalid_amount', message: 'Amount must be a non-negative number' };
  }
  if (input.currency === null || input.currency.trim().length === 0) {
    return {
      ok: false,
      code: 'currency_required',
      message: 'Currency is required when value amount is present',
    };
  }
  return { ok: true };
}

export function validateProbabilityInput(input: {
  probability: string | null;
  source: 'manual' | 'stage_default';
  reasonNote?: string | null;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.probability === null || input.probability.trim().length === 0) {
    return { ok: true };
  }
  const parsed = Number(input.probability);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return {
      ok: false,
      code: 'invalid_probability',
      message: 'Probability must be between 0 and 100',
    };
  }
  if (input.source === 'manual' && (input.reasonNote === undefined || input.reasonNote === null)) {
    return {
      ok: false,
      code: 'manual_probability_requires_reason',
      message: 'Manual probability overrides require a reason note',
    };
  }
  return { ok: true };
}

export function evaluateRiskRules(input: {
  stage: OpportunityStage;
  openRiskFlagCount: number;
  daysInStage: number | null;
  maxAgeDays: number | null;
}): Array<{ flagKey: string; severity: string; description: string }> {
  const flags: Array<{ flagKey: string; severity: string; description: string }> = [];
  if (input.openRiskFlagCount > 0) {
    flags.push({
      flagKey: 'open_risk_flags_present',
      severity: 'high',
      description: 'Opportunity has unresolved risk flags',
    });
  }
  if (
    input.maxAgeDays !== null &&
    input.daysInStage !== null &&
    input.daysInStage > input.maxAgeDays &&
    !isTerminalStage(input.stage)
  ) {
    flags.push({
      flagKey: 'stage_age_exceeded',
      severity: 'medium',
      description: `Opportunity has exceeded maximum age in ${input.stage}`,
    });
  }
  return flags;
}

export function closeOutcomeStage(outcomeType: 'won' | 'lost' | 'nurture'): OpportunityStage {
  if (outcomeType === 'won') return 'won';
  if (outcomeType === 'lost') return 'lost';
  return 'nurture';
}

export function reopenTargetStage(priorOutcomeType: 'won' | 'lost' | 'nurture'): OpportunityStage {
  if (priorOutcomeType === 'nurture') return 'open';
  return 'open';
}
