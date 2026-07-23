import { applyClaimReview, type ClaimReviewAction } from '../domain/claim-review.js';
import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import type {
  ClaimRepository,
  EvidenceIntegrationPort,
  OutboxPort,
  ScoreRecalcPort,
  VariableIntegrationPort,
} from '../domain/ports.js';

export class ExtractionReviewService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly evidence: EvidenceIntegrationPort,
    private readonly variables: VariableIntegrationPort,
    private readonly scores: ScoreRecalcPort,
    private readonly outbox: OutboxPort,
  ) {}

  async review(input: {
    claimId: string;
    action: ClaimReviewAction;
    actorUserId: string;
    role: ResearchRole;
    rationale?: string;
    correctedValue?: unknown;
  }) {
    const claim = await this.claims.get(input.claimId);
    if (!claim) throw new Error('claim_not_found');

    const authz = new AllowListResearchCapabilityChecker(input.role);
    if (input.action === 'accept' || input.action === 'accept_with_correction') {
      authz.assert(input.action === 'accept' ? 'claim:accept' : 'claim:correct');
    } else if (input.action === 'reject') {
      authz.assert('claim:reject');
    } else {
      authz.assert('claim:view');
    }

    if (input.action === 'accept_with_correction' && input.correctedValue === undefined) {
      throw new Error('corrected_value_required');
    }

    const transition = applyClaimReview(claim.reviewStatus, input.action);
    if (!transition.ok) throw new Error(transition.code);

    let evidenceId: string | undefined;
    let variableValueId: string | undefined;

    if (transition.next === 'accepted' || transition.next === 'accepted_corrected') {
      // Collectors never confirm variables; review service proposes via canonical ports.
      const evidence = await this.evidence.createEvidenceFromAcceptedClaim({
        organizationId: claim.organizationId,
        claim: claim.variableKey,
        excerpt: claim.originalExcerpt,
        sourceUrl: claim.sourceUrl,
        snapshotId: claim.sourceSnapshotId,
        actorUserId: input.actorUserId,
      });
      evidenceId = evidence.evidenceId;
      const value =
        transition.next === 'accepted_corrected' ? input.correctedValue : claim.proposedValue;
      const proposed = await this.variables.proposeFromAcceptedClaim({
        organizationId: claim.organizationId,
        variableKey: claim.variableKey,
        value,
        evidenceId: evidence.evidenceId,
        actorUserId: input.actorUserId,
      });
      variableValueId = proposed.variableValueId;
      await this.scores.requestRecalculation(
        claim.organizationId,
        `claim_${transition.next}:${claim.id}`,
      );
      await this.outbox.insert({
        aggregateType: 'extracted_claim',
        aggregateId: claim.id,
        eventType:
          transition.next === 'accepted_corrected'
            ? 'research.claim_corrected'
            : 'research.claim_accepted',
        idempotencyKey: `research.claim_terminal:${claim.id}`,
        payload: {
          variableKey: claim.variableKey,
          evidenceId,
          variableValueId,
        },
      });
      await this.outbox.insert({
        aggregateType: 'organization',
        aggregateId: claim.organizationId,
        eventType: 'intelligence.recalculation_requested',
        idempotencyKey: `intelligence.recalculation_requested:${claim.id}`,
        payload: { reason: 'accepted_claim' },
      });
    } else if (transition.next === 'rejected') {
      await this.outbox.insert({
        aggregateType: 'extracted_claim',
        aggregateId: claim.id,
        eventType: 'research.claim_rejected',
        idempotencyKey: `research.claim_rejected:${claim.id}`,
        payload: { variableKey: claim.variableKey },
      });
    }

    const patch: Parameters<ClaimRepository['updateReview']>[1] = {
      reviewStatus: transition.next,
      reviewedByUserId: input.actorUserId,
    };
    if (input.rationale !== undefined) patch.rationale = input.rationale;
    if (input.correctedValue !== undefined) patch.correctedValue = input.correctedValue;
    if (evidenceId !== undefined) patch.canonicalEvidenceId = evidenceId;
    if (variableValueId !== undefined) patch.canonicalVariableValueId = variableValueId;

    return this.claims.updateReview(input.claimId, patch);
  }
}
