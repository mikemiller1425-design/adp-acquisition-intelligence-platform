import { applyClaimReview, type ClaimReviewAction } from '../domain/claim-review.js';
import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import type { UnitOfWorkPort } from '../domain/persistence-ports.js';

/**
 * Human claim review. Accept is atomic across claim transition, evidence,
 * variable proposal, and outbox (including intelligence.recalculation_requested).
 * Score recalculation is requested only via the outbox — never as an external
 * side effect inside the database transaction.
 */
export class ExtractionReviewService {
  constructor(private readonly transactions: UnitOfWorkPort) {}

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
        const evidence = await uow.evidence.createEvidenceFromAcceptedClaim({
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
        const proposed = await uow.variables.proposeFromAcceptedClaim({
          organizationId: claim.organizationId,
          variableKey: claim.variableKey,
          value,
          evidenceId: evidence.evidenceId,
          actorUserId: input.actorUserId,
        });
        variableValueId = proposed.variableValueId;
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
        // Queue recalculation transactionally through the outbox only.
        await uow.outbox.insert({
          aggregateType: 'organization',
          aggregateId: claim.organizationId,
          eventType: 'intelligence.recalculation_requested',
          idempotencyKey: `intelligence.recalculation_requested:${claim.id}`,
          payload: {
            reason: `claim_${transition.next}:${claim.id}`,
            organizationId: claim.organizationId,
          },
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
