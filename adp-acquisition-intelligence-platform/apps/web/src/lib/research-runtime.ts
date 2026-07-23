import { InMemoryJobDispatcher } from '@adp/platform';
import {
  createInMemoryResearchUnitOfWork,
  ExtractionReviewService,
  FixtureRetrievalPort,
  InMemoryApprovedSourceRepository,
  InMemoryClaimRepository,
  InMemoryEvidenceIntegration,
  InMemoryOrganizationLookup,
  InMemoryOutbox,
  InMemoryPopulationRepository,
  InMemoryPriorityRepository,
  InMemoryScoreRecalc,
  InMemoryTransactionRunner,
  InMemoryVariableIntegration,
  InProcessConcurrencyGate,
  PopulationImportService,
  registerResearchJobHandlers,
  ResearchPriorityService,
  TargetedCollectionService,
  type ApprovedSourceRecord,
  type ClaimRecord,
  type CollectionRunRecord,
  type PopulationImportRecord,
  type RawCandidateRecord,
  type ResearchPriorityAssessment,
  type ResearchRuntime,
} from '@adp/research';

const FIXTURE_HTML = `<!doctype html><html><body>
<script type="application/ld+json">{"@type":"Organization","name":"Acme Advisory"}</script>
<p>We offer payroll and bookkeeping services for accounting firms.</p>
<p>Client accounting services and fractional CFO available.</p>
</body></html>`;

export type WebResearchRuntime = ResearchRuntime & {
  jobs: InMemoryJobDispatcher;
  scores: InMemoryScoreRecalc;
};

declare global {
  // eslint-disable-next-line no-var
  var __adpResearchRuntime: WebResearchRuntime | undefined;
}

const FIXTURE_SOURCE: ApprovedSourceRecord = {
  id: 'as-fixture-1',
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

/**
 * Singleton in-memory research runtime for the web app demo / Playwright E2E.
 * Registers the same bounded job handlers as the worker. Live network is disabled.
 */
export function getWebResearchRuntime(): WebResearchRuntime {
  if (globalThis.__adpResearchRuntime) return globalThis.__adpResearchRuntime;

  const concurrency = new InProcessConcurrencyGate();
  const uow = createInMemoryResearchUnitOfWork(concurrency);
  (uow.approvedSources as InMemoryApprovedSourceRepository).seed(FIXTURE_SOURCE);

  const retrieval = new FixtureRetrievalPort({
    'https://acme-advisory.test/': { body: FIXTURE_HTML },
    'https://acme-advisory.test/about': { body: FIXTURE_HTML },
    'https://acme-advisory.test/services': { body: FIXTURE_HTML },
  });
  const transactions = new InMemoryTransactionRunner(uow);
  const evidence = new InMemoryEvidenceIntegration();
  const variables = new InMemoryVariableIntegration();
  const scores = new InMemoryScoreRecalc();
  const population = new PopulationImportService(uow.population, uow.organizations, uow.outbox);
  const collection = new TargetedCollectionService(
    retrieval,
    uow.claims,
    uow.snapshots,
    uow.extractionRuns,
    uow.collectionAttempts,
    uow.collectionRuns,
    uow.approvedSources,
    uow.rateLimits,
    uow.concurrency,
    uow.outbox,
  );
  const priority = new ResearchPriorityService(uow.priority, uow.outbox);
  const claimReview = new ExtractionReviewService(transactions, evidence, variables, scores);

  const base: ResearchRuntime = {
    provider: 'memory',
    uow,
    transactions,
    retrieval,
    population,
    collection,
    priority,
    claimReview,
    scores,
    database: null,
    defaultPageLimit: 3,
    maxTargetsPerRun: 100,
    maxRowsPerImport: 10_000,
  };

  const jobs = new InMemoryJobDispatcher();
  registerResearchJobHandlers(jobs, base);

  const runtime: WebResearchRuntime = { ...base, jobs, scores };
  globalThis.__adpResearchRuntime = runtime;
  return runtime;
}

export function resetWebResearchRuntimeForTests() {
  globalThis.__adpResearchRuntime = undefined;
}

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
  };
};

export async function getResearchWorkflowSnapshot(
  runtime = getWebResearchRuntime(),
): Promise<ResearchWorkflowSnapshot> {
  const population = runtime.uow.population as InMemoryPopulationRepository;
  const claimsRepo = runtime.uow.claims as InMemoryClaimRepository;
  const priorityRepo = runtime.uow.priority as InMemoryPriorityRepository;
  const orgs = runtime.uow.organizations as InMemoryOrganizationLookup;
  const outbox = runtime.uow.outbox as InMemoryOutbox;

  const imports = [...population.imports.values()];
  const candidates = [...population.candidates.values()].flat();
  const claims = [...claimsRepo.claims.values()];
  const collectionRuns = await runtime.uow.collectionRuns.list();
  const priorities = [...priorityRepo.assessments.entries()].map(([organizationId, assessment]) => ({
    organizationId,
    assessment,
  }));

  const claimsAwaiting = claims.filter((c) => c.reviewStatus === 'proposed').length;
  const claimsAccepted = claims.filter(
    (c) => c.reviewStatus === 'accepted' || c.reviewStatus === 'accepted_corrected',
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
    scoresRecalculated: runtime.scores.requests.length,
    metrics: {
      rawCandidates: candidates.length,
      claimsAwaiting,
      claimsAccepted,
      collectionRunsTotal: collectionRuns.length,
      scoresRecalculated: runtime.scores.requests.length,
    },
  };
}
