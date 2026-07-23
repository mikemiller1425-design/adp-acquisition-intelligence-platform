export type ApprovedSourceLifecycle =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'enabled'
  | 'suspended'
  | 'retired';

export type ApprovedSourceGate = {
  lifecycle: ApprovedSourceLifecycle;
  killSwitchActive: boolean;
  termsReviewStatus: string;
  privacyReviewStatus: string;
  legalReviewStatus: string;
  securityReviewStatus: string;
  /** When adapterType is fixture, human legal/privacy/security approvals must NOT be faked as approved. */
  adapterType?: string;
};

const FIXTURE_EXEMPT = new Set(['not_required_for_fixture']);

function reviewAcceptable(status: string, adapterType: string | undefined): boolean {
  if (status === 'approved') return true;
  if (adapterType === 'fixture' && FIXTURE_EXEMPT.has(status)) return true;
  return false;
}

export function canExecuteApprovedSource(source: ApprovedSourceGate): SourceExecutionDecision {
  if (source.killSwitchActive) {
    return { allowed: false, code: 'kill_switch', message: 'Kill switch active' };
  }
  if (source.lifecycle !== 'enabled') {
    return {
      allowed: false,
      code: 'lifecycle_not_enabled',
      message: `Source lifecycle is ${source.lifecycle}; only enabled sources may execute`,
    };
  }
  for (const [field, status] of [
    ['terms', source.termsReviewStatus],
    ['privacy', source.privacyReviewStatus],
    ['legal', source.legalReviewStatus],
    ['security', source.securityReviewStatus],
  ] as const) {
    if (!reviewAcceptable(status, source.adapterType)) {
      return {
        allowed: false,
        code: `${field}_not_approved`,
        message: `${field} review status is ${status}`,
      };
    }
  }
  return { allowed: true };
}

export type SourceExecutionDecision =
  | { allowed: true }
  | { allowed: false; code: string; message: string };

/** Cursor/agent must never self-approve legal/security/privacy/licensing. */
export function assertHumanOwnerApprovalRequired(): { selfApprovalForbidden: true } {
  return { selfApprovalForbidden: true };
}
