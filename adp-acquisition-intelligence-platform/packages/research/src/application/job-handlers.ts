import {
  InMemoryJobDispatcher,
  type JobDispatcherPort,
  type JobEnvelope,
  type JobHandlerRegistryPort,
} from '@adp/platform';
import { contentHash } from '../domain/snapshot.js';
import { EXTRACTOR_VERSION, extractClaimsFromHtml, MAPPING_VERSION } from '../domain/extraction.js';
import { normalizePopulationRow, type PopulationRow } from '../domain/normalize.js';
import { RESEARCH_JOB_TYPES } from '../domain/jobs.js';
import type { ResearchPriorityInput } from '../domain/research-priority.js';
import type { ResearchRole } from '../domain/authz.js';
import { createResearchRuntime, type ResearchRuntime } from './research-runtime.js';

const DEFAULT_PATHS = ['/', '/about', '/services'] as const;

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`invalid_payload: ${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`invalid_payload: ${key} must be a string`);
  return value;
}

function asRole(value: unknown): ResearchRole {
  if (
    value === 'admin' ||
    value === 'sales' ||
    value === 'reviewer' ||
    value === 'viewer' ||
    value === 'ops'
  ) {
    return value;
  }
  return 'ops';
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function asRows(value: unknown): PopulationRow[] {
  if (!Array.isArray(value)) throw new Error('invalid_payload: rows must be an array');
  return value.map((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`invalid_payload: rows[${index}] must be an object`);
    }
    return row as PopulationRow;
  });
}

function asStringMap(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_payload: mapping must be an object');
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string') throw new Error(`invalid_payload: mapping.${k} must be a string`);
    out[k] = v;
  }
  return out;
}

function asTargets(value: unknown): Array<{ organizationId: string; canonicalDomain: string }> {
  if (!Array.isArray(value)) throw new Error('invalid_payload: targets must be an array');
  return value.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`invalid_payload: targets[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    const organizationId = row.organizationId;
    const canonicalDomain = row.canonicalDomain;
    if (typeof organizationId !== 'string' || !organizationId) {
      throw new Error(`invalid_payload: targets[${index}].organizationId required`);
    }
    if (typeof canonicalDomain !== 'string' || !canonicalDomain) {
      throw new Error(`invalid_payload: targets[${index}].canonicalDomain required`);
    }
    return { organizationId, canonicalDomain: canonicalDomain.toLowerCase() };
  });
}

function defaultPriorityInput(
  overrides: Partial<ResearchPriorityInput> = {},
): ResearchPriorityInput {
  return {
    commercialPotential: 'medium',
    qualificationTier: null,
    scoreUncertainty: 'medium',
    completenessGaps: 2,
    missingHighImpactVariables: [],
    confidenceGaps: 0,
    staleEvidence: false,
    contradictions: false,
    buyingTriggers: false,
    organizationAccessible: true,
    inTerritory: true,
    existingRelationship: false,
    sourceAvailability: 'medium',
    expectedCollectionCost: 'medium',
    expectedInformationGain: 'medium',
    lastResearchDaysAgo: null,
    ...overrides,
  };
}

async function handlePopulationImport(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const payload = job.payload;
  const rows = asRows(payload.rows).slice(0, runtime.maxRowsPerImport);
  const mapping = asStringMap(payload.mapping ?? {});
  await runtime.population.importUniverse({
    populationSourceId: requireString(payload, 'populationSourceId'),
    idempotencyKey:
      optionalString(payload, 'idempotencyKey') ??
      job.idempotencyKey ??
      `population.import:${job.correlationId ?? crypto.randomUUID()}`,
    dryRun: payload.dryRun !== false,
    rows,
    mapping,
    actorUserId: optionalString(payload, 'actorUserId') ?? '00000000-0000-0000-0000-000000000000',
    role: asRole(payload.role),
  });
}

async function handlePopulationNormalize(
  runtime: ResearchRuntime,
  job: JobEnvelope,
): Promise<void> {
  const payload = job.payload;
  const importId = requireString(payload, 'importId');
  const mapping = asStringMap(payload.mapping ?? {});
  const rows = asRows(payload.rows ?? []).slice(0, runtime.maxRowsPerImport);
  const normalized = rows.map((row) => normalizePopulationRow(row, mapping));
  const accepted = normalized.filter((n) => n.validationErrors.length === 0);
  const dryRun = payload.dryRun !== false;
  await runtime.uow.population.updateImport(importId, {
    status: 'normalizing',
    report: {
      acceptedCount: accepted.length,
      rejectedCount: normalized.length - accepted.length,
      dryRun,
      normalizedSample: accepted.slice(0, 20).map((n) => ({
        identityKey: n.identityKey,
        domain: n.domain,
        displayName: n.displayName,
      })),
    },
  });
  // Dry runs must not persist candidates.
  if (accepted.length && !dryRun) {
    await runtime.uow.population.insertCandidates(
      accepted.map((n) => ({
        identityKey: n.identityKey,
        displayName: n.displayName,
        legalName: n.legalName,
        domain: n.domain,
        website: n.website,
        phone: n.phone,
        addressLine1: n.addressLine1,
        city: n.city,
        region: n.region,
        postalCode: n.postalCode,
        aliases: n.aliases,
        status: 'normalized',
        organizationId: null,
      })),
    );
  }
}

async function handlePopulationResolve(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const payload = job.payload;
  const importId = requireString(payload, 'importId');
  const dryRun = payload.dryRun !== false;
  const candidates = (await runtime.uow.population.listCandidates(importId)).slice(
    0,
    runtime.maxRowsPerImport,
  );
  let matched = 0;
  let created = 0;
  let ambiguous = 0;
  for (const candidate of candidates) {
    const dupes = await runtime.uow.organizations.findDuplicateCandidates({
      domain: candidate.domain,
      displayName: candidate.displayName,
      legalName: candidate.legalName,
    });
    if (dupes.length === 1 && dupes[0] && !dryRun) {
      await runtime.uow.organizations.linkCandidate(candidate.id, dupes[0].organizationId);
      matched += 1;
    } else if (dupes.length === 0 && !dryRun) {
      const org = await runtime.uow.organizations.createOrganization({
        displayName: candidate.displayName ?? candidate.legalName ?? 'Unknown Organization',
        legalName: candidate.legalName,
        domain: candidate.domain,
      });
      await runtime.uow.organizations.linkCandidate(candidate.id, org.id);
      created += 1;
    } else if (dupes.length > 1) {
      ambiguous += 1;
    }
  }
  await runtime.uow.population.updateImport(importId, {
    status: dryRun ? 'preview_ready' : 'committed',
    report: { matchedCount: matched, createdCount: created, ambiguousCount: ambiguous },
  });
}

async function handleEnrichmentBulk(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const payload = job.payload;
  const organizationIds = Array.isArray(payload.organizationIds)
    ? payload.organizationIds.filter((id): id is string => typeof id === 'string')
    : [];
  const bounded = organizationIds.slice(0, runtime.maxTargetsPerRun);
  await runtime.uow.outbox.insert({
    aggregateType: 'system',
    aggregateId: job.idempotencyKey ?? crypto.randomUUID(),
    eventType: 'enrichment.bulk.queued',
    idempotencyKey: `enrichment.bulk.queued:${job.idempotencyKey ?? crypto.randomUUID()}`,
    payload: {
      requested: organizationIds.length,
      accepted: bounded.length,
      truncated: organizationIds.length > bounded.length,
      mode: 'fixture_only',
    },
  });
}

async function handleEnrichmentArchive(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const payload = job.payload;
  const organizationId = requireString(payload, 'organizationId');
  await runtime.uow.outbox.insert({
    aggregateType: 'organization',
    aggregateId: organizationId,
    eventType: 'enrichment.archive.blocked_live',
    idempotencyKey: `enrichment.archive.blocked_live:${organizationId}:${job.idempotencyKey ?? 'na'}`,
    payload: {
      reason: 'live_archive_retrieval_disabled',
      liveNetwork: false,
    },
  });
}

async function handleResearchPriority(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const payload = job.payload;
  const organizationId = requireString(payload, 'organizationId');
  const inputPayload =
    payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
      ? (payload.input as Partial<ResearchPriorityInput>)
      : {};
  await runtime.priority.assess(
    organizationId,
    defaultPriorityInput(inputPayload),
    asRole(payload.role),
  );
}

async function handleCollectionRun(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const payload = job.payload;
  const runId = requireString(payload, 'runId');
  const sourceKey = requireString(payload, 'sourceKey');
  const targets = asTargets(payload.targets).slice(0, runtime.maxTargetsPerRun);
  const source = await runtime.uow.approvedSources.getByKey(sourceKey);
  if (!source) {
    throw new Error(`approved_source_not_found:${sourceKey}`);
  }

  const pageLimit = clampInt(
    payload.pageLimit,
    source.pageLimit || runtime.defaultPageLimit,
    1,
    runtime.defaultPageLimit,
  );

  const existing = await runtime.uow.collectionRuns.get(runId);
  if (!existing) {
    await runtime.uow.collectionRuns.create({
      id: runId,
      status: 'queued',
      approvedSourceId: source.id,
      policyVersion: 'collection-policy-v1',
      idempotencyKey:
        optionalString(payload, 'idempotencyKey') ??
        job.idempotencyKey ??
        `collection.run:${runId}`,
      targetCount: targets.length,
      requestedByUserId: null,
    });
  }

  // Concurrency is enforced inside TargetedCollectionService.run — do not double-acquire here.
  const killSwitch = await runtime.uow.approvedSources.getKillSwitch(sourceKey);
  if (killSwitch || source.killSwitchActive) {
    await runtime.uow.collectionRuns
      .updateStatus(runId, 'blocked', {
        killSwitchObserved: true,
        blockedCount: targets.length,
        summary: { code: 'kill_switch' },
        completedAt: new Date(),
      })
      .catch(() => undefined);
    await runtime.uow.outbox.insert({
      aggregateType: 'collection_run',
      aggregateId: runId,
      eventType: 'research.retrieval_blocked',
      idempotencyKey: `research.retrieval_blocked:${runId}:kill_switch`,
      payload: { code: 'kill_switch' },
    });
    return;
  }

  await runtime.collection.run({
    runId,
    source: {
      id: source.id,
      sourceKey: source.sourceKey,
      lifecycle: source.lifecycle,
      killSwitchActive: source.killSwitchActive,
      termsReviewStatus: source.termsReviewStatus,
      privacyReviewStatus: source.privacyReviewStatus,
      legalReviewStatus: source.legalReviewStatus,
      securityReviewStatus: source.securityReviewStatus,
      adapterType: source.adapterType,
      rateLimitPerMinute: source.rateLimitPerMinute,
      concurrencyLimit: source.concurrencyLimit || 2,
      pageLimit,
      responseSizeLimitBytes: source.responseSizeLimitBytes,
      timeoutMs: source.timeoutMs,
      parserVersion: source.parserVersion,
      domains: source.domains,
    },
    targets,
    role: asRole(payload.role),
    ...(payload.previousHashes &&
    typeof payload.previousHashes === 'object' &&
    !Array.isArray(payload.previousHashes)
      ? { previousHashes: payload.previousHashes as Record<string, string> }
      : {}),
    ...(payload.robotsTxtByDomain &&
    typeof payload.robotsTxtByDomain === 'object' &&
    !Array.isArray(payload.robotsTxtByDomain)
      ? { robotsTxtByDomain: payload.robotsTxtByDomain as Record<string, string | null> }
      : {}),
  });
}

async function handleCollectionTargetQueued(
  runtime: ResearchRuntime,
  job: JobEnvelope,
): Promise<void> {
  const payload = job.payload;
  const collectionRunId = requireString(payload, 'collectionRunId');
  const organizationId = requireString(payload, 'organizationId');
  const canonicalDomain = requireString(payload, 'canonicalDomain').toLowerCase();
  const pageLimit = clampInt(
    payload.pageLimit,
    runtime.defaultPageLimit,
    1,
    runtime.defaultPageLimit,
  );
  const paths = DEFAULT_PATHS.slice(0, pageLimit);
  for (const path of paths) {
    await runtime.uow.collectionAttempts.insert({
      collectionRunId,
      organizationId,
      requestedUrl: `https://${canonicalDomain}${path === '/' ? '/' : path}`,
      domain: canonicalDomain,
      status: 'queued',
    });
  }
}

async function handleCollectionPageRetrieve(
  runtime: ResearchRuntime,
  job: JobEnvelope,
): Promise<void> {
  const payload = job.payload;
  const attemptId = optionalString(payload, 'attemptId');
  const url = requireString(payload, 'url');
  const collectionRunId = requireString(payload, 'collectionRunId');
  const pageLimit = clampInt(
    payload.pageLimit,
    runtime.defaultPageLimit,
    1,
    runtime.defaultPageLimit,
  );
  const pageIndex = clampInt(payload.pageIndex, 0, 0, pageLimit - 1);
  if (pageIndex >= pageLimit) {
    throw new Error('page_limit_exceeded');
  }

  if (attemptId) {
    await runtime.uow.collectionAttempts.update(attemptId, {
      status: 'running',
      startedAt: new Date(),
    });
  }

  try {
    const response = await runtime.retrieval.retrieve(url, {
      timeoutMs: clampInt(payload.timeoutMs, 10_000, 1_000, 30_000),
      maxBytes: clampInt(payload.maxBytes, 1_048_576, 1_024, 2_000_000),
    });
    const hash = contentHash(response.body);
    if (attemptId) {
      await runtime.uow.collectionAttempts.update(attemptId, {
        status: 'succeeded',
        finalUrl: response.finalUrl,
        httpStatus: response.status,
        contentHash: hash,
        redirectChain: response.redirectChain,
        completedAt: new Date(),
      });
    }
    await runtime.uow.outbox.insert({
      aggregateType: 'collection_run',
      aggregateId: collectionRunId,
      eventType: 'research.retrieval_completed',
      idempotencyKey: `research.retrieval_completed:${collectionRunId}:${attemptId ?? hash.slice(0, 12)}`,
      payload: {
        url,
        finalUrl: response.finalUrl,
        httpStatus: response.status,
        contentHash: hash,
        liveNetwork: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'retrieve_failed';
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'retrieve_failed';
    if (attemptId) {
      await runtime.uow.collectionAttempts.update(attemptId, {
        status: code.includes('fixture') || code.includes('blocked') ? 'blocked' : 'failed',
        errorCode: code,
        errorMessage: message,
        completedAt: new Date(),
      });
    }
    await runtime.uow.outbox.insert({
      aggregateType: 'collection_run',
      aggregateId: collectionRunId,
      eventType: 'research.retrieval_failed',
      idempotencyKey: `research.retrieval_failed:${collectionRunId}:${attemptId ?? crypto.randomUUID()}`,
      payload: { url, code, message, liveNetwork: false },
    });
  }
}

async function handleCollectionSnapshotPersist(
  runtime: ResearchRuntime,
  job: JobEnvelope,
): Promise<void> {
  const payload = job.payload;
  const requestedUrl = requireString(payload, 'requestedUrl');
  const finalUrl = requireString(payload, 'finalUrl');
  const domain = requireString(payload, 'domain').toLowerCase();
  const body = optionalString(payload, 'body') ?? '';
  const hash = optionalString(payload, 'contentHash') ?? contentHash(body);

  const snapshotId = optionalString(payload, 'snapshotId');
  const snapshot = await runtime.uow.snapshots.insert({
    ...(snapshotId ? { id: snapshotId } : {}),
    organizationId: optionalString(payload, 'organizationId') ?? null,
    approvedSourceId: optionalString(payload, 'approvedSourceId') ?? null,
    collectionJobId: optionalString(payload, 'collectionJobId') ?? null,
    requestedUrl,
    finalUrl,
    domain,
    adapterVersion: optionalString(payload, 'adapterVersion') ?? 'fixture-v1',
    policyVersion: optionalString(payload, 'policyVersion') ?? 'collection-policy-v1',
    retrievedAt: new Date(),
    httpStatus: typeof payload.httpStatus === 'number' ? payload.httpStatus : 200,
    contentType: optionalString(payload, 'contentType') ?? 'text/html',
    contentLength: Buffer.byteLength(body, 'utf8'),
    contentHash: hash,
    etag: optionalString(payload, 'etag') ?? null,
    lastModified: optionalString(payload, 'lastModified') ?? null,
    redirectChain: Array.isArray(payload.redirectChain)
      ? payload.redirectChain.filter((v): v is string => typeof v === 'string')
      : [],
    parserVersion: optionalString(payload, 'parserVersion') ?? 'v1',
    storageKey: optionalString(payload, 'storageKey') ?? null,
  });

  await runtime.uow.outbox.insert({
    aggregateType: 'system',
    aggregateId: snapshot.id,
    eventType: 'research.snapshot_created',
    idempotencyKey: `research.snapshot_created:${snapshot.id}`,
    payload: { contentHash: snapshot.contentHash, domain: snapshot.domain },
  });
}

async function handleCollectionExtraction(
  runtime: ResearchRuntime,
  job: JobEnvelope,
): Promise<void> {
  const payload = job.payload;
  const organizationId = requireString(payload, 'organizationId');
  const sourceUrl = requireString(payload, 'sourceUrl');
  const body = optionalString(payload, 'body') ?? '';
  let domain = optionalString(payload, 'domain');
  if (!domain) {
    try {
      domain = new URL(sourceUrl).hostname;
    } catch {
      domain = 'unknown.invalid';
    }
  }

  const snapshot =
    (optionalString(payload, 'sourceSnapshotId')
      ? await runtime.uow.snapshots.getById(optionalString(payload, 'sourceSnapshotId')!)
      : null) ??
    (await runtime.uow.snapshots.insert({
      organizationId,
      requestedUrl: sourceUrl,
      finalUrl: sourceUrl,
      domain,
      adapterVersion: 'fixture-v1',
      policyVersion: 'collection-policy-v1',
      retrievedAt: new Date(),
      httpStatus: 200,
      contentType: 'text/html',
      contentLength: Buffer.byteLength(body, 'utf8'),
      contentHash: contentHash(body),
      parserVersion: 'v1',
    }));

  const extraction = await runtime.uow.extractionRuns.insert({
    sourceSnapshotId: snapshot.id,
    extractorVersion: EXTRACTOR_VERSION,
    mappingVersion: MAPPING_VERSION,
    status: 'completed',
    summary: {},
  });

  const proposals = extractClaimsFromHtml(body).slice(0, 50);
  const inserted = proposals.length
    ? await runtime.uow.claims.insertProposals(
        proposals.map((p) => ({
          ...p,
          organizationId,
          sourceUrl,
          sourceSnapshotId: snapshot.id,
          extractionRunId: extraction.id,
          extractorVersion: EXTRACTOR_VERSION,
          mappingVersion: MAPPING_VERSION,
        })),
      )
    : [];

  await runtime.uow.outbox.insert({
    aggregateType: 'system',
    aggregateId: extraction.id,
    eventType: 'research.extraction_completed',
    idempotencyKey: `research.extraction_completed:${extraction.id}`,
    payload: { claimsProposed: inserted.length, organizationId },
  });
}

async function handleCoverageRecalculate(
  runtime: ResearchRuntime,
  job: JobEnvelope,
): Promise<void> {
  const payload = job.payload;
  const collectionRunId = requireString(payload, 'collectionRunId');
  const run = await runtime.uow.collectionRuns.get(collectionRunId);
  const summary = {
    ...(run?.summary ?? {}),
    recalculatedAt: new Date().toISOString(),
    pagesRetrieved: typeof payload.pagesRetrieved === 'number' ? payload.pagesRetrieved : 0,
    claimsProposed: typeof payload.claimsProposed === 'number' ? payload.claimsProposed : 0,
    blocked: typeof payload.blocked === 'number' ? payload.blocked : 0,
  };
  if (run) {
    await runtime.uow.collectionRuns.updateSummary(collectionRunId, summary);
  } else {
    await runtime.uow.outbox.insert({
      aggregateType: 'collection_run',
      aggregateId: collectionRunId,
      eventType: 'research.collection_coverage_recalculated',
      idempotencyKey: `research.collection_coverage_recalculated:${collectionRunId}`,
      payload: summary,
    });
  }
}

async function handleIntelligenceRecalc(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const payload = job.payload;
  const organizationId = requireString(payload, 'organizationId');
  const reason = optionalString(payload, 'reason') ?? 'research_claim_accepted';
  await runtime.scores.requestRecalculation(organizationId, reason);
  await runtime.uow.outbox.insert({
    aggregateType: 'organization',
    aggregateId: organizationId,
    eventType: 'intelligence.recalculation_requested',
    idempotencyKey: `intelligence.recalculation_requested:${organizationId}:${job.idempotencyKey ?? reason}`,
    payload: { reason },
  });
}

async function handleResearchRunExecute(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const researchRunId = requireString(job.payload, 'researchRunId');
  await runtime.researchRuns.executeRun(researchRunId);
}

async function handleResearchRunPause(runtime: ResearchRuntime, job: JobEnvelope): Promise<void> {
  const researchRunId = requireString(job.payload, 'researchRunId');
  const reason = optionalString(job.payload, 'reason') ?? 'paused_via_job';
  await runtime.researchRuns.pause(researchRunId, asRole(job.payload.role), reason);
}

/**
 * Registers bounded Phase 1.1 / 1.2 research job handlers shared by worker and web demo runtime.
 * Live network retrieval is never enabled — handlers use FixtureRetrievalPort only.
 * When `jobs` also implements JobDispatcherPort, attaches it to ResearchRunService.
 */
export function registerResearchJobHandlers(
  jobs: JobHandlerRegistryPort = new InMemoryJobDispatcher(),
  runtime: ResearchRuntime = createResearchRuntime(),
) {
  if ('enqueue' in jobs && typeof (jobs as JobDispatcherPort).enqueue === 'function') {
    runtime.researchRuns.setJobDispatcher(jobs as JobDispatcherPort);
  }

  jobs.register('heartbeat', async () => {
    // Prompt 1 scaffold only: proves handler registration is idempotent-ready.
  });

  const handlers: Record<(typeof RESEARCH_JOB_TYPES)[number], (job: JobEnvelope) => Promise<void>> =
    {
      'population.import.requested': (job) => handlePopulationImport(runtime, job),
      'population.normalize.requested': (job) => handlePopulationNormalize(runtime, job),
      'population.resolve.requested': (job) => handlePopulationResolve(runtime, job),
      'enrichment.bulk.requested': (job) => handleEnrichmentBulk(runtime, job),
      'enrichment.archive.requested': (job) => handleEnrichmentArchive(runtime, job),
      'research.priority.requested': (job) => handleResearchPriority(runtime, job),
      'collection.run.requested': (job) => handleCollectionRun(runtime, job),
      'collection.target.queued': (job) => handleCollectionTargetQueued(runtime, job),
      'collection.page.retrieve': (job) => handleCollectionPageRetrieve(runtime, job),
      'collection.snapshot.persist': (job) => handleCollectionSnapshotPersist(runtime, job),
      'collection.extraction.requested': (job) => handleCollectionExtraction(runtime, job),
      'collection.coverage.recalculate': (job) => handleCoverageRecalculate(runtime, job),
      'intelligence.recalculation.requested': (job) => handleIntelligenceRecalc(runtime, job),
      'research.run.execute': (job) => handleResearchRunExecute(runtime, job),
      'research.run.pause': (job) => handleResearchRunPause(runtime, job),
    };

  for (const jobType of RESEARCH_JOB_TYPES) {
    jobs.register(jobType, handlers[jobType]);
  }

  return jobs;
}

/** @deprecated Prefer registerResearchJobHandlers */
export const registerWorkerConsumers = registerResearchJobHandlers;
