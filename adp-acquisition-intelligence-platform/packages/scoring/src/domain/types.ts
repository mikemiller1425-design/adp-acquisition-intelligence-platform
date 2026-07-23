export type SubjectType = 'organization' | 'contact';
export type DefinitionStatus = 'draft' | 'active' | 'retired';
export type ApprovalStatus = 'draft_unapproved' | 'pending' | 'approved' | 'rejected';
export type ScoreResultStatus = 'final' | 'provisional' | 'insufficient_data';
export type ValueStatus =
  'known' | 'unknown' | 'not_applicable' | 'withheld' | 'contradicted' | 'stale';
export type ConfidenceStatus = 'unassessed' | 'provisional' | 'assessed';

export type SubjectRef =
  | { subjectType: 'organization'; organizationId: string; contactId?: null }
  | { subjectType: 'contact'; organizationId?: null; contactId: string };

export type TransformName =
  | 'ordinal_linear'
  | 'boolean_flag'
  | 'capped_band'
  | 'percentage_linear'
  | 'enum_map'
  | 'currency_band'
  | 'range_midpoint_band'
  | 'trigger_recency'
  | 'identity_passthrough';

export interface ScoreComponentDefinition {
  key: string;
  variableKey?: string | null;
  variableDefinitionId?: string | null;
  variableDefinitionVersionId?: string | null;
  weight: number;
  transform: TransformName;
  transformConfig?: Record<string, unknown>;
  required?: boolean;
  missingImpact?: 'normal' | 'high';
  displayOrder?: number;
}

export interface ScoreDefinitionVersion {
  id?: string;
  definitionId?: string;
  key: string;
  displayName: string;
  description: string;
  family: 'motion' | 'support' | string;
  subjectType: SubjectType;
  version: string;
  status: DefinitionStatus;
  approvalStatus: ApprovalStatus;
  range: readonly [number, number];
  minimumCompleteness: number;
  tiers: Record<string, number>;
  confidencePolicy: ConfidencePolicyDefinition;
  recommendationPolicy: RecommendationPolicyDefinition;
  allowOptionalWeightRenormalization: boolean;
  components: readonly ScoreComponentDefinition[];
}

export interface CompletenessVariableDefinition {
  key: string;
  weight: number;
  required?: boolean;
}

export interface CompletenessDefinitionVersion {
  id?: string;
  definitionId?: string;
  key: string;
  displayName: string;
  description: string;
  purpose: string;
  subjectType: SubjectType;
  version: string;
  status: DefinitionStatus;
  approvalStatus: ApprovalStatus;
  minimumCompleteness: number;
  variables: readonly CompletenessVariableDefinition[];
}

export interface ScoringInput {
  componentKey: string;
  variableKey?: string | null;
  value: unknown;
  normalizedValue?: unknown;
  valueStatus: ValueStatus;
  valueId?: string | null;
  evidenceIds?: readonly string[];
  confidenceStatus?: ConfidenceStatus;
  confidenceScore?: number | null;
  observedAt?: Date | string | null;
  freshnessResult?: 'fresh' | 'expiring' | 'stale' | 'no_policy' | 'unknown';
}

export interface CompletenessDetail {
  key: string;
  required: boolean;
  applicable: boolean;
  usable: boolean;
  weight: number;
  status: ValueStatus | 'missing';
}

export interface CompletenessResult {
  aggregate: number | null;
  status: ScoreResultStatus;
  missingRequired: string[];
  details: CompletenessDetail[];
  explanation: string;
}

export interface ConfidencePolicyDefinition {
  approvalStatus?: ApprovalStatus;
  minimumAggregate?: number;
  conflictPenalty?: number;
  stalePenalty?: number;
  unassessedDefault?: number;
}

export interface ConfidencePolicyResult {
  aggregate: number | null;
  explanation: string;
}

export interface RecommendationPolicyDefinition {
  strategicPriority?: number;
  nextAction?: string;
  researchPriority?: 'high' | 'medium' | 'low';
}

export interface Recommendation {
  primaryMotion: string | null;
  secondaryMotion: string | null;
  nextAction: string;
  researchPriority: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface ScoreFactor {
  componentKey: string;
  variableValueId: string | null;
  rawValue: unknown;
  normalizedValue: unknown;
  transformedScore: number | null;
  weight: number;
  contribution: number | null;
  status: 'used' | 'missing' | 'not_applicable' | 'withheld' | 'contradicted' | 'stale';
  explanation: string;
}

export interface ScoreCalculationResult {
  scoreKey: string;
  scoreVersion: string;
  status: ScoreResultStatus;
  score: number | null;
  tier: string | null;
  confidence: number | null;
  completeness: number | null;
  factors: ScoreFactor[];
  topPositiveFactors: ScoreFactor[];
  topNegativeFactors: ScoreFactor[];
  missingHighImpactVariables: string[];
  recommendation: Recommendation;
  explanation: Record<string, unknown>;
}
