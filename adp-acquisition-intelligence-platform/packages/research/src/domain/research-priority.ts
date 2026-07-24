export const RESEARCH_PRIORITY_POLICY_VERSION = 'research-priority-draft-v1';

export type ResearchPriorityTier = 'A' | 'B' | 'C' | 'D';

export type ResearchPriorityInput = {
  commercialPotential: 'high' | 'medium' | 'low' | 'unknown';
  qualificationTier: string | null;
  scoreUncertainty: 'high' | 'medium' | 'low';
  completenessGaps: number;
  missingHighImpactVariables: readonly string[];
  confidenceGaps: number;
  staleEvidence: boolean;
  contradictions: boolean;
  buyingTriggers: boolean;
  organizationAccessible: boolean;
  inTerritory: boolean;
  existingRelationship: boolean;
  sourceAvailability: 'high' | 'medium' | 'low' | 'none';
  expectedCollectionCost: 'low' | 'medium' | 'high';
  expectedInformationGain: 'high' | 'medium' | 'low';
  lastResearchDaysAgo: number | null;
};

export type ResearchPriorityAssessment = {
  tier: ResearchPriorityTier;
  explanation: string;
  highImpactMissingVariables: string[];
  recommendedSources: string[];
  estimatedWork: string;
  nextEligibleResearchDate: string | null;
  blockingReasons: string[];
  policyVersion: typeof RESEARCH_PRIORITY_POLICY_VERSION;
  factors: Record<string, unknown>;
  productionActivationGated: true;
};

/**
 * Explainable rules-based draft. Numeric commercial formula is NOT activated
 * for production without owner-approved weights (see research-priority config).
 */
export function assessResearchPriority(input: ResearchPriorityInput): ResearchPriorityAssessment {
  const blocking: string[] = [];
  if (!input.inTerritory) blocking.push('out_of_territory');
  if (input.existingRelationship) blocking.push('existing_relationship');
  if (!input.organizationAccessible) blocking.push('organization_inaccessible');
  if (input.sourceAvailability === 'none') blocking.push('no_approved_source');

  if (blocking.length > 0) {
    return {
      tier: 'D',
      explanation: `Deferred: ${blocking.join(', ')}`,
      highImpactMissingVariables: [...input.missingHighImpactVariables],
      recommendedSources: [],
      estimatedWork: 'none',
      nextEligibleResearchDate: null,
      blockingReasons: blocking,
      policyVersion: RESEARCH_PRIORITY_POLICY_VERSION,
      factors: { ...input },
      productionActivationGated: true,
    };
  }

  const highImpact = input.missingHighImpactVariables.length >= 2 || input.contradictions;
  const gainHigh = input.expectedInformationGain === 'high' || input.scoreUncertainty === 'high';
  const commercialHigh = input.commercialPotential === 'high';
  const costLow = input.expectedCollectionCost === 'low';

  let tier: ResearchPriorityTier = 'C';
  let explanation = 'Bulk enrichment only';
  let estimatedWork = 'bulk';

  if (commercialHigh && gainHigh && highImpact && costLow) {
    tier = 'A';
    explanation = 'Deep research now: high commercial potential, high information gain, low cost';
    estimatedWork = 'deep';
  } else if (
    (commercialHigh || input.commercialPotential === 'medium') &&
    (gainHigh || input.completenessGaps >= 3) &&
    input.sourceAvailability !== 'low'
  ) {
    tier = 'B';
    explanation = 'Standard enrichment: meaningful gaps with available sources';
    estimatedWork = 'standard';
  } else if (input.expectedInformationGain === 'low' && input.completenessGaps === 0) {
    tier = 'D';
    explanation = 'Defer: low expected information gain and no completeness gaps';
    estimatedWork = 'none';
  }

  const recommendedSources =
    tier === 'A' || tier === 'B'
      ? ['organization_website_fixture', 'archived_web_fixture']
      : tier === 'C'
        ? ['archived_web_fixture']
        : [];

  const next =
    tier === 'D'
      ? null
      : new Date(
          Date.now() + (tier === 'A' ? 0 : tier === 'B' ? 86400000 : 604800000),
        ).toISOString();

  return {
    tier,
    explanation,
    highImpactMissingVariables: [...input.missingHighImpactVariables],
    recommendedSources,
    estimatedWork,
    nextEligibleResearchDate: next,
    blockingReasons: [],
    policyVersion: RESEARCH_PRIORITY_POLICY_VERSION,
    factors: { ...input, draftNumericFormulaGated: true },
    productionActivationGated: true,
  };
}
