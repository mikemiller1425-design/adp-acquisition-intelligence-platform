import {
  assertConfidenceComponents,
  confidenceComponentKeys,
  type ConfidenceComponents,
} from '../domain/evidence.js';
import {
  AllowListCapabilityChecker,
  type CapabilityActor,
  type CapabilityChecker,
  type ConfidenceAssessment,
  type ConfidenceAssessmentRepository,
  type EvidenceAuditPort,
  type EvidenceOutboxPort,
} from '../domain/ports.js';

export type ConfidenceAssessmentExplanation = {
  aggregateScore: null;
  status: 'unassessed' | 'provisional';
  policyVersion: string | null;
  components: ConfidenceComponents;
  explanation: string;
};

export class ConfidenceAssessmentService {
  constructor(
    private readonly assessments: ConfidenceAssessmentRepository,
    private readonly authz: CapabilityChecker = new AllowListCapabilityChecker(),
    private readonly audit?: EvidenceAuditPort,
    private readonly outbox?: EvidenceOutboxPort,
  ) {}

  async assess(command: {
    subjectType: 'variable_value' | 'evidence_record';
    subjectId: string;
    components?: ConfidenceComponents;
    policyVersion?: string | null;
    actor: CapabilityActor;
  }): Promise<{ assessment: ConfidenceAssessment; explanation: ConfidenceAssessmentExplanation }> {
    await this.authz.assertCan(command.actor, 'confidence:assess');
    const components = command.components ?? {};
    assertConfidenceComponents(components);
    const hasComponents = confidenceComponentKeys.some((key) => components[key] !== undefined);
    const status = hasComponents ? 'provisional' : 'unassessed';
    const policyVersion = command.policyVersion ?? null;
    const explanation = explain(components, policyVersion, status);
    const assessment = await this.assessments.insert({
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      components,
      aggregateScore: null,
      status,
      policyVersion,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'confidence_assessed',
      subjectType: 'system',
      subjectId: null,
      correlationId: null,
      metadata: {
        assessmentId: assessment.id,
        subjectType: command.subjectType,
        subjectId: command.subjectId,
        envelopeVersion: 1,
      },
    });
    await this.outbox?.insert({
      aggregateType: 'system',
      aggregateId: command.subjectId,
      eventType: 'confidence.assessed',
      idempotencyKey: `confidence.assessed:${assessment.id}`,
      payload: {
        assessmentId: assessment.id,
        subjectType: command.subjectType,
        subjectId: command.subjectId,
        aggregateScore: null,
        status,
      },
      metadata: { envelopeVersion: 1 },
    });

    return { assessment, explanation };
  }

  explain(
    components: ConfidenceComponents,
    policyVersion: string | null = null,
  ): ConfidenceAssessmentExplanation {
    assertConfidenceComponents(components);
    const hasComponents = confidenceComponentKeys.some((key) => components[key] !== undefined);
    return explain(components, policyVersion, hasComponents ? 'provisional' : 'unassessed');
  }
}

function explain(
  components: ConfidenceComponents,
  policyVersion: string | null,
  status: 'unassessed' | 'provisional',
): ConfidenceAssessmentExplanation {
  return {
    aggregateScore: null,
    status,
    policyVersion,
    components,
    explanation:
      policyVersion === null
        ? 'No approved confidence aggregation policy is attached; aggregateScore remains null.'
        : 'Policy version was recorded, but no approved aggregation formula is implemented; aggregateScore remains null.',
  };
}
