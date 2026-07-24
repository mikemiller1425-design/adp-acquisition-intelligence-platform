import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DatabaseClient } from '@adp/database';
import {
  evidenceRecords,
  extractedClaims,
  organizations,
  outboxEvents,
  sourceSnapshots,
  variableValues,
} from '@adp/database';
import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExtractionReviewService } from '../application/claim-review-service.js';
import {
  FailingEvidenceIntegration,
  FailingVariableIntegration,
} from '../infrastructure/canonical-integrations.js';
import { InProcessConcurrencyGate } from '../infrastructure/concurrency-gate.js';
import {
  createPostgresResearchUnitOfWork,
  PostgresTransactionRunner,
} from '../infrastructure/postgres-repositories.js';
import { seedFixtureApprovedSource } from '../infrastructure/research-queries.js';
import type { ResearchUnitOfWork, UnitOfWorkPort } from '../domain/persistence-ports.js';

const testDatabaseUrl = getTestDatabaseUrl();
const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

describe.sequential('claim accept postgres atomicity', () => {
  let lock: TestDatabaseLock;
  let client: DatabaseClient;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    execFileSync('pnpm', ['--filter', '@adp/database', 'db:seed'], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'inherit',
    });
    client = createTestDatabaseClient(testDatabaseUrl);
  }, 180_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  async function seedProposedClaim() {
    const suffix = randomUUID().slice(0, 8);
    const domain = `atomic-${suffix}.example`;
    const org = await client.db
      .insert(organizations)
      .values({
        displayName: `Atomic Org ${suffix}`,
        normalizedName: `atomic-org-${suffix}`,
        domain,
        normalizedDomain: domain,
      })
      .returning({ id: organizations.id });
    const organizationId = org[0]!.id;
    const snapshot = await client.db
      .insert(sourceSnapshots)
      .values({
        organizationId,
        requestedUrl: `https://${domain}/`,
        finalUrl: `https://${domain}/`,
        domain,
        adapterVersion: 'fixture-v1',
        policyVersion: 'collection-policy-v1',
        retrievedAt: new Date(),
        httpStatus: 200,
        contentType: 'text/html',
        contentHash: createHash('sha256').update(randomUUID()).digest('hex'),
        parserVersion: 'v1',
        redirectChain: [],
      })
      .returning({ id: sourceSnapshots.id });
    const concurrency = new InProcessConcurrencyGate();
    const uow = createPostgresResearchUnitOfWork(client.db, concurrency);
    await seedFixtureApprovedSource(uow, client.db);
    const claims = await uow.claims.insertProposals([
      {
        variableKey: 'services.payroll_offered',
        originalExcerpt: 'payroll',
        proposedValue: true,
        confidenceComponents: {
          sourceReliability: 0.5,
          extractionCertainty: 0.5,
          corroboration: 0.5,
        },
        explanation: 'test',
        affectedCompletenessPurposes: [],
        affectedScores: [],
        organizationId,
        sourceUrl: `https://${domain}/`,
        sourceSnapshotId: snapshot[0]!.id,
        extractionRunId: randomUUID(),
        extractorVersion: 'v1',
        mappingVersion: 'v1',
      },
    ]);
    return { organizationId, claimId: claims[0]!.id };
  }

  it('accepts claim atomically with evidence + variable + outbox recalc request', async () => {
    const seeded = await seedProposedClaim();
    const concurrency = new InProcessConcurrencyGate();
    const transactions = new PostgresTransactionRunner(
      (work) => client.withTransaction(work),
      concurrency,
    );
    const review = new ExtractionReviewService(transactions);
    const accepted = await review.review({
      claimId: seeded.claimId,
      action: 'accept',
      actorUserId: randomUUID(),
      role: 'reviewer',
    });
    expect(accepted.reviewStatus).toBe('accepted');

    const evidence = await client.db.select({ value: count() }).from(evidenceRecords);
    const variables = await client.db
      .select({ value: count() })
      .from(variableValues)
      .where(eq(variableValues.lifecycle, 'proposed'));
    const outbox = await client.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, 'intelligence.recalculation_requested'));
    expect(Number(evidence[0]?.value ?? 0)).toBeGreaterThan(0);
    expect(Number(variables[0]?.value ?? 0)).toBeGreaterThan(0);
    expect(outbox.length).toBeGreaterThan(0);
  });

  it('rolls back when variable proposal fails — claim stays proposed, no partial evidence', async () => {
    const seeded = await seedProposedClaim();
    const beforeEvidence = Number(
      (await client.db.select({ value: count() }).from(evidenceRecords))[0]?.value ?? 0,
    );
    const beforeVariables = Number(
      (await client.db.select({ value: count() }).from(variableValues))[0]?.value ?? 0,
    );

    const failingRunner: UnitOfWorkPort = {
      async runInTransaction<T>(fn: (uow: ResearchUnitOfWork) => Promise<T>) {
        return client.withTransaction(async (tx) => {
          const uow = createPostgresResearchUnitOfWork(tx, new InProcessConcurrencyGate());
          (uow as { variables: unknown }).variables = new FailingVariableIntegration();
          return fn(uow);
        });
      },
    };
    const review = new ExtractionReviewService(failingRunner);
    await expect(
      review.review({
        claimId: seeded.claimId,
        action: 'accept',
        actorUserId: randomUUID(),
        role: 'reviewer',
      }),
    ).rejects.toThrow(/forced_variable_failure/);

    const claim = await client.db
      .select()
      .from(extractedClaims)
      .where(eq(extractedClaims.id, seeded.claimId));
    expect(claim[0]?.reviewStatus).toBe('proposed');
    const afterEvidence = Number(
      (await client.db.select({ value: count() }).from(evidenceRecords))[0]?.value ?? 0,
    );
    const afterVariables = Number(
      (await client.db.select({ value: count() }).from(variableValues))[0]?.value ?? 0,
    );
    expect(afterEvidence).toBe(beforeEvidence);
    expect(afterVariables).toBe(beforeVariables);
  });

  it('rolls back when evidence creation fails — claim stays proposed', async () => {
    const seeded = await seedProposedClaim();
    const beforeEvidence = Number(
      (await client.db.select({ value: count() }).from(evidenceRecords))[0]?.value ?? 0,
    );
    const failingRunner: UnitOfWorkPort = {
      async runInTransaction<T>(fn: (uow: ResearchUnitOfWork) => Promise<T>) {
        return client.withTransaction(async (tx) => {
          const uow = createPostgresResearchUnitOfWork(tx, new InProcessConcurrencyGate());
          (uow as { evidence: unknown }).evidence = new FailingEvidenceIntegration();
          return fn(uow);
        });
      },
    };
    const review = new ExtractionReviewService(failingRunner);
    await expect(
      review.review({
        claimId: seeded.claimId,
        action: 'accept',
        actorUserId: randomUUID(),
        role: 'reviewer',
      }),
    ).rejects.toThrow(/forced_evidence_failure/);
    const claim = await client.db
      .select()
      .from(extractedClaims)
      .where(eq(extractedClaims.id, seeded.claimId));
    expect(claim[0]?.reviewStatus).toBe('proposed');
    const afterEvidence = Number(
      (await client.db.select({ value: count() }).from(evidenceRecords))[0]?.value ?? 0,
    );
    expect(afterEvidence).toBe(beforeEvidence);
  });
});
