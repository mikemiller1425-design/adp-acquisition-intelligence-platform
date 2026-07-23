import type {
  Recommendation,
  RecommendationPolicyDefinition,
  ScoreCalculationResult,
  ScoreResultStatus,
} from './types.js';

export interface RecommendationCandidate {
  scoreKey: string;
  family: string;
  status: ScoreResultStatus;
  score: number | null;
  confidence: number | null;
  completeness: number | null;
  policy: RecommendationPolicyDefinition;
}

export function recommendationForScore(input: {
  scoreKey: string;
  family: string;
  status: ScoreResultStatus;
  tier: string | null;
  policy: RecommendationPolicyDefinition;
}): Recommendation {
  const priority = input.policy.researchPriority ?? researchPriority(input.status, input.tier);
  return {
    primaryMotion:
      input.family === 'motion' && input.status !== 'insufficient_data' ? input.scoreKey : null,
    secondaryMotion: null,
    nextAction: input.policy.nextAction ?? defaultAction(input.status),
    researchPriority: priority,
    explanation: 'Recommendation is deterministic and keeps fit, urgency, and revenue separate.',
  };
}

export function chooseRecommendation(
  candidates: readonly RecommendationCandidate[],
): Recommendation {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.family === 'motion' &&
      candidate.status !== 'insufficient_data' &&
      candidate.score !== null,
  );
  const ordered = [...eligible].sort(compareCandidates);
  const primary = ordered[0];
  if (primary === undefined) {
    return {
      primaryMotion: null,
      secondaryMotion: null,
      nextAction: 'Human review required before recommending a motion.',
      researchPriority: 'high',
      explanation: 'No eligible motion had sufficient data.',
    };
  }

  const secondary = ordered.find(
    (candidate) =>
      candidate.scoreKey !== primary.scoreKey &&
      Math.abs((primary.score ?? 0) - (candidate.score ?? 0)) <= 5,
  );

  return {
    primaryMotion: primary.scoreKey,
    secondaryMotion: secondary?.scoreKey ?? null,
    nextAction: primary.policy.nextAction ?? 'Review recommended motion with a human owner.',
    researchPriority: primary.policy.researchPriority ?? 'medium',
    explanation:
      'Tie order is final over provisional, confidence, completeness, strategic priority.',
  };
}

export function compareResultsForReplay(
  left: Pick<ScoreCalculationResult, 'score' | 'status' | 'confidence' | 'completeness'>,
  right: Pick<ScoreCalculationResult, 'score' | 'status' | 'confidence' | 'completeness'>,
): number {
  return compareCandidates(
    {
      scoreKey: 'left',
      family: 'motion',
      policy: {},
      ...left,
    },
    {
      scoreKey: 'right',
      family: 'motion',
      policy: {},
      ...right,
    },
  );
}

function compareCandidates(left: RecommendationCandidate, right: RecommendationCandidate): number {
  const statusDelta = statusRank(right.status) - statusRank(left.status);
  if (statusDelta !== 0) return statusDelta;
  const confidenceDelta = (right.confidence ?? -1) - (left.confidence ?? -1);
  if (confidenceDelta !== 0) return confidenceDelta;
  const completenessDelta = (right.completeness ?? -1) - (left.completeness ?? -1);
  if (completenessDelta !== 0) return completenessDelta;
  const priorityDelta =
    (left.policy.strategicPriority ?? 999) - (right.policy.strategicPriority ?? 999);
  if (priorityDelta !== 0) return priorityDelta;
  return left.scoreKey.localeCompare(right.scoreKey);
}

function statusRank(status: ScoreResultStatus): number {
  switch (status) {
    case 'final':
      return 2;
    case 'provisional':
      return 1;
    case 'insufficient_data':
      return 0;
  }
}

function researchPriority(
  status: ScoreResultStatus,
  tier: string | null,
): 'high' | 'medium' | 'low' {
  if (status === 'insufficient_data') return 'high';
  if (tier === 'high') return 'low';
  return 'medium';
}

function defaultAction(status: ScoreResultStatus): string {
  return status === 'insufficient_data'
    ? 'Collect required scoring evidence.'
    : 'Review scoring explanation with a human owner.';
}
