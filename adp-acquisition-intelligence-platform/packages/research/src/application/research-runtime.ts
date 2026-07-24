import { createDatabaseClient, type DatabaseClient } from '@adp/database';
import { PopulationImportService } from './population-service.js';
import { TargetedCollectionService } from './collection-service.js';
import { ExtractionReviewService } from './claim-review-service.js';
import { ResearchPriorityService } from './priority-service.js';
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
  /** Post-outbox consumer only — never invoked inside claim-accept transaction. */
  scores: ScoreRecalcPort;
  database: DatabaseClient | null;
  defaultPageLimit: number;
  maxTargetsPerRun: number;
  maxRowsPerImport: number;
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

/**
 * Builds research worker/web runtime.
 * Default provider is `memory` (fixture-safe). Postgres requires DATABASE_URL.
 * Live network retrieval is never enabled here.
 * Claim accept uses UoW evidence/variables + outbox only; score recalc is outbox-driven.
 */
export function createResearchRuntime(env: NodeJS.ProcessEnv = process.env): ResearchRuntime {
  const provider = resolveProvider(env);
  const concurrency = new InProcessConcurrencyGate();
  const retrieval = new FixtureRetrievalPort({});
  const scores = new InMemoryScoreRecalc();

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
    return {
      provider,
      uow,
      transactions,
      retrieval,
      population: new PopulationImportService(uow.population, uow.organizations, uow.outbox),
      collection: buildCollection(retrieval, uow),
      priority: new ResearchPriorityService(uow.priority, uow.outbox),
      claimReview: new ExtractionReviewService(transactions),
      scores,
      database,
      defaultPageLimit: 8,
      maxTargetsPerRun: 100,
      maxRowsPerImport: 10_000,
    };
  }

  const uow = createInMemoryResearchUnitOfWork(concurrency);
  const transactions = new InMemoryTransactionRunner(uow);
  return {
    provider: 'memory',
    uow,
    transactions,
    retrieval,
    population: new PopulationImportService(uow.population, uow.organizations, uow.outbox),
    collection: buildCollection(retrieval, uow),
    priority: new ResearchPriorityService(uow.priority, uow.outbox),
    claimReview: new ExtractionReviewService(transactions),
    scores,
    database: null,
    defaultPageLimit: 8,
    maxTargetsPerRun: 100,
    maxRowsPerImport: 10_000,
  };
}
