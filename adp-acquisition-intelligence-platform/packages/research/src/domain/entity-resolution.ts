import {
  matchDuplicateCandidate,
  type DuplicateCandidate,
  type DuplicateInput,
} from '@adp/collection';

export const ENTITY_RESOLUTION_POLICY_VERSION = 'entity-resolution-v1';

export type ResolutionDecision =
  | 'create_new'
  | 'link_existing'
  | 'create_location'
  | 'possible_duplicate'
  | 'ambiguous_review'
  | 'reject'
  | 'restricted'
  | 'existing_relationship'
  | 'out_of_territory';

export type ResolutionContext = {
  outOfTerritory?: boolean;
  restricted?: boolean;
  existingRelationship?: boolean;
  preferLocationUnderOrgId?: string | null;
};

export type ResolutionResult = {
  decision: ResolutionDecision;
  candidateOrganizationId: string | null;
  matchConfidence: number;
  contributingSignals: Array<{ key: string; explanation: string; weight: number }>;
  conflictingSignals: Array<{ key: string; explanation: string }>;
  decisionVersion: typeof ENTITY_RESOLUTION_POLICY_VERSION;
  explanation: string;
};

export function resolveEntity(
  incoming: DuplicateInput,
  candidates: readonly DuplicateCandidate[],
  context: ResolutionContext = {},
): ResolutionResult {
  if (context.restricted) {
    return base(
      'restricted',
      null,
      0,
      [],
      [{ key: 'policy', explanation: 'Restricted by source/policy' }],
      'Restricted',
    );
  }
  if (context.outOfTerritory) {
    return base(
      'out_of_territory',
      null,
      0,
      [],
      [{ key: 'territory', explanation: 'Outside permitted territory' }],
      'Out of territory',
    );
  }
  if (context.existingRelationship) {
    return base(
      'existing_relationship',
      null,
      0,
      [],
      [{ key: 'relationship', explanation: 'Existing relationship recorded' }],
      'Existing relationship',
    );
  }

  if (candidates.length === 0) {
    return base('create_new', null, 0, [], [], 'No matching organizations; create new');
  }

  const ranked = candidates
    .map((c) => matchDuplicateCandidate(incoming, c))
    .sort((a, b) => score(b.tier) - score(a.tier));

  const best = ranked[0]!;
  const contributing = best.features
    .filter((f) => f.matched)
    .map((f) => ({ key: f.key, explanation: f.explanation, weight: f.weight }));
  const conflicting = best.features
    .filter((f) => !f.matched && (f.key === 'normalized_domain' || f.key === 'legal_name'))
    .map((f) => ({ key: f.key, explanation: `No match: ${f.explanation}` }));

  // Name similarity alone must not auto-merge.
  const nameOnly =
    contributing.length > 0 &&
    contributing.every((c) => c.key === 'legal_name' || c.key === 'aliases') &&
    best.tier !== 'exact';

  if (best.tier === 'exact' && !nameOnly) {
    if (context.preferLocationUnderOrgId === best.candidateOrganizationId) {
      return base(
        'create_location',
        best.candidateOrganizationId,
        confidence(best.tier),
        contributing,
        conflicting,
        'Exact org match with location create recommended',
      );
    }
    return base(
      'link_existing',
      best.candidateOrganizationId,
      confidence(best.tier),
      contributing,
      conflicting,
      'Exact match — link to existing organization',
    );
  }

  if (best.tier === 'likely' && !nameOnly) {
    return base(
      'possible_duplicate',
      best.candidateOrganizationId,
      confidence(best.tier),
      contributing,
      conflicting,
      'Likely match — human review before merge',
    );
  }

  if (best.tier === 'possible' || nameOnly) {
    return base(
      'ambiguous_review',
      best.candidateOrganizationId,
      confidence(best.tier),
      contributing,
      conflicting,
      nameOnly
        ? 'Name-only similarity is insufficient for auto-link'
        : 'Ambiguous match — human review required',
    );
  }

  return base('create_new', null, 0, [], conflicting, 'No usable match; create new');
}

function score(tier: string): number {
  switch (tier) {
    case 'exact':
      return 4;
    case 'likely':
      return 3;
    case 'possible':
      return 2;
    default:
      return 0;
  }
}

function confidence(tier: string): number {
  switch (tier) {
    case 'exact':
      return 95;
    case 'likely':
      return 75;
    case 'possible':
      return 45;
    default:
      return 10;
  }
}

function base(
  decision: ResolutionDecision,
  candidateOrganizationId: string | null,
  matchConfidence: number,
  contributingSignals: ResolutionResult['contributingSignals'],
  conflictingSignals: ResolutionResult['conflictingSignals'],
  explanation: string,
): ResolutionResult {
  return {
    decision,
    candidateOrganizationId,
    matchConfidence,
    contributingSignals,
    conflictingSignals,
    decisionVersion: ENTITY_RESOLUTION_POLICY_VERSION,
    explanation,
  };
}
