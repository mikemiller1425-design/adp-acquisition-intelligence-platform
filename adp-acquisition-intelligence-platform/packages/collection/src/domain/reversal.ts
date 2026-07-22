export type ReversalEligibility = {
  eligible: boolean;
  manualRemediationRequired: boolean;
  blockers: string[];
};

export type ImportReversalInput = {
  batchStatus: 'committed' | 'partially_committed' | 'commit_failed' | 'reverted' | string;
  createdEntityCount: number;
  touchedAfterImportCount: number;
  hasExternalReferences: boolean;
  hasConsentWeakeningRisk: boolean;
};

export type MergeReversalInput = {
  mergeStatus: 'approved' | 'applied' | 'reversed' | string;
  survivorTouchedAfterMerge: boolean;
  duplicateArchivedOnly: boolean;
  movedChildrenTouchedCount: number;
  wouldOrphanHistory: boolean;
};

export function evaluateImportReversal(input: ImportReversalInput): ReversalEligibility {
  const blockers: string[] = [];
  if (!['committed', 'partially_committed'].includes(input.batchStatus)) {
    blockers.push('batch_not_committed');
  }
  if (input.createdEntityCount === 0) blockers.push('no_batch_created_entities');
  if (input.touchedAfterImportCount > 0) blockers.push('entities_touched_after_import');
  if (input.hasExternalReferences) blockers.push('external_references_present');
  if (input.hasConsentWeakeningRisk) blockers.push('consent_preservation_required');
  return eligibility(blockers);
}

export function evaluateMergeReversal(input: MergeReversalInput): ReversalEligibility {
  const blockers: string[] = [];
  if (input.mergeStatus !== 'applied') blockers.push('merge_not_applied');
  if (input.survivorTouchedAfterMerge) blockers.push('survivor_touched_after_merge');
  if (!input.duplicateArchivedOnly) blockers.push('duplicate_has_non_archive_changes');
  if (input.movedChildrenTouchedCount > 0) blockers.push('moved_children_touched_after_merge');
  if (input.wouldOrphanHistory) blockers.push('history_or_evidence_would_be_orphaned');
  return eligibility(blockers);
}

function eligibility(blockers: string[]): ReversalEligibility {
  return {
    eligible: blockers.length === 0,
    manualRemediationRequired: blockers.length > 0,
    blockers,
  };
}
