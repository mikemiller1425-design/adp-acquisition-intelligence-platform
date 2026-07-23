import { describe, expect, it } from 'vitest';

import { OperationalStateService } from '../application/operational-state-service.js';
import type {
  OperationalStateTransition,
  OperationalStateTransitionRepository,
  OrganizationState,
  OrganizationStateWriter,
} from '../domain/ports.js';

const baseOrg: OrganizationState = {
  id: 'org-1',
  prospectStage: 'raw',
  researchStatus: 'not_started',
  outreachStatus: 'not_started',
  dataFreshnessStatus: 'unknown',
  recordStatus: 'active',
  recordVersion: 1,
};

class MemoryOrganizationStateWriter implements OrganizationStateWriter {
  state: OrganizationState | null = { ...baseOrg };
  updateCalls = 0;

  async findOrganizationState(organizationId: string): Promise<OrganizationState | null> {
    return this.state?.id === organizationId ? this.state : null;
  }

  async updateOrganizationStateIfVersion(
    input: Parameters<OrganizationStateWriter['updateOrganizationStateIfVersion']>[0],
  ): Promise<OrganizationState | null> {
    if (
      this.state === null ||
      this.state.id !== input.organizationId ||
      this.state.recordVersion !== input.expectedRecordVersion ||
      this.state.recordStatus !== 'active'
    ) {
      return null;
    }
    this.updateCalls += 1;
    this.state = {
      ...this.state,
      recordVersion: this.state.recordVersion + 1,
      ...(input.dimension === 'prospect_stage' ? { prospectStage: input.toValue } : {}),
      ...(input.dimension === 'research_status' ? { researchStatus: input.toValue } : {}),
      ...(input.dimension === 'outreach_status' ? { outreachStatus: input.toValue } : {}),
      ...(input.dimension === 'data_freshness_status'
        ? { dataFreshnessStatus: input.toValue }
        : {}),
    } as OrganizationState;
    return this.state;
  }
}

class MemoryTransitions implements OperationalStateTransitionRepository {
  transitions: OperationalStateTransition[] = [];

  async findByCorrelationId(
    input: Parameters<OperationalStateTransitionRepository['findByCorrelationId']>[0],
  ): Promise<OperationalStateTransition | null> {
    return (
      this.transitions.find(
        (transition) =>
          transition.subjectType === input.subjectType &&
          transition.subjectId === input.subjectId &&
          transition.dimension === input.dimension &&
          transition.commandCorrelationId === input.commandCorrelationId,
      ) ?? null
    );
  }

  async insert(
    input: Parameters<OperationalStateTransitionRepository['insert']>[0],
  ): Promise<OperationalStateTransition> {
    const transition: OperationalStateTransition = {
      ...input,
      id: `transition-${this.transitions.length + 1}`,
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
    };
    this.transitions.push(transition);
    return transition;
  }
}

describe('OperationalStateService', () => {
  it('applies legal prospect transitions and inserts history', async () => {
    const writer = new MemoryOrganizationStateWriter();
    const transitions = new MemoryTransitions();
    const service = new OperationalStateService(writer, transitions);

    const result = await service.transitionProspectStage({
      organizationId: 'org-1',
      to: 'normalization',
      expectedRecordVersion: 1,
      actor: { type: 'user', userId: 'user-1' },
      commandCorrelationId: '11111111-1111-1111-1111-111111111111',
    });

    expect(result.organization.prospectStage).toBe('normalization');
    expect(result.organization.recordVersion).toBe(2);
    expect(transitions.transitions).toHaveLength(1);
    expect(transitions.transitions[0]?.fromValue).toBe('raw');
  });

  it('rejects illegal transitions before state changes', async () => {
    const writer = new MemoryOrganizationStateWriter();
    const service = new OperationalStateService(writer, new MemoryTransitions());

    await expect(
      service.transitionProspectStage({
        organizationId: 'org-1',
        to: 'qualified',
        expectedRecordVersion: 1,
        actor: { type: 'user', userId: 'user-1' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(writer.state?.prospectStage).toBe('raw');
    expect(writer.updateCalls).toBe(0);
  });

  it('requires reason and exception authorization for R transitions', async () => {
    const writer = new MemoryOrganizationStateWriter();
    writer.state = { ...baseOrg, prospectStage: 'qualified' };
    const service = new OperationalStateService(writer, new MemoryTransitions());

    await expect(
      service.transitionProspectStage({
        organizationId: 'org-1',
        to: 'nurture',
        expectedRecordVersion: 1,
        actor: { type: 'user', userId: 'reviewer-1' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      service.transitionProspectStage({
        organizationId: 'org-1',
        to: 'nurture',
        expectedRecordVersion: 1,
        actor: { type: 'user', userId: 'reviewer-1' },
        reasonCode: 'parked',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const result = await service.transitionProspectStage({
      organizationId: 'org-1',
      to: 'nurture',
      expectedRecordVersion: 1,
      actor: { type: 'user', userId: 'reviewer-1' },
      reasonCode: 'parked',
      exceptionAuthorized: true,
    });
    expect(result.organization.prospectStage).toBe('nurture');
  });

  it('blocks humans from system-only data freshness transitions', async () => {
    const writer = new MemoryOrganizationStateWriter();
    const service = new OperationalStateService(writer, new MemoryTransitions());

    await expect(
      service.recomputeDataFreshness({
        organizationId: 'org-1',
        to: 'current',
        expectedRecordVersion: 1,
        actor: { type: 'user', userId: 'user-1' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writer.state?.dataFreshnessStatus).toBe('unknown');
  });

  it('returns an existing transition on same correlation id retry', async () => {
    const writer = new MemoryOrganizationStateWriter();
    const transitions = new MemoryTransitions();
    const service = new OperationalStateService(writer, transitions);
    const commandCorrelationId = '22222222-2222-2222-2222-222222222222';

    const first = await service.transitionResearchStatus({
      organizationId: 'org-1',
      to: 'in_progress',
      expectedRecordVersion: 1,
      actor: { type: 'user', userId: 'user-1' },
      commandCorrelationId,
    });
    const second = await service.transitionResearchStatus({
      organizationId: 'org-1',
      to: 'in_progress',
      expectedRecordVersion: 1,
      actor: { type: 'user', userId: 'user-1' },
      commandCorrelationId,
    });

    expect(second.transition.id).toBe(first.transition.id);
    expect(writer.updateCalls).toBe(1);
  });

  it('enforces optimistic concurrency', async () => {
    const writer = new MemoryOrganizationStateWriter();
    const service = new OperationalStateService(writer, new MemoryTransitions());

    await expect(
      service.transitionOutreachStatus({
        organizationId: 'org-1',
        to: 'ready',
        expectedRecordVersion: 2,
        actor: { type: 'user', userId: 'user-1' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(writer.updateCalls).toBe(0);
  });
});
