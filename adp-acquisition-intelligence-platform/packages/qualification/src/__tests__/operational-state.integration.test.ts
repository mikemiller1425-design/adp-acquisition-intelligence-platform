import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import {
  auditEvents,
  contacts,
  operationalStateTransitions,
  organizations,
  outboxEvents,
  users,
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

import { OperationalStateService } from '../application/operational-state-service.js';
import type { OperationalStateAuditPort, OperationalStateOutboxPort } from '../domain/ports.js';
import {
  PostgresOperationalStateTransitionRepository,
  PostgresOrganizationStateWriter,
} from '../infrastructure/postgres-operational-state.js';

const testDatabaseUrl = getTestDatabaseUrl();

describe.sequential('operational state postgres integration', () => {
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

  it('updates state and writes transition history, audit, and outbox atomically', async () => {
    const fixture = await createOrganizationFixture(client, 'atomic-success');
    const correlationId = '33333333-3333-3333-3333-333333333333';

    const result = await client.withTransaction(async (tx) => {
      const service = buildTransactionalService(tx);
      return service.transitionProspectStage({
        organizationId: fixture.organizationId,
        to: 'normalization',
        expectedRecordVersion: 1,
        actor: { type: 'user', userId: fixture.userId },
        commandCorrelationId: correlationId,
      });
    });

    expect(result.organization).toMatchObject({
      prospectStage: 'normalization',
      recordVersion: 2,
    });
    expect(result.transition).toMatchObject({
      subjectId: fixture.organizationId,
      dimension: 'prospect_stage',
      fromValue: 'raw',
      toValue: 'normalization',
      commandCorrelationId: correlationId,
    });

    const organization = first(
      await client.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, fixture.organizationId)),
    );
    const transitionCount = first(
      await client.db
        .select({ value: count() })
        .from(operationalStateTransitions)
        .where(eq(operationalStateTransitions.subjectId, fixture.organizationId)),
    ).value;
    const auditCount = first(
      await client.db
        .select({ value: count() })
        .from(auditEvents)
        .where(eq(auditEvents.commandCorrelationId, correlationId)),
    ).value;
    const outboxCount = first(
      await client.db
        .select({ value: count() })
        .from(outboxEvents)
        .where(eq(outboxEvents.idempotencyKey, correlationId)),
    ).value;

    expect(organization.prospectStage).toBe('normalization');
    expect(transitionCount).toBe(1);
    expect(auditCount).toBe(1);
    expect(outboxCount).toBe(1);
  });

  it('rolls back the state update when transition history insert fails', async () => {
    const fixture = await createOrganizationFixture(client, 'transition-failure');
    const invalidUserId = '00000000-0000-0000-0000-000000000099';

    await expect(
      client.withTransaction(async (tx) => {
        const service = buildTransactionalService(tx);
        await service.transitionResearchStatus({
          organizationId: fixture.organizationId,
          to: 'in_progress',
          expectedRecordVersion: 1,
          actor: { type: 'user', userId: invalidUserId },
          commandCorrelationId: '44444444-4444-4444-4444-444444444444',
        });
      }),
    ).rejects.toThrow();

    const organization = first(
      await client.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, fixture.organizationId)),
    );
    const transitionCount = first(
      await client.db
        .select({ value: count() })
        .from(operationalStateTransitions)
        .where(eq(operationalStateTransitions.subjectId, fixture.organizationId)),
    ).value;

    expect(organization.researchStatus).toBe('not_started');
    expect(organization.recordVersion).toBe(1);
    expect(transitionCount).toBe(0);
  });

  it('rolls back state, transition, audit, and outbox rows when outbox publication fails', async () => {
    const fixture = await createOrganizationFixture(client, 'outbox-failure');
    const correlationId = '55555555-5555-5555-5555-555555555555';

    await expect(
      client.withTransaction(async (tx) => {
        const service = buildTransactionalService(tx, new ThrowingAfterInsertOutboxAdapter(tx));
        await service.transitionProspectStage({
          organizationId: fixture.organizationId,
          to: 'normalization',
          expectedRecordVersion: 1,
          actor: { type: 'user', userId: fixture.userId },
          commandCorrelationId: correlationId,
        });
      }),
    ).rejects.toThrow('simulated outbox failure');

    const organization = first(
      await client.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, fixture.organizationId)),
    );
    const transitionCount = first(
      await client.db
        .select({ value: count() })
        .from(operationalStateTransitions)
        .where(eq(operationalStateTransitions.subjectId, fixture.organizationId)),
    ).value;
    const auditCount = first(
      await client.db
        .select({ value: count() })
        .from(auditEvents)
        .where(eq(auditEvents.commandCorrelationId, correlationId)),
    ).value;
    const outboxCount = first(
      await client.db
        .select({ value: count() })
        .from(outboxEvents)
        .where(eq(outboxEvents.idempotencyKey, correlationId)),
    ).value;

    expect(organization.prospectStage).toBe('raw');
    expect(organization.recordVersion).toBe(1);
    expect(transitionCount).toBe(0);
    expect(auditCount).toBe(0);
    expect(outboxCount).toBe(0);
  });
});

function buildTransactionalService(
  db: RepositoryExecutor,
  outbox: OperationalStateOutboxPort = new OutboxAdapter(db),
): OperationalStateService {
  return new OperationalStateService(
    new PostgresOrganizationStateWriter(db),
    new PostgresOperationalStateTransitionRepository(db),
    new AuditAdapter(db),
    outbox,
  );
}

class AuditAdapter implements OperationalStateAuditPort {
  constructor(private readonly db: RepositoryExecutor) {}

  async append(event: Parameters<OperationalStateAuditPort['append']>[0]): Promise<void> {
    await this.db.insert(auditEvents).values({
      actorType: event.actorUserId === null ? 'system' : 'user',
      actorUserId: event.actorUserId,
      action: event.action,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      organizationId: event.subjectId,
      contactId: null,
      commandCorrelationId: event.correlationId,
      beforeData: null,
      afterData: null,
      metadata: event.metadata,
    });
  }
}

class OutboxAdapter implements OperationalStateOutboxPort {
  constructor(private readonly db: RepositoryExecutor) {}

  async insert(event: Parameters<OperationalStateOutboxPort['insert']>[0]): Promise<void> {
    await this.db.insert(outboxEvents).values({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      metadata: event.metadata,
    });
  }
}

class ThrowingAfterInsertOutboxAdapter extends OutboxAdapter {
  override async insert(event: Parameters<OperationalStateOutboxPort['insert']>[0]): Promise<void> {
    await super.insert(event);
    throw new Error('simulated outbox failure');
  }
}

async function createOrganizationFixture(
  client: DatabaseClient,
  suffix: string,
): Promise<{ organizationId: string; userId: string }> {
  const user = first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `auth0|qualification-${suffix}`,
        email: `qualification-${suffix}@example.com`,
        displayName: `Qualification ${suffix} User`,
        status: 'active',
      })
      .returning({ id: users.id }),
  );
  const organization = first(
    await client.db
      .insert(organizations)
      .values({
        displayName: `Qualification ${suffix} Advisors`,
        normalizedName: `qualification ${suffix} advisors`,
        normalizedDomain: `qualification-${suffix}.example.com`,
      })
      .returning({ id: organizations.id }),
  );

  await client.db.insert(contacts).values({
    organizationId: organization.id,
    displayName: `Qualification ${suffix} Contact`,
  });

  return { organizationId: organization.id, userId: user.id };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected at least one row.');
  }
  return row;
}
