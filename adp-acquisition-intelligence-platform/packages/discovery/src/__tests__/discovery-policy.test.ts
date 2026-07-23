import { describe, expect, it } from 'vitest';

import { canCompleteSession, recommendAfterMapping } from '../domain/discovery.js';

describe('discovery policy', () => {
  it('blocks completion when required agenda items are unanswered', () => {
    const result = canCompleteSession({
      requiredAgendaItemIds: ['a', 'b'],
      answeredAgendaItemIds: ['a'],
      openProposedMappingCount: 0,
    });
    expect(result).toEqual({
      ok: false,
      reasons: ['required_agenda_item_unanswered:b'],
    });
  });

  it('blocks completion while mappings remain proposed', () => {
    const result = canCompleteSession({
      requiredAgendaItemIds: ['a'],
      answeredAgendaItemIds: ['a'],
      openProposedMappingCount: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain('proposed_mappings_unreviewed');
    }
  });

  it('recommends outreach readiness after confirmed mappings', () => {
    const recommendation = recommendAfterMapping({
      confirmedCount: 1,
      rejectedCount: 0,
      openProposedCount: 0,
      scoreMovements: [{ scoreKey: 'acquisition_fit', before: 40, after: 55 }],
      openBlockingConditions: 0,
    });
    expect(recommendation.nextAction).toBe('advance_to_outreach_ready');
  });

  it('recommends qualification reassessment when blocking conditions remain', () => {
    const recommendation = recommendAfterMapping({
      confirmedCount: 1,
      rejectedCount: 0,
      openProposedCount: 0,
      scoreMovements: [],
      openBlockingConditions: 1,
    });
    expect(recommendation.nextAction).toBe('reassess_qualification');
  });
});
