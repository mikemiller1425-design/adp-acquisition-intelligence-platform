import { describe, expect, it } from 'vitest';

import {
  evaluateEligibility,
  evaluateRiskRules,
  ruleForOpportunityTransition,
  validateProbabilityInput,
  validateValueInput,
} from '../domain/opportunity.js';

describe('opportunity policy', () => {
  it('evaluates eligibility for outreach-active organizations with owners', () => {
    const result = evaluateEligibility({
      prospectStage: 'outreach_active',
      recordStatus: 'active',
      existingRelationshipFlag: false,
      ownerUserId: 'owner-1',
      motion: 'direct_payroll_opportunity',
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('rejects ineligible prospect stages and archived organizations', () => {
    const result = evaluateEligibility({
      prospectStage: 'research',
      recordStatus: 'archived',
      existingRelationshipFlag: true,
      ownerUserId: null,
      motion: '',
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'organization_archived',
        'existing_relationship',
        'prospect_stage_ineligible',
        'missing_owner',
        'missing_motion',
      ]),
    );
  });

  it('enforces active opportunity uniqueness semantics via stage matrix terminals', () => {
    expect(ruleForOpportunityTransition('open', 'discovery_validation')).toBe('Y');
    expect(ruleForOpportunityTransition('won', 'open')).toBe('R');
    expect(ruleForOpportunityTransition('won', 'discovery_validation')).toBeNull();
  });

  it('requires currency when value amount is present', () => {
    expect(validateValueInput({ amount: '1000', currency: 'USD' }).ok).toBe(true);
    expect(validateValueInput({ amount: null, currency: null }).ok).toBe(true);
    const invalid = validateValueInput({ amount: '1000', currency: null });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.code).toBe('currency_required');
    }
  });

  it('validates manual probability overrides require reason notes', () => {
    const valid = validateProbabilityInput({
      probability: '45',
      source: 'manual',
      reasonNote: 'Buyer requested override after verbal confirmation',
    });
    expect(valid.ok).toBe(true);

    const invalid = validateProbabilityInput({
      probability: '45',
      source: 'manual',
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.code).toBe('manual_probability_requires_reason');
    }
  });

  it('flags open risks and stage age exceedance', () => {
    const flags = evaluateRiskRules({
      stage: 'solution_alignment',
      openRiskFlagCount: 2,
      daysInStage: 45,
      maxAgeDays: 30,
    });
    expect(flags.map((flag) => flag.flagKey)).toEqual(
      expect.arrayContaining(['open_risk_flags_present', 'stage_age_exceeded']),
    );
  });
});
