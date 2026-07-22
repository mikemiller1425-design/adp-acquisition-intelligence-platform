import { AppError } from '@adp/platform';

export const sourceTypes = [
  'company_website',
  'public_directory',
  'regulatory_record',
  'news',
  'user_entry',
  'import',
  'discovery',
  'internal_record',
  'calculated',
  'ai_assisted_extraction',
  'other',
] as const;

export const sourceStatuses = ['active', 'disabled'] as const;
export const accessClassifications = [
  'public',
  'authenticated',
  'licensed',
  'internal',
  'restricted',
] as const;
export const subjectTypes = ['organization', 'contact'] as const;
export const evidenceTypes = [
  'verified_fact',
  'source_derived_fact',
  'user_entered_fact',
  'calculated',
  'ai_inference',
  'unknown',
] as const;
export const reviewerStatuses = ['pending', 'approved', 'rejected', 'needs_review'] as const;
export const observationStatuses = [
  'proposed',
  'accepted',
  'rejected',
  'contradicted',
  'superseded',
] as const;
export const confidenceAssessmentStatuses = ['unassessed', 'provisional', 'assessed'] as const;
export const freshnessResults = ['fresh', 'expiring', 'stale', 'no_policy', 'unknown'] as const;
export const evidenceRelationshipTypes = [
  'supports',
  'contradicts',
  'verifies',
  'contextualizes',
] as const;
export const permissionEvidenceSubjectTypes = [
  'contact_channel_permission',
  'organization_communication_restriction',
  'suppression_entry',
] as const;

export type SourceType = (typeof sourceTypes)[number];
export type SourceStatus = (typeof sourceStatuses)[number];
export type AccessClassification = (typeof accessClassifications)[number];
export type SubjectType = (typeof subjectTypes)[number];
export type EvidenceType = (typeof evidenceTypes)[number];
export type ReviewerStatus = (typeof reviewerStatuses)[number];
export type ObservationLifecycle = (typeof observationStatuses)[number];
export type ConfidenceAssessmentStatus = (typeof confidenceAssessmentStatuses)[number];
export type FreshnessResult = (typeof freshnessResults)[number];
export type EvidenceRelationshipType = (typeof evidenceRelationshipTypes)[number];
export type PermissionEvidenceSubjectType = (typeof permissionEvidenceSubjectTypes)[number];

export type JsonObject = Record<string, unknown>;

export type SubjectRef =
  | { subjectType: 'organization'; organizationId: string; contactId?: null }
  | { subjectType: 'contact'; organizationId?: null; contactId: string };

export type ConfidenceComponents = {
  sourceReliability?: number | null;
  specificity?: number | null;
  recency?: number | null;
  crossSourceAgreement?: number | null;
  extractionCertainty?: number | null;
};

export const confidenceComponentKeys = [
  'sourceReliability',
  'specificity',
  'recency',
  'crossSourceAgreement',
  'extractionCertainty',
] as const;

export type ConfidenceComponentKey = (typeof confidenceComponentKeys)[number];

export function assertUnitInterval(value: number | null | undefined, name: string): void {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: `${name} must be between 0 and 1`,
      details: { component: name, value },
    });
  }
}

export function assertConfidenceComponents(components: ConfidenceComponents): void {
  for (const key of confidenceComponentKeys) {
    assertUnitInterval(components[key], key);
  }
}

export function subjectColumns(subject: SubjectRef): {
  subjectType: SubjectType;
  organizationId: string | null;
  contactId: string | null;
} {
  return subject.subjectType === 'organization'
    ? { subjectType: 'organization', organizationId: subject.organizationId, contactId: null }
    : { subjectType: 'contact', organizationId: null, contactId: subject.contactId };
}

export function assertEffectiveWindow(input: {
  effectiveAt?: Date | null | undefined;
  expiresAt?: Date | null | undefined;
}): void {
  if (
    input.effectiveAt !== null &&
    input.effectiveAt !== undefined &&
    input.expiresAt !== null &&
    input.expiresAt !== undefined &&
    input.expiresAt <= input.effectiveAt
  ) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'expiresAt must be after effectiveAt',
      details: { effectiveAt: input.effectiveAt, expiresAt: input.expiresAt },
    });
  }
}

const secretKeyPattern =
  /(api[_-]?key|authorization|bearer|client[_-]?secret|cookie|credential|oauth|password|private[_-]?key|refresh[_-]?token|secret|session|token)/i;

export function assertNoCredentialFields(value: unknown, path = 'metadata'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCredentialFields(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Source metadata must not store credentials',
        details: { path: `${path}.${key}` },
      });
    }
    assertNoCredentialFields(child, `${path}.${key}`);
  }
}

export type StalenessEvaluation = {
  result: FreshnessResult;
  explanation: string;
  evaluatedAt: Date;
  expiresAt: Date | null;
};
