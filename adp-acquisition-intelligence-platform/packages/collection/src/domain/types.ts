import type { ImportStatus } from './import-lifecycle.js';

export type CollectionRole = 'admin' | 'researcher' | 'sales' | 'reviewer';

export type CollectionCapability =
  | 'manual_entry:create'
  | 'import:upload'
  | 'import:map'
  | 'import:validate'
  | 'import:dry_run'
  | 'duplicate:review'
  | 'import:commit'
  | 'import:reverse'
  | 'import:report'
  | 'merge:preview'
  | 'merge:approve'
  | 'merge:reverse';

export type CollectionActor = {
  userId: string | null;
  roles: readonly CollectionRole[];
};

export type CollectionSubject = 'organization' | 'location' | 'contact';

export type ImportBatch = {
  id: string;
  status: ImportStatus;
  originalFilename: string;
  storageKey: string;
  contentType: string;
  idempotencyKey: string;
  mapping: Record<string, string> | null;
  registryVersion: string | null;
  dryRunReport: ImportDryRunReport | null;
  rowCount: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  committedAt: Date | null;
  reversedAt: Date | null;
};

export type ImportRowStatus =
  | 'pending'
  | 'valid'
  | 'invalid'
  | 'duplicate_blocked'
  | 'committed'
  | 'failed'
  | 'reversed';

export type ImportRow = {
  id: string;
  batchId: string;
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, string | null>;
  normalized: Record<string, unknown>;
  status: ImportRowStatus;
  errors: string[];
  createdOrganizationId: string | null;
  createdContactId: string | null;
  createdLocationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DuplicateDisposition = 'new_record' | 'link_existing' | 'skip' | 'needs_research';

export type DuplicateReview = {
  id: string;
  batchId: string;
  rowId: string;
  candidateOrganizationId: string;
  tier: string;
  features: unknown;
  disposition: DuplicateDisposition | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

export type ImportDryRunReport = {
  generatedAt: string;
  validRows: number;
  invalidRows: number;
  duplicateCandidates: number;
  duplicatePolicyVersion: string;
  proposedCreates: {
    organizations: number;
    locations: number;
    contacts: number;
    variableProposals: number;
  };
};

export type ImportCommitReport = {
  batchId: string;
  committedRows: number;
  failedRows: number;
  linkedExistingRows: number;
  rowReports: Array<{
    rowId: string;
    status: ImportRowStatus;
    organizationId: string | null;
    contactId: string | null;
    errors: string[];
  }>;
};

export type MergeEventStatus = 'previewed' | 'approved' | 'applied' | 'reversed' | 'blocked';

export type MergeEvent = {
  id: string;
  survivorOrganizationId: string;
  duplicateOrganizationIds: string[];
  plan: unknown;
  status: MergeEventStatus;
  idempotencyKey: string;
  approvedByUserId: string | null;
  appliedAt: Date | null;
  reversedAt: Date | null;
  createdAt: Date;
};
