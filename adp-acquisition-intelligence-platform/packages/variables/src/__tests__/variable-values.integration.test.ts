import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import { organizations, users, variableValues } from '@adp/database';
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

  it('publishes replacement definition versions while preserving active version immutability', async () => {
    const fixture = await createVariableFixture(client, 'definition-version');
    const definitionService = new VariableDefinitionService(
      new PostgresVariableDefinitionRepository(client.db),
    );
    const definitionRepository = new PostgresVariableDefinitionRepository(client.db);

    const replacement = await definitionService.addVersion({
      definitionId: fixture.definitionId,
      draft: { helpText: 'Replacement definition version.' },
      actor: researcher,
    });
    const published = await definitionService.publishVersion({
      definitionId: fixture.definitionId,
      versionId: replacement.id,
      actor: reviewer,
    });
    const originalVersion = await definitionRepository.findVersionById(fixture.versionId);

    expect(originalVersion).toMatchObject({
      lifecycleStatus: 'retired',
      version: 1,
    });
    expect(published.definition.currentVersionId).toBe(replacement.id);
    expect(published.version).toMatchObject({
      id: replacement.id,
      lifecycleStatus: 'active',
      version: 2,
    });
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

  it('preserves original value lineage when applying and removing a manual override', async () => {
    const fixture = await createVariableFixture(client, 'override');
    const overrideReviewer = {
      userId: await createUser(client, 'override-reviewer'),
      roles: ['reviewer'] as const,
    };
    const service = buildValueService(client.db);

    const original = await service.confirm({
      subjectType: 'organization',
      organizationId: fixture.organizationId,
      definitionVersionId: fixture.versionId,
      typedValue: false,
      evidenceType: 'verified_fact',
      actor: reviewer,
    });
    const override = await service.applyManualOverride({
      subjectType: 'organization',
      organizationId: fixture.organizationId,
      definitionVersionId: fixture.versionId,
      typedValue: true,
      evidenceType: 'user_entered_fact',
      actor: overrideReviewer,
      overrideReasonCode: 'reviewer_correction',
      overrideReasonNote: 'Reviewer corrected the current value.',
    });
    const restored = await service.removeManualOverride({
      subject: { subjectType: 'organization', organizationId: fixture.organizationId },
      variableDefinitionId: fixture.definitionId,
      actor: overrideReviewer,
    });

    const history = await service.history({
      subject: { subjectType: 'organization', organizationId: fixture.organizationId },
      variableDefinitionId: fixture.definitionId,
      actor: reviewer,
    });
    const preservedOriginal = history.find((value) => value.id === original.id);

    expect(override).toMatchObject({
      typedValue: true,
      manualOverrideFlag: true,
      originalValueId: original.id,
      overrideReasonCode: 'reviewer_correction',
    });
    expect(preservedOriginal).toMatchObject({
      typedValue: false,
      lifecycle: 'superseded',
      supersededById: override.id,
      originalValueId: null,
    });
    expect(restored).toMatchObject({
      typedValue: false,
      manualOverrideFlag: false,
      originalValueId: original.id,
      lifecycle: 'current',
    });
  });

  it('keeps contradicted values in history without making them effective current', async () => {
    const fixture = await createVariableFixture(client, 'contradiction');
    const service = buildValueService(client.db);

    const contradicted = await service.confirm({
      subjectType: 'organization',
      organizationId: fixture.organizationId,
      definitionVersionId: fixture.versionId,
      typedValue: true,
      evidenceType: 'source_derived_fact',
      actor: reviewer,
    });
    await service.markContradicted({ valueId: contradicted.id, actor: reviewer });

    const currentAfterContradiction = await service.evaluateEffectiveCurrent({
      subject: { subjectType: 'organization', organizationId: fixture.organizationId },
      variableDefinitionId: fixture.definitionId,
      actor: reviewer,
    });
    const replacement = await service.confirm({
      subjectType: 'organization',
      organizationId: fixture.organizationId,
      definitionVersionId: fixture.versionId,
      typedValue: false,
      evidenceType: 'verified_fact',
      actor: reviewer,
    });
    const history = await service.history({
      subject: { subjectType: 'organization', organizationId: fixture.organizationId },
      variableDefinitionId: fixture.definitionId,
      actor: reviewer,
    });
    const preservedContradiction = history.find((value) => value.id === contradicted.id);

    expect(currentAfterContradiction).toBeNull();
    expect(replacement).toMatchObject({ typedValue: false, lifecycle: 'current' });
    expect(preservedContradiction).toMatchObject({
      typedValue: true,
      lifecycle: 'contradicted',
      valueStatus: 'contradicted',
      supersededById: null,
    });
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

async function createUser(client: DatabaseClient, suffix: string): Promise<string> {
  return first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `variable-${suffix}`,
        email: `variable-${suffix}@example.com`,
        displayName: `Variable ${suffix}`,
      })
      .returning({ id: users.id }),
  ).id;
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
