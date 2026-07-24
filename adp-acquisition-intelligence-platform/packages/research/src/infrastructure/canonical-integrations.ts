import { createHash } from 'node:crypto';
import {
  evidenceRecords,
  sources,
  variableDefinitions,
  variableDefinitionVersions,
  variableValues,
  variableValueEvidence,
  type RepositoryExecutor,
} from '@adp/database';
import { and, eq } from 'drizzle-orm';

import type { EvidenceIntegrationPort, VariableIntegrationPort } from '../domain/ports.js';

type Db = RepositoryExecutor;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function contentHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** Map claim variable keys (e.g. services.payroll_offered) to seeded definition keys. */
export function claimVariableKeyToDefinitionKey(variableKey: string): string {
  const parts = variableKey.split('.');
  return parts.at(-1) ?? variableKey;
}

/**
 * Persists evidence_records on the same RepositoryExecutor as the research UoW
 * so claim acceptance can share one database transaction.
 */
export class PostgresEvidenceIntegration implements EvidenceIntegrationPort {
  constructor(private readonly db: Db) {}

  async createEvidenceFromAcceptedClaim(input: {
    organizationId: string;
    claim: string;
    excerpt: string;
    sourceUrl: string;
    snapshotId: string;
    actorUserId: string;
  }): Promise<{ evidenceId: string }> {
    const locator = `${input.sourceUrl}#snapshot:${input.snapshotId}`;
    const sourceInsert = await this.db
      .insert(sources)
      .values({
        sourceType: 'company_website',
        title: `Research snapshot ${input.snapshotId}`,
        locator,
        accessClassification: 'public',
        status: 'active',
      })
      .returning({ id: sources.id });
    const sourceId = sourceInsert[0]!.id;

    const observedAt = new Date();
    const retrievedAt = observedAt;
    const structuredPayload = {
      excerpt: input.excerpt,
      snapshotId: input.snapshotId,
      sourceUrl: input.sourceUrl,
    };
    const hash = contentHash({
      subjectType: 'organization',
      organizationId: input.organizationId,
      contactId: null,
      sourceId,
      claim: input.claim,
      structuredPayload,
      evidenceType: 'source_derived_fact',
      observedAt: observedAt.toISOString(),
      retrievedAt: retrievedAt.toISOString(),
      effectiveAt: null,
      expiresAt: null,
    });

    const existing = await this.db
      .select({ id: evidenceRecords.id })
      .from(evidenceRecords)
      .where(eq(evidenceRecords.contentHash, hash))
      .limit(1);
    if (existing[0]) return { evidenceId: existing[0].id };

    const inserted = await this.db
      .insert(evidenceRecords)
      .values({
        subjectType: 'organization',
        organizationId: input.organizationId,
        contactId: null,
        sourceId,
        claim: input.claim,
        structuredPayload,
        evidenceType: 'source_derived_fact',
        observedAt,
        retrievedAt,
        reviewerStatus: 'pending',
        contentHash: hash,
        // Demo actors may not exist in users — keep null to satisfy FK.
        actorUserId: null,
        correlationId: null,
      })
      .returning({ id: evidenceRecords.id });

    return { evidenceId: inserted[0]!.id };
  }
}

/**
 * Proposes variable_values on the same RepositoryExecutor as the research UoW.
 */
export class PostgresVariableIntegration implements VariableIntegrationPort {
  constructor(private readonly db: Db) {}

  async proposeFromAcceptedClaim(input: {
    organizationId: string;
    variableKey: string;
    value: unknown;
    evidenceId: string;
    actorUserId: string;
  }): Promise<{ variableValueId: string }> {
    const definitionKey = claimVariableKeyToDefinitionKey(input.variableKey);
    const definition = await this.db
      .select()
      .from(variableDefinitions)
      .where(eq(variableDefinitions.key, definitionKey))
      .limit(1);
    if (!definition[0]) {
      throw new Error(`variable_definition_not_found:${definitionKey}`);
    }

    let versionId = definition[0].currentVersionId;
    if (!versionId) {
      const version = await this.db
        .select({ id: variableDefinitionVersions.id })
        .from(variableDefinitionVersions)
        .where(
          and(
            eq(variableDefinitionVersions.definitionId, definition[0].id),
            eq(variableDefinitionVersions.lifecycleStatus, 'active'),
          ),
        )
        .limit(1);
      versionId = version[0]?.id ?? null;
    }
    if (!versionId) {
      throw new Error(`variable_definition_version_missing:${definitionKey}`);
    }

    const inserted = await this.db
      .insert(variableValues)
      .values({
        subjectType: 'organization',
        organizationId: input.organizationId,
        contactId: null,
        variableDefinitionId: definition[0].id,
        definitionVersionId: versionId,
        typedValue: input.value as never,
        valueStatus: 'known',
        evidenceType: 'source_derived_fact',
        confidenceStatus: 'unassessed',
        lifecycle: 'proposed',
        freshnessResult: 'unknown',
        calculationActor: 'research_claim_accept',
        sourceActorUserId: null,
        observedAt: new Date(),
      })
      .returning({ id: variableValues.id });

    const valueId = inserted[0]!.id;
    await this.db.insert(variableValueEvidence).values({
      valueId,
      evidenceId: input.evidenceId,
      relationshipType: 'supports',
      contributionRole: 'proposal',
      actorUserId: null,
    });

    return { variableValueId: valueId };
  }
}

/** Fail-closed helpers used by rollback tests. */
export class FailingVariableIntegration implements VariableIntegrationPort {
  constructor(private readonly message = 'forced_variable_failure') {}

  async proposeFromAcceptedClaim(): Promise<{ variableValueId: string }> {
    throw new Error(this.message);
  }
}

export class FailingEvidenceIntegration implements EvidenceIntegrationPort {
  constructor(private readonly message = 'forced_evidence_failure') {}

  async createEvidenceFromAcceptedClaim(): Promise<{ evidenceId: string }> {
    throw new Error(this.message);
  }
}
