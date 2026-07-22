import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import { organizations, variableValues } from '@adp/database';
import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VariableDefinitionService } from '../application/variable-definition-service.js';
import { VariableValueService } from '../application/variable-value-service.js';
import type { VariableOutboxPort } from '../domain/ports.js';
import {
  PostgresVariableDefinitionRepository,
  PostgresVariableValueRepository,
} from '../infrastructure/postgres-repositories.js';

const testDatabaseUrl = getTestDatabaseUrl();
const researcher = { userId: null, roles: ['researcher'] as const };
const reviewer = { userId: null, roles: ['reviewer'] as const };

describe.sequential('variable values postgres integration', () => {
  let lock: TestDatabaseLock;
  let client: DatabaseClient;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    client = createTestDatabaseClient(testDatabaseUrl);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  it('transactionally supersedes the prior current value and preserves AI inference provenance', async () => {
    const fixture = await createVariableFixture(client, 'ai-provenance');
    const service = buildValueService(client.db);

    const first = await service.confirm({
      subjectType: 'organization',
      organizationId: fixture.organizationId,
      definitionVersionId: fixture.versionId,
      typedValue: false,
      evidenceType: 'ai_inference',
      actor: reviewer,
    });
    const second = await service.confirm({
      subjectType: 'organization',
      organizationId: fixture.organizationId,
      definitionVersionId: fixture.versionId,
      typedValue: true,
      evidenceType: 'verified_fact',
      actor: reviewer,
    });

    const history = await service.history({
      subject: { subjectType: 'organization', organizationId: fixture.organizationId },
      variableDefinitionId: fixture.definitionId,
      actor: reviewer,
    });
    const original = history.find((value) => value.id === first.id);
    const current = await service.evaluateEffectiveCurrent({
      subject: { subjectType: 'organization', organizationId: fixture.organizationId },
      variableDefinitionId: fixture.definitionId,
      actor: reviewer,
    });

    expect(history).toHaveLength(2);
    expect(original).toMatchObject({
      lifecycle: 'superseded',
      supersededById: second.id,
      evidenceType: 'ai_inference',
    });
    expect(current).toMatchObject({ id: second.id, typedValue: true, lifecycle: 'current' });
  });

  it('rolls back value supersession when a later transactional port fails', async () => {
    const fixture = await createVariableFixture(client, 'rollback');
    const initial = await buildValueService(client.db).confirm({
      subjectType: 'organization',
      organizationId: fixture.organizationId,
      definitionVersionId: fixture.versionId,
      typedValue: 10,
      evidenceType: 'verified_fact',
      actor: reviewer,
    });

    await expect(
      client.withTransaction(async (tx) => {
        await buildValueService(tx, new ThrowingOutbox()).confirm({
          subjectType: 'organization',
          organizationId: fixture.organizationId,
          definitionVersionId: fixture.versionId,
          typedValue: 20,
          evidenceType: 'verified_fact',
          actor: reviewer,
          correlationId: '77777777-7777-7777-7777-777777777777',
        });
      }),
    ).rejects.toThrow('simulated outbox failure');

    const rows = await client.db
      .select()
      .from(variableValues)
      .where(eq(variableValues.variableDefinitionId, fixture.definitionId));
    const currentCount = first(
      await client.db
        .select({ value: count() })
        .from(variableValues)
        .where(eq(variableValues.lifecycle, 'current')),
    ).value;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(initial.id);
    expect(rows[0]?.lifecycle).toBe('current');
    expect(rows[0]?.supersededById).toBeNull();
    expect(currentCount).toBeGreaterThanOrEqual(1);
  });
});

async function createVariableFixture(client: DatabaseClient, suffix: string) {
  const organizationRows = await client.db
    .insert(organizations)
    .values({
      displayName: `Variable Fixture ${suffix}`,
      normalizedName: `variable fixture ${suffix}`,
      normalizedDomain: `variable-${suffix}.example.com`,
      createdByUserId: null,
    })
    .returning({ id: organizations.id });
  const organizationId = first(organizationRows).id;
  const definitionService = new VariableDefinitionService(
    new PostgresVariableDefinitionRepository(client.db),
  );
  const definition = await definitionService.createDraftDefinition({
    key: `fixture_${suffix.replace(/-/g, '_')}`,
    displayLabel: `Fixture ${suffix}`,
    description: 'Integration fixture',
    subjectType: 'organization',
    dataType: suffix === 'rollback' ? 'integer' : 'boolean',
    actor: researcher,
  });
  const version = await definitionService.addVersion({
    definitionId: definition.id,
    draft: { rangeConstraints: suffix === 'rollback' ? { min: 0 } : null },
    actor: researcher,
  });
  await definitionService.publishVersion({
    definitionId: definition.id,
    versionId: version.id,
    actor: reviewer,
  });
  return { organizationId, definitionId: definition.id, versionId: version.id };
}

function buildValueService(
  db: RepositoryExecutor,
  outbox?: VariableOutboxPort,
): VariableValueService {
  return new VariableValueService(
    new PostgresVariableDefinitionRepository(db),
    new PostgresVariableValueRepository(db),
    undefined,
    undefined,
    outbox,
  );
}

class ThrowingOutbox implements VariableOutboxPort {
  async insert(): Promise<void> {
    throw new Error('simulated outbox failure');
  }
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row');
  return row;
}
