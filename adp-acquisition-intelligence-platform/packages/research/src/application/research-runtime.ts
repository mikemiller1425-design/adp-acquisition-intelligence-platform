import { createDatabaseClient, type DatabaseClient } from '@adp/database';
import { InMemoryJobDispatcher, type JobDispatcherPort } from '@adp/platform';
import { PopulationImportService } from './population-service.js';
import { TargetedCollectionService } from './collection-service.js';
import { ExtractionReviewService } from './claim-review-service.js';
import { ResearchPriorityService } from './priority-service.js';
import {
  isGlobalKillSwitchActive,
  isLiveResearchEnabled,
  ResearchRunService,
} from './research-run-service.js';
import { createSourceRegistry } from '../domain/source-registry.js';
import { FixtureRetrievalPort } from '../infrastructure/fixture-retrieval.js';
import {
  createInMemoryResearchUnitOfWork,
  InMemoryScoreRecalc,
  InMemoryTransactionRunner,
} from '../infrastructure/in-memory.js';
import {
  createPostgresResearchUnitOfWork,
  PostgresTransactionRunner,
} from '../infrastructure/postgres-repositories.js';
import {
  InMemoryResearchRunRepository,
  PostgresResearchRunRepository,
} from '../infrastructure/research-run-store.js';
import { InProcessConcurrencyGate } from '../infrastructure/concurrency-gate.js';
import type { ResearchUnitOfWork, TransactionRunner } from '../domain/persistence-ports.js';
import type { RetrievalPort, ScoreRecalcPort } from '../domain/ports.js';

export type ResearchProvider = 'memory' | 'postgres';

export type ResearchRuntime = {
  provider: ResearchProvider;
  uow: ResearchUnitOfWork;
  transactions: TransactionRunner;
  retrieval: RetrievalPort;
  population: PopulationImportService;
  collection: TargetedCollectionService;
  priority: ResearchPriorityService;
  claimReview: ExtractionReviewService;
  researchRuns: ResearchRunService;
  /** Post-outbox consumer only — never invoked inside claim-accept transaction. */
  scores: ScoreRecalcPort;
  database: DatabaseClient | null;
  defaultPageLimit: number;
  maxTargetsPerRun: number;
  maxRowsPerImport: number;
};

export type CreateResearchRuntimeOptions = {
  /** Optional job dispatcher; defaults to in-memory placeholder. Call setJobDispatcher later to replace. */
  jobs?: JobDispatcherPort;
};

function resolveProvider(env: NodeJS.ProcessEnv): ResearchProvider {
  const raw = (env.ADP_RESEARCH_PROVIDER ?? 'memory').trim().toLowerCase();
  return raw === 'postgres' ? 'postgres' : 'memory';
}

function buildCollection(
  retrieval: RetrievalPort,
  uow: ResearchUnitOfWork,
): TargetedCollectionService {
  return new TargetedCollectionService(
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
}

function buildResearchRuns(
  uow: ResearchUnitOfWork,
  runsRepo: InMemoryResearchRunRepository | PostgresResearchRunRepository,
  jobs: JobDispatcherPort,
  env: NodeJS.ProcessEnv,
): ResearchRunService {
  const delayRaw = Number(env.ADP_RESEARCH_RUN_TARGET_DELAY_MS ?? 0);
  return new ResearchRunService({
    runs: runsRepo,
    jobs,
    claims: uow.claims,
    snapshots: uow.snapshots,
    extractionRuns: uow.extractionRuns,
    liveResearchEnabled: isLiveResearchEnabled(env),
    globalKillSwitchActive: isGlobalKillSwitchActive(env),
    sourceRegistry: createSourceRegistry(uow.approvedSources),
    ...(Number.isFinite(delayRaw) && delayRaw > 0 ? { targetDelayMs: delayRaw } : {}),
  });
}

/**
 * Builds research worker/web runtime.
 * Default provider is `memory` (fixture-safe). Postgres requires DATABASE_URL.
 * Live network retrieval is never enabled here.
 * Claim accept uses UoW evidence/variables + outbox only; score recalc is outbox-driven.
 * Research runs use a placeholder job dispatcher until `setJobDispatcher` / registerResearchJobHandlers.
 */
export function createResearchRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: CreateResearchRuntimeOptions = {},
): ResearchRuntime {
  const provider = resolveProvider(env);
  const concurrency = new InProcessConcurrencyGate();
  const retrieval = new FixtureRetrievalPort({});
  const scores = new InMemoryScoreRecalc();
  const jobs = options.jobs ?? new InMemoryJobDispatcher();

  if (provider === 'postgres') {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('ADP_RESEARCH_PROVIDER=postgres requires DATABASE_URL');
    }
    const database = createDatabaseClient(databaseUrl);
    const uow = createPostgresResearchUnitOfWork(database.db, concurrency);
    const transactions = new PostgresTransactionRunner(
      (work) => database.withTransaction(work),
      concurrency,
    );
    const runsRepo = new PostgresResearchRunRepository(database.db);
    return {
      provider,
      uow,
      transactions,
      retrieval,
      population: new PopulationImportService(uow.population, uow.organizations, uow.outbox),
      collection: buildCollection(retrieval, uow),
      priority: new ResearchPriorityService(uow.priority, uow.outbox),
      claimReview: new ExtractionReviewService(transactions),
      researchRuns: buildResearchRuns(uow, runsRepo, jobs, env),
      scores,
      database,
      defaultPageLimit: 8,
      maxTargetsPerRun: 100,
      maxRowsPerImport: 10_000,
    };
  }

  const uow = createInMemoryResearchUnitOfWork(concurrency);
  const transactions = new InMemoryTransactionRunner(uow);
  const runsRepo = new InMemoryResearchRunRepository();
  return {
    provider: 'memory',
    uow,
    transactions,
    retrieval,
    population: new PopulationImportService(uow.population, uow.organizations, uow.outbox),
    collection: buildCollection(retrieval, uow),
    priority: new ResearchPriorityService(uow.priority, uow.outbox),
    claimReview: new ExtractionReviewService(transactions),
    researchRuns: buildResearchRuns(uow, runsRepo, jobs, env),
    scores,
    database: null,
    defaultPageLimit: 8,
    maxTargetsPerRun: 100,
    maxRowsPerImport: 10_000,
  };
}
