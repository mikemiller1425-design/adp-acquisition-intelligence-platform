import { AppError } from '@adp/platform';

export const importStatuses = [
  'uploaded',
  'mapping_required',
  'mapped',
  'validating',
  'validation_failed',
  'preview_ready',
  'duplicate_review_required',
  'ready_to_commit',
  'committing',
  'committed',
  'partially_committed',
  'commit_failed',
  'reverting',
  'reverted',
  'partially_reverted',
  'expired',
  'archived',
] as const;

export type ImportStatus = (typeof importStatuses)[number];

export type ImportLifecycleContext = {
  hasArtifact?: boolean;
  hasMapping?: boolean;
  hasValidRows?: boolean;
  hasValidationErrors?: boolean;
  hasPreviewReport?: boolean;
  hasUnresolvedDuplicates?: boolean;
  hasCommittedRows?: boolean;
  hasUnsafeReversalBlockers?: boolean;
};

const allowedTransitions: Record<ImportStatus, readonly ImportStatus[]> = {
  uploaded: ['mapping_required', 'archived'],
  mapping_required: ['mapped', 'archived'],
  mapped: ['validating', 'mapping_required', 'archived'],
  validating: ['validation_failed', 'preview_ready', 'commit_failed'],
  validation_failed: ['mapped', 'archived'],
  preview_ready: ['duplicate_review_required', 'ready_to_commit', 'archived'],
  duplicate_review_required: ['ready_to_commit', 'archived'],
  ready_to_commit: ['committing', 'archived'],
  committing: ['committed', 'partially_committed', 'commit_failed'],
  committed: ['reverting'],
  partially_committed: ['reverting'],
  commit_failed: ['mapped', 'archived'],
  reverting: ['reverted', 'partially_reverted', 'commit_failed'],
  reverted: [],
  partially_reverted: [],
  expired: [],
  archived: [],
};

export function assertImportTransition(
  from: ImportStatus,
  to: ImportStatus,
  context: ImportLifecycleContext = {},
): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Import batch status transition is not allowed',
      details: { from, to },
    });
  }
  const blockers = transitionBlockers(to, context);
  if (blockers.length > 0) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Import batch transition preconditions are not met',
      details: { from, to, blockers },
    });
  }
}

export function transitionImportStatus(
  from: ImportStatus,
  to: ImportStatus,
  context: ImportLifecycleContext = {},
): ImportStatus {
  assertImportTransition(from, to, context);
  return to;
}

function transitionBlockers(to: ImportStatus, context: ImportLifecycleContext): string[] {
  const blockers: string[] = [];
  if (to === 'mapping_required' && context.hasArtifact !== true) blockers.push('artifact_required');
  if (to === 'mapped' && context.hasMapping !== true) blockers.push('mapping_required');
  if (to === 'preview_ready') {
    if (context.hasMapping !== true) blockers.push('mapping_required');
  }
  if (to === 'preview_ready' && context.hasValidRows !== true) blockers.push('valid_rows_required');
  if (
    (to === 'duplicate_review_required' || to === 'ready_to_commit') &&
    context.hasPreviewReport !== true
  ) {
    blockers.push('preview_report_required');
  }
  if (to === 'ready_to_commit' && context.hasUnresolvedDuplicates === true) {
    blockers.push('duplicate_review_required');
  }
  if (to === 'reverting' && context.hasCommittedRows !== true) {
    blockers.push('committed_rows_required');
  }
  if (to === 'reverted' && context.hasUnsafeReversalBlockers === true) {
    blockers.push('manual_remediation_required');
  }
  return blockers;
}
