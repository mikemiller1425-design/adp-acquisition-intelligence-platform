import { applyClaimReview, type ClaimReviewAction } from '../domain/claim-review.js';
import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import type {
  EvidenceIntegrationPort,
  ScoreRecalcPort,
  VariableIntegrationPort,
} from '../domain/ports.js';
import type { UnitOfWorkPort } from '../domain/persistence-ports.js';

export class ExtractionReviewService {
  constructor(
    private readonly transactions: UnitOfWorkPort,
    private readonly evidence: EvidenceIntegrationPort,
    private readonly variables: VariableIntegrationPort,
    private readonly scores: ScoreRecalcPort,
  ) {}

  async review(input: {
    claimId: string;
    action: ClaimReviewAction;
    actorUserId: string;
    role: ResearchRole;
    rationale?: string;
    correctedValue?: unknown;
  }) {
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

    return this.transactions.runInTransaction(async (uow) => {
      const claim = await uow.claims.get(input.claimId);
      if (!claim) throw new Error('claim_not_found');

      const transition = applyClaimReview(claim.reviewStatus, input.action);
      if (!transition.ok) throw new Error(transition.code);

      let evidenceId: string | undefined;
      let variableValueId: string | undefined;

      if (transition.next === 'accepted' || transition.next === 'accepted_corrected') {
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
        await uow.outbox.insert({
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
        await uow.outbox.insert({
          aggregateType: 'organization',
          aggregateId: claim.organizationId,
          eventType: 'intelligence.recalculation_requested',
          idempotencyKey: `intelligence.recalculation_requested:${claim.id}`,
          payload: { reason: 'accepted_claim' },
        });
      } else if (transition.next === 'rejected') {
        await uow.outbox.insert({
          aggregateType: 'extracted_claim',
          aggregateId: claim.id,
          eventType: 'research.claim_rejected',
          idempotencyKey: `research.claim_rejected:${claim.id}`,
          payload: { variableKey: claim.variableKey },
        });
      }

      const patch: Parameters<(typeof uow.claims)['updateReview']>[1] = {
        reviewStatus: transition.next,
        reviewedByUserId: input.actorUserId,
      };
      if (input.rationale !== undefined) patch.rationale = input.rationale;
      if (input.correctedValue !== undefined) patch.correctedValue = input.correctedValue;
      if (evidenceId !== undefined) patch.canonicalEvidenceId = evidenceId;
      if (variableValueId !== undefined) patch.canonicalVariableValueId = variableValueId;

      return uow.claims.updateReview(input.claimId, patch);
    });
  }
}
