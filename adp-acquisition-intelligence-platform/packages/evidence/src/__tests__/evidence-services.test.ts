import { describe, expect, it } from 'vitest';

import { ConfidenceAssessmentService } from '../application/confidence-assessment-service.js';
import { SourceService } from '../application/source-service.js';
import { StalenessEvaluationService } from '../application/staleness-evaluation-service.js';
import type {
  ConfidenceAssessment,
  ConfidenceAssessmentRepository,
  SourceRecord,
  SourceRepository,
} from '../domain/ports.js';

const researcher = {
  userId: '11111111-1111-1111-1111-111111111111',
  roles: ['researcher'] as const,
};

describe('evidence domain services', () => {
  it('rejects source metadata that looks like credentials', async () => {
    const service = new SourceService(new InMemorySourceRepository());

    await expect(
      service.create({
        sourceType: 'company_website',
        title: 'Credentialed Source',
        locator: 'https://example.com',
        retrievalRestrictions: { apiKey: 'do-not-store' },
        actor: researcher,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('deduplicates sources by type and locator', async () => {
    const repository = new InMemorySourceRepository();
    const service = new SourceService(repository);
    const first = await service.create({
      sourceType: 'company_website',
      title: 'Firm Site',
      locator: 'https://firm.example',
      actor: researcher,
    });
    const second = await service.create({
      sourceType: 'company_website',
      title: 'Firm Site Duplicate',
      locator: 'https://firm.example',
      actor: researcher,
    });

    expect(second.id).toBe(first.id);
    expect(repository.records).toHaveLength(1);
  });

  it('records confidence components without inventing an aggregate score', async () => {
    const service = new ConfidenceAssessmentService(new InMemoryConfidenceRepository());

    const result = await service.assess({
      subjectType: 'evidence_record',
      subjectId: '22222222-2222-2222-2222-222222222222',
      components: {
        sourceReliability: 0.9,
        specificity: 0.8,
        recency: 0.7,
        crossSourceAgreement: 0.6,
        extractionCertainty: 0.5,
      },
      policyVersion: 'unapproved-policy',
      actor: researcher,
    });

    expect(result.assessment.aggregateScore).toBeNull();
    expect(result.explanation.aggregateScore).toBeNull();
    expect(result.explanation.status).toBe('provisional');
  });

  it('evaluates staleness only from explicit freshness policy fields', () => {
    const service = new StalenessEvaluationService();
    const evaluatedAt = new Date('2026-07-22T00:00:00.000Z');

    expect(
      service.evaluate({
        definitionVersion: { freshnessPolicy: null },
        value: {
          observedAt: new Date('2026-07-01T00:00:00.000Z'),
          effectiveAt: null,
          expiresAt: null,
        },
        evaluatedAt,
      }).result,
    ).toBe('no_policy');
    expect(
      service.evaluate({
        definitionVersion: { freshnessPolicy: { staleAfterDays: 10, expiringAfterDays: 5 } },
        value: {
          observedAt: new Date('2026-07-01T00:00:00.000Z'),
          effectiveAt: null,
          expiresAt: null,
        },
        evaluatedAt,
      }).result,
    ).toBe('stale');
  });
});

class InMemorySourceRepository implements SourceRepository {
  records: SourceRecord[] = [];

  async findById(id: string): Promise<SourceRecord | null> {
    return this.records.find((record) => record.id === id) ?? null;
  }

  async findByTypeAndLocator(
    sourceType: Parameters<SourceRepository['findByTypeAndLocator']>[0],
    locator: string,
  ): Promise<SourceRecord | null> {
    return (
      this.records.find(
        (record) => record.sourceType === sourceType && record.locator === locator,
      ) ?? null
    );
  }

  async insert(input: Parameters<SourceRepository['insert']>[0]): Promise<SourceRecord> {
    const record: SourceRecord = {
      id: `source-${this.records.length + 1}`,
      ...input,
      status: 'active',
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
      updatedAt: new Date('2026-07-22T00:00:00.000Z'),
    };
    this.records.push(record);
    return record;
  }

  async update(): Promise<SourceRecord | null> {
    return null;
  }

  async disable(): Promise<SourceRecord | null> {
    return null;
  }
}

class InMemoryConfidenceRepository implements ConfidenceAssessmentRepository {
  async insert(
    input: Parameters<ConfidenceAssessmentRepository['insert']>[0],
  ): Promise<ConfidenceAssessment> {
    return {
      id: 'assessment-1',
      ...input,
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
    };
  }
}
