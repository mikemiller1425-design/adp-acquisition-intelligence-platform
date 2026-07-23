import { describe, expect, it } from 'vitest';

import {
  qualificationDecideSchema,
  qualificationReviewRequestSchema,
  reentryRequestSchema,
  transitionPreviewRequestSchema,
} from './index.js';

const actor = {
  userId: '11111111-1111-4111-8111-111111111111',
  roles: ['reviewer'],
};

describe('qualification API contracts', () => {
  it('accepts review request payloads with score links and consent indicators', () => {
    const parsed = qualificationReviewRequestSchema.parse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      scoreResultIds: ['33333333-3333-4333-8333-333333333333'],
      computedRecommendation: { primaryMotion: 'payroll' },
      consentIndicators: { email: 'restricted' },
      actor,
    });

    expect(parsed.scoreResultIds).toHaveLength(1);
    expect(parsed.consentIndicators).toEqual({ email: 'restricted' });
  });

  it('validates conditional decision condition owner and due date fields', () => {
    const parsed = qualificationDecideSchema.parse({
      reviewId: '44444444-4444-4444-8444-444444444444',
      outcome: 'conditionally_qualified',
      expectedReviewVersion: 2,
      expectedOrganizationRecordVersion: 5,
      reasonCode: 'accepted_with_conditions',
      conditions: [
        {
          type: 'blocking',
          key: 'confirm_owner',
          title: 'Confirm owner',
          ownerUserId: actor.userId,
          dueDate: '2026-08-01',
        },
      ],
      actor,
    });

    expect(parsed.conditions?.[0]?.dueDate).toBe('2026-08-01');
  });

  it('rejects invalid re-entry targets outside the prospect-stage enum', () => {
    expect(() =>
      reentryRequestSchema.parse({
        organizationId: '55555555-5555-4555-8555-555555555555',
        from: 'nurture',
        to: 'discovery_session',
        expectedOrganizationRecordVersion: 1,
        reasonCode: 'review_requested',
        ownerUserId: actor.userId,
        dueDate: '2026-08-01',
        actor,
      }),
    ).toThrow();
  });

  it('accepts transition preview requests for policy checks', () => {
    expect(
      transitionPreviewRequestSchema.parse({
        from: 'disqualified',
        to: 'review',
      }),
    ).toEqual({ from: 'disqualified', to: 'review' });
  });
});
