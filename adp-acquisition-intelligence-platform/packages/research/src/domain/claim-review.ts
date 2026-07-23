export type ClaimReviewAction =
  | 'accept'
  | 'accept_with_correction'
  | 'reject'
  | 'mark_duplicate'
  | 'mark_contradictory'
  | 'request_additional_research'
  | 'defer'
  | 'report_source_problem';

export type ClaimReviewStatus =
  | 'proposed'
  | 'accepted'
  | 'accepted_corrected'
  | 'rejected'
  | 'duplicate'
  | 'contradictory'
  | 'deferred'
  | 'needs_research'
  | 'source_problem';

const TRANSITIONS: Record<ClaimReviewAction, ClaimReviewStatus> = {
  accept: 'accepted',
  accept_with_correction: 'accepted_corrected',
  reject: 'rejected',
  mark_duplicate: 'duplicate',
  mark_contradictory: 'contradictory',
  request_additional_research: 'needs_research',
  defer: 'deferred',
  report_source_problem: 'source_problem',
};

export function applyClaimReview(
  current: ClaimReviewStatus,
  action: ClaimReviewAction,
): { ok: true; next: ClaimReviewStatus } | { ok: false; code: string } {
  if (current !== 'proposed' && current !== 'deferred' && current !== 'needs_research') {
    return { ok: false, code: 'claim_not_reviewable' };
  }
  if (action === 'accept_with_correction') {
    // correction value validated by caller
  }
  return { ok: true, next: TRANSITIONS[action] };
}

export function claimRequiresHumanReview(_claim: {
  variableKey: string;
  confidenceComponents: Record<string, number>;
}): true {
  // Initial policy: ALL extracted claims require review. Auto-accept is gated.
  return true;
}
