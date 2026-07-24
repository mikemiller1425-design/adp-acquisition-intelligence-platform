import { assessResearchPriority, type ResearchPriorityInput } from '../domain/research-priority.js';
import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import type { OutboxPort, PriorityRepository } from '../domain/ports.js';

export class ResearchPriorityService {
  constructor(
    private readonly repo: PriorityRepository,
    private readonly outbox: OutboxPort,
  ) {}

  async assess(organizationId: string, input: ResearchPriorityInput, role: ResearchRole) {
    new AllowListResearchCapabilityChecker(role).assert('research_priority:view');
    const assessment = assessResearchPriority(input);
    await this.repo.save(organizationId, assessment);
    await this.outbox.insert({
      aggregateType: 'organization',
      aggregateId: organizationId,
      eventType: 'research.priority_calculated',
      idempotencyKey: `research.priority_calculated:${organizationId}:${assessment.policyVersion}:${assessment.tier}`,
      payload: {
        tier: assessment.tier,
        policyVersion: assessment.policyVersion,
        productionActivationGated: assessment.productionActivationGated,
      },
    });
    return assessment;
  }
}
