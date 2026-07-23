import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded', 'error']);

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: healthStatusSchema,
  checkedAt: z.string().datetime(),
  dependencies: z
    .array(
      z.object({
        name: z.string().min(1),
        status: healthStatusSchema,
        detail: z.string().optional(),
      }),
    )
    .default([]),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    correlationId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const qualificationReviewStatusSchema = z.enum([
  'pending',
  'in_review',
  'decided',
  'superseded',
  'cancelled',
]);

export const qualificationOutcomeSchema = z.enum([
  'qualified',
  'conditionally_qualified',
  'research_required',
  'nurture',
  'disqualified',
  'duplicate',
  'existing_relationship',
  'out_of_territory',
]);

export const qualificationConditionTypeSchema = z.enum(['blocking', 'non_blocking']);
export const qualificationConditionStatusSchema = z.enum([
  'pending',
  'resolved',
  'waived',
  'cancelled',
]);
export const qualificationActorRoleSchema = z.enum(['researcher', 'sales', 'reviewer', 'admin']);

export const qualificationActorSchema = z.object({
  userId: z.uuid().nullable(),
  roles: z.array(qualificationActorRoleSchema).min(1),
});

export const qualificationQueueQuerySchema = z.object({
  statuses: z.array(qualificationReviewStatusSchema).optional(),
  assignedToUserId: z.uuid().nullable().optional(),
  limit: z.number().int().positive().max(100).default(25),
});

export const qualificationReviewRequestSchema = z.object({
  organizationId: z.uuid(),
  assignedToUserId: z.uuid().nullable().optional(),
  scoreResultIds: z.array(z.uuid()).default([]),
  computedRecommendation: z.record(z.string(), z.unknown()).nullable().optional(),
  requiredGaps: z.array(z.string().min(1)).default([]),
  consentIndicators: z.record(z.string(), z.unknown()).default({}),
  commandCorrelationId: z.uuid().nullable().optional(),
  actor: qualificationActorSchema,
});

export const qualificationReviewStartSchema = z.object({
  reviewId: z.uuid(),
  expectedRecordVersion: z.number().int().positive(),
  actor: qualificationActorSchema,
});

export const qualificationConditionInputSchema = z.object({
  type: qualificationConditionTypeSchema,
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  ownerUserId: z.uuid(),
  dueDate: z.iso.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const qualificationDecideSchema = z.object({
  reviewId: z.uuid(),
  outcome: qualificationOutcomeSchema,
  expectedReviewVersion: z.number().int().positive(),
  expectedOrganizationRecordVersion: z.number().int().positive(),
  reasonCode: z.string().min(1),
  reasonNote: z.string().nullable().optional(),
  commandCorrelationId: z.uuid().nullable().optional(),
  disqualificationReasonKey: z.string().min(1).nullable().optional(),
  conditions: z.array(qualificationConditionInputSchema).optional(),
  requiredGaps: z.array(z.string().min(1)).optional(),
  reviewerRecommendation: z.record(z.string(), z.unknown()).nullable().optional(),
  overrideReasonCode: z.string().min(1).nullable().optional(),
  overrideReasonNote: z.string().nullable().optional(),
  reviewSummary: z.record(z.string(), z.unknown()).optional(),
  actor: qualificationActorSchema,
});

export const qualificationConditionResolveSchema = z.object({
  conditionId: z.uuid(),
  resolutionNote: z.string().nullable().optional(),
  actor: qualificationActorSchema,
});

export const qualificationConditionWaiveSchema = z.object({
  conditionId: z.uuid(),
  reasonCode: z.string().min(1),
  reasonNote: z.string().nullable().optional(),
  actor: qualificationActorSchema,
});

export const prospectStageSchema = z.enum([
  'raw',
  'normalization',
  'research',
  'scored',
  'review',
  'research_required',
  'qualified',
  'discovery_scheduled',
  'discovery_completed',
  'outreach_ready',
  'outreach_active',
  'opportunity',
  'nurture',
  'disqualified',
  'duplicate',
  'existing_relationship',
  'out_of_territory',
]);

export const reentryRequestSchema = z.object({
  organizationId: z.uuid(),
  from: prospectStageSchema,
  to: prospectStageSchema,
  expectedOrganizationRecordVersion: z.number().int().positive(),
  reasonCode: z.string().min(1),
  reasonNote: z.string().nullable().optional(),
  ownerUserId: z.uuid(),
  dueDate: z.iso.date(),
  commandCorrelationId: z.uuid().nullable().optional(),
  validationResultSnapshot: z.record(z.string(), z.unknown()).optional(),
  actor: qualificationActorSchema,
});

export const transitionPreviewRequestSchema = z.object({
  from: prospectStageSchema,
  to: prospectStageSchema,
});

export type QualificationReviewRequest = z.infer<typeof qualificationReviewRequestSchema>;
export type QualificationReviewStart = z.infer<typeof qualificationReviewStartSchema>;
export type QualificationDecide = z.infer<typeof qualificationDecideSchema>;
export type QualificationConditionResolve = z.infer<typeof qualificationConditionResolveSchema>;
export type QualificationConditionWaive = z.infer<typeof qualificationConditionWaiveSchema>;
export type ReentryRequest = z.infer<typeof reentryRequestSchema>;
export type TransitionPreviewRequest = z.infer<typeof transitionPreviewRequestSchema>;
