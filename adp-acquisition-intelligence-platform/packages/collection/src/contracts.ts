import { z } from 'zod';

export const collectionActorSchema = z.object({
  userId: z.string().uuid().nullable(),
  roles: z.array(z.enum(['admin', 'researcher', 'sales', 'reviewer'])),
});

export const uploadImportCommandSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const uploadImportResponseSchema = z.object({
  batchId: z.string().uuid(),
  status: z.string(),
  rowCount: z.number().int().nonnegative(),
});

export const mapImportCommandSchema = z.object({
  batchId: z.string().uuid(),
  mapping: z.record(z.string().min(1), z.string().min(1)),
});

export const validateImportResponseSchema = z.object({
  batchId: z.string().uuid(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
});

export const dryRunImportResponseSchema = z.object({
  batchId: z.string().uuid(),
  validRows: z.number().int().nonnegative(),
  duplicateCandidates: z.number().int().nonnegative(),
  proposedCreates: z.object({
    organizations: z.number().int().nonnegative(),
    locations: z.number().int().nonnegative(),
    contacts: z.number().int().nonnegative(),
    variableProposals: z.number().int().nonnegative(),
  }),
});

export const duplicateDispositionCommandSchema = z.object({
  reviewId: z.string().uuid(),
  disposition: z.enum(['new_record', 'link_existing', 'skip', 'needs_research']),
});

export const commitImportCommandSchema = z.object({
  batchId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  maxRowsPerTransaction: z.number().int().positive().optional(),
});

export const commitImportResponseSchema = z.object({
  batchId: z.string().uuid(),
  committedRows: z.number().int().nonnegative(),
  failedRows: z.number().int().nonnegative(),
  linkedExistingRows: z.number().int().nonnegative(),
});

export const mergePreviewCommandSchema = z.object({
  survivorOrganizationId: z.string().uuid(),
  duplicateOrganizationIds: z.array(z.string().uuid()).min(1),
  idempotencyKey: z.string().min(1),
});

export type CollectionActorContract = z.infer<typeof collectionActorSchema>;
export type UploadImportCommand = z.infer<typeof uploadImportCommandSchema>;
export type UploadImportResponse = z.infer<typeof uploadImportResponseSchema>;
export type MapImportCommand = z.infer<typeof mapImportCommandSchema>;
export type ValidateImportResponse = z.infer<typeof validateImportResponseSchema>;
export type DryRunImportResponse = z.infer<typeof dryRunImportResponseSchema>;
export type DuplicateDispositionCommand = z.infer<typeof duplicateDispositionCommandSchema>;
export type CommitImportCommand = z.infer<typeof commitImportCommandSchema>;
export type CommitImportResponse = z.infer<typeof commitImportResponseSchema>;
export type MergePreviewCommand = z.infer<typeof mergePreviewCommandSchema>;
