import { describe, expect, it } from 'vitest';

import {
  evaluateReadiness,
  evaluateSequenceEligibility,
  extractTemplateKeys,
  renderTemplate,
  shouldExitForClassification,
  shouldPauseForClassification,
} from '../domain/outreach.js';

describe('outreach policy', () => {
  it('blocks readiness when permission is unknown', () => {
    const assessment = evaluateReadiness({
      prospectStage: 'outreach_ready',
      ownerUserId: 'owner-1',
      contactPresent: true,
      channel: 'email',
      permission: {
        allowed: false,
        state: 'unknown',
        rulingRule: 'unknown',
        evidenceRefs: [],
      },
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.reasons.some((reason) => reason.code === 'permission_blocked')).toBe(true);
  });

  it('renders templates only with provided context keys', () => {
    const rendered = renderTemplate('Hello {{contact_first_name}} from {{organization_name}}', {
      contact_first_name: 'Alex',
      organization_name: 'Atlas Advisory',
    });
    expect(rendered).toBe('Hello Alex from Atlas Advisory');
    expect(() => renderTemplate('Hello {{missing_key}}', {})).toThrow(
      /Missing template context key/,
    );
    expect(extractTemplateKeys('Hi {{contact_first_name}}')).toEqual(['contact_first_name']);
  });

  it('evaluates sequence eligibility with prior step, due date, and permission', () => {
    expect(
      evaluateSequenceEligibility({
        enrollmentStatus: 'active',
        priorStepComplete: true,
        due: true,
        permissionAllowed: true,
      }).eligible,
    ).toBe(true);
    expect(
      evaluateSequenceEligibility({
        enrollmentStatus: 'paused',
        priorStepComplete: true,
        due: true,
        permissionAllowed: true,
      }),
    ).toEqual({ eligible: false, reasons: ['enrollment_status_paused'] });
  });

  it('pauses or exits enrollments for unsubscribe and meeting booked classifications', () => {
    expect(shouldPauseForClassification('unsubscribe')).toBe(true);
    expect(shouldPauseForClassification('meeting_booked')).toBe(true);
    expect(shouldExitForClassification('unsubscribe')).toBe(true);
    expect(shouldExitForClassification('positive')).toBe(false);
  });
});
