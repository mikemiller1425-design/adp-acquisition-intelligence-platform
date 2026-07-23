import {
  approvedSources,
  collectionRuns,
  evidenceRecords,
  extractedClaims,
  organizations,
  outboxEvents,
  populationImports,
  populationSources,
  rawCandidates,
  researchPriorityAssessments,
  sourceSnapshots,
  variableValues,
  type RepositoryExecutor,
} from '@adp/database';
import { count, desc, eq } from 'drizzle-orm';

import type { ApprovedSourceRecord } from '../domain/persistence-ports.js';
import type { ClaimRecord, PopulationImportRecord, RawCandidateRecord } from '../domain/ports.js';
import type { ResearchPriorityAssessment } from '../domain/research-priority.js';
import type { CollectionRunRecord } from '../domain/persistence-ports.js';
import type { ResearchUnitOfWork } from '../domain/persistence-ports.js';
import type {
  InMemoryApprovedSourceRepository,
  InMemoryClaimRepository,
  InMemoryOrganizationLookup,
  InMemoryOutbox,
  InMemoryPopulationRepository,
  InMemoryPriorityRepository,
} from './in-memory.js';

export type ResearchWorkflowSnapshot = {
  imports: PopulationImportRecord[];
  candidates: RawCandidateRecord[];
  organizations: Array<{ organizationId: string; displayName: string; domain: string | null }>;
  claims: ClaimRecord[];
  collectionRuns: CollectionRunRecord[];
  priorities: Array<{ organizationId: string; assessment: ResearchPriorityAssessment }>;
  outboxEventTypes: string[];
  scoresRecalculated: number;
  metrics: {
    rawCandidates: number;
    claimsAwaiting: number;
    claimsAccepted: number;
    collectionRunsTotal: number;
    scoresRecalculated: number;
    evidenceRecords: number;
    variableProposals: number;
    snapshots: number;
  };
};

const FIXTURE_SOURCE: ApprovedSourceRecord = {
  id: '00000000-0000-4000-8000-0000000000a1',
  sourceKey: 'organization_website_fixture',
  displayName: 'Organization Website (Fixture)',
  domains: ['*'],
  adapterType: 'fixture',
  classification: 'live_simulated',
  businessPurpose: 'controlled_pilot_collection',
  permittedOrganizationTypes: ['accounting'],
  permittedFields: ['services'],
  prohibitedFields: ['personal_email'],
  termsReviewStatus: 'not_required_for_fixture',
  robotsBehavior: 'respect',
  privacyReviewStatus: 'not_required_for_fixture',
  legalReviewStatus: 'not_required_for_fixture',
  securityReviewStatus: 'not_required_for_fixture',
  rateLimitPerMinute: 60,
  concurrencyLimit: 2,
  pageLimit: 3,
  responseSizeLimitBytes: 1_048_576,
  timeoutMs: 5_000,
  redirectPolicy: 'same_registrable_domain',
  refreshIntervalHours: 168,
  snapshotRetentionDays: 90,
  parserVersion: 'v1',
  owner: 'research_eng',
  lifecycle: 'enabled',
  killSwitchActive: false,
  approvalEvidence: { note: 'fixture_exemption_not_human_approval' },
};

export function getFixtureApprovedSource(): ApprovedSourceRecord {
  return { ...FIXTURE_SOURCE };
}

export const FIXTURE_POPULATION_SOURCE_ID = '00000000-0000-4000-8000-0000000000b1';

export async function seedFixtureApprovedSource(
  uow: ResearchUnitOfWork,
  db?: RepositoryExecutor | null,
): Promise<void> {
  const memory = uow.approvedSources as InMemoryApprovedSourceRepository;
  if (typeof memory.seed === 'function') {
    memory.seed(FIXTURE_SOURCE);
    return;
  }
  if (!db) return;
  await db
    .insert(populationSources)
    .values({
      id: FIXTURE_POPULATION_SOURCE_ID,
      sourceKey: 'fixture_csv',
      displayName: 'Fixture CSV Universe',
      provider: 'fixture',
      sourceType: 'csv',
      licenseStatus: 'internal_fixture',
      permittedFields: ['displayName', 'website', 'city', 'region', 'phone'],
      prohibitedFields: [],
      dataOwner: 'research_eng',
      approvalStatus: 'approved',
      currentVersion: 'v1',
      metadata: { note: 'fixture_only' },
    })
    .onConflictDoNothing({ target: populationSources.sourceKey });

  await db
    .insert(approvedSources)
    .values({
      id: FIXTURE_SOURCE.id,
      sourceKey: FIXTURE_SOURCE.sourceKey,
      displayName: FIXTURE_SOURCE.displayName,
      domains: FIXTURE_SOURCE.domains,
      adapterType: 'fixture',
      classification: FIXTURE_SOURCE.classification,
      businessPurpose: FIXTURE_SOURCE.businessPurpose,
      permittedOrganizationTypes: FIXTURE_SOURCE.permittedOrganizationTypes,
      permittedFields: FIXTURE_SOURCE.permittedFields,
      prohibitedFields: FIXTURE_SOURCE.prohibitedFields,
      termsReviewStatus: FIXTURE_SOURCE.termsReviewStatus,
      robotsBehavior: FIXTURE_SOURCE.robotsBehavior,
      privacyReviewStatus: FIXTURE_SOURCE.privacyReviewStatus,
      legalReviewStatus: FIXTURE_SOURCE.legalReviewStatus,
      securityReviewStatus: FIXTURE_SOURCE.securityReviewStatus,
      rateLimitPerMinute: FIXTURE_SOURCE.rateLimitPerMinute,
      concurrencyLimit: FIXTURE_SOURCE.concurrencyLimit,
      pageLimit: FIXTURE_SOURCE.pageLimit,
      responseSizeLimitBytes: FIXTURE_SOURCE.responseSizeLimitBytes,
      timeoutMs: FIXTURE_SOURCE.timeoutMs,
      redirectPolicy: FIXTURE_SOURCE.redirectPolicy,
      refreshIntervalHours: FIXTURE_SOURCE.refreshIntervalHours,
      snapshotRetentionDays: FIXTURE_SOURCE.snapshotRetentionDays,
      parserVersion: FIXTURE_SOURCE.parserVersion,
      owner: FIXTURE_SOURCE.owner,
      lifecycle: 'enabled',
      killSwitchActive: false,
      approvalEvidence: FIXTURE_SOURCE.approvalEvidence,
    })
    .onConflictDoNothing({ target: approvedSources.sourceKey });
}

export async function getMemoryResearchWorkflowSnapshot(
  uow: ResearchUnitOfWork,
): Promise<ResearchWorkflowSnapshot> {
  const population = uow.population as InMemoryPopulationRepository;
  const claimsRepo = uow.claims as InMemoryClaimRepository;
  const priorityRepo = uow.priority as InMemoryPriorityRepository;
  const orgs = uow.organizations as InMemoryOrganizationLookup;
  const outbox = uow.outbox as InMemoryOutbox;
  const collectionRuns = await uow.collectionRuns.list();

  const imports = [...population.imports.values()];
  const candidates = [...population.candidates.values()].flat();
  const claims = [...claimsRepo.claims.values()];
  const priorities = [...priorityRepo.assessments.entries()].map(
    ([organizationId, assessment]) => ({
      organizationId,
      assessment,
    }),
  );
  const claimsAwaiting = claims.filter((c) => c.reviewStatus === 'proposed').length;
  const claimsAccepted = claims.filter(
    (c) => c.reviewStatus === 'accepted' || c.reviewStatus === 'accepted_corrected',
  ).length;
  const scoresRecalculated = outbox.events.filter(
    (e) => e.eventType === 'intelligence.recalculation_requested',
  ).length;

  return {
    imports,
    candidates,
    organizations: orgs.orgs.map((o) => ({
      organizationId: o.organizationId,
      displayName: o.displayName ?? 'Unknown',
      domain: o.domain ?? null,
    })),
    claims,
    collectionRuns,
    priorities,
    outboxEventTypes: outbox.events.map((e) => String(e.eventType)),
    scoresRecalculated,
    metrics: {
      rawCandidates: candidates.length,
      claimsAwaiting,
      claimsAccepted,
      collectionRunsTotal: collectionRuns.length,
      scoresRecalculated,
      evidenceRecords: 0,
      variableProposals: 0,
      snapshots: 0,
    },
  };
}

export async function getPostgresResearchWorkflowSnapshot(
  db: RepositoryExecutor,
): Promise<ResearchWorkflowSnapshot> {
  const importRows = await db
    .select()
    .from(populationImports)
    .orderBy(desc(populationImports.createdAt));
  const candidateRows = await db.select().from(rawCandidates);
  const orgRows = await db
    .select({
      organizationId: organizations.id,
      displayName: organizations.displayName,
      domain: organizations.domain,
    })
    .from(organizations)
    .orderBy(desc(organizations.createdAt))
    .limit(50);
  const claimRows = await db
    .select()
    .from(extractedClaims)
    .orderBy(desc(extractedClaims.createdAt));
  const runRows = await db.select().from(collectionRuns).orderBy(desc(collectionRuns.createdAt));
  const priorityRows = await db.select().from(researchPriorityAssessments);
  const outboxRows = await db
    .select({ eventType: outboxEvents.eventType })
    .from(outboxEvents)
    .orderBy(desc(outboxEvents.createdAt))
    .limit(200);

  const [evidenceCount] = await db.select({ value: count() }).from(evidenceRecords);
  const [variableCount] = await db
    .select({ value: count() })
    .from(variableValues)
    .where(eq(variableValues.lifecycle, 'proposed'));
  const [snapshotCount] = await db.select({ value: count() }).from(sourceSnapshots);

  const imports: PopulationImportRecord[] = importRows.map((row) => ({
    id: row.id,
    populationSourceId: row.populationSourceId,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    dryRun: row.dryRun,
    rowCount: row.rowCount,
    report: (row.report ?? {}) as Record<string, unknown>,
  }));
  const candidates: RawCandidateRecord[] = candidateRows.map((row) => ({
    id: row.id,
    identityKey: row.identityKey,
    displayName: row.displayName,
    legalName: row.legalName,
    domain: row.domain,
    website: row.website,
    phone: row.phone,
    addressLine1: row.addressLine1,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    aliases: row.aliases ?? [],
    status: row.status,
    organizationId: row.organizationId,
  }));
  const claims: ClaimRecord[] = claimRows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    variableKey: row.variableKey,
    reviewStatus: row.reviewStatus as ClaimRecord['reviewStatus'],
    proposedValue: row.proposedValue,
    originalExcerpt: row.originalExcerpt,
    sourceUrl: row.sourceUrl,
    sourceSnapshotId: row.sourceSnapshotId,
  }));
  const collectionRunRecords: CollectionRunRecord[] = runRows.map((row) => ({
    id: row.id,
    status: row.status as CollectionRunRecord['status'],
    approvedSourceId: row.approvedSourceId,
    policyVersion: row.policyVersion,
    idempotencyKey: row.idempotencyKey,
    killSwitchObserved: row.killSwitchObserved,
    targetCount: row.targetCount,
    completedCount: row.completedCount,
    failedCount: row.failedCount,
    blockedCount: row.blockedCount,
    summary: (row.summary ?? {}) as Record<string, unknown>,
    requestedByUserId: row.requestedByUserId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
  }));

  const claimsAwaiting = claims.filter((c) => c.reviewStatus === 'proposed').length;
  const claimsAccepted = claims.filter(
    (c) => c.reviewStatus === 'accepted' || c.reviewStatus === 'accepted_corrected',
  ).length;
  const scoresRecalculated = outboxRows.filter(
    (e) => e.eventType === 'intelligence.recalculation_requested',
  ).length;

  return {
    imports,
    candidates,
    organizations: orgRows.map((o) => ({
      organizationId: o.organizationId,
      displayName: o.displayName,
      domain: o.domain,
    })),
    claims,
    collectionRuns: collectionRunRecords,
    priorities: priorityRows.map((p) => ({
      organizationId: p.organizationId,
      assessment: {
        tier: p.tier,
        explanation: p.explanation,
        highImpactMissingVariables: p.highImpactMissingVariables ?? [],
        recommendedSources: p.recommendedSources ?? [],
        estimatedWork: p.estimatedWork ?? '',
        nextEligibleResearchDate: p.nextEligibleResearchAt?.toISOString() ?? null,
        blockingReasons: p.blockingReasons ?? [],
        policyVersion: p.policyVersion as ResearchPriorityAssessment['policyVersion'],
        factors: (p.factors ?? {}) as Record<string, unknown>,
        productionActivationGated: true as const,
      },
    })),
    outboxEventTypes: outboxRows.map((e) => e.eventType),
    scoresRecalculated,
    metrics: {
      rawCandidates: candidates.length,
      claimsAwaiting,
      claimsAccepted,
      collectionRunsTotal: collectionRunRecords.length,
      scoresRecalculated,
      evidenceRecords: Number(evidenceCount?.value ?? 0),
      variableProposals: Number(variableCount?.value ?? 0),
      snapshots: Number(snapshotCount?.value ?? 0),
    },
  };
}

export async function getPersistenceProbe(db: RepositoryExecutor) {
  const tables = {
    population_imports: Number(
      (await db.select({ value: count() }).from(populationImports))[0]?.value ?? 0,
    ),
    raw_candidates: Number(
      (await db.select({ value: count() }).from(rawCandidates))[0]?.value ?? 0,
    ),
    organizations: Number((await db.select({ value: count() }).from(organizations))[0]?.value ?? 0),
    collection_runs: Number(
      (await db.select({ value: count() }).from(collectionRuns))[0]?.value ?? 0,
    ),
    source_snapshots: Number(
      (await db.select({ value: count() }).from(sourceSnapshots))[0]?.value ?? 0,
    ),
    extracted_claims: Number(
      (await db.select({ value: count() }).from(extractedClaims))[0]?.value ?? 0,
    ),
    evidence_records: Number(
      (await db.select({ value: count() }).from(evidenceRecords))[0]?.value ?? 0,
    ),
    variable_values: Number(
      (await db.select({ value: count() }).from(variableValues))[0]?.value ?? 0,
    ),
    outbox_events: Number((await db.select({ value: count() }).from(outboxEvents))[0]?.value ?? 0),
    research_priority_assessments: Number(
      (await db.select({ value: count() }).from(researchPriorityAssessments))[0]?.value ?? 0,
    ),
  };
  return tables;
}
