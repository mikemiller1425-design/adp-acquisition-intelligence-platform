import { describe, expect, it } from 'vitest';

import {
  ImportCommitService,
  ImportDryRunService,
  ImportRetryService,
  applyMappingToRawRow,
  evaluateImportReversal,
  evaluateMergeReversal,
  findDuplicateCandidates,
  loadFieldRegistry,
  normalizeBoolean,
  normalizeContactRole,
  normalizeCountry,
  normalizeCurrency,
  normalizeDate,
  normalizeDomain,
  normalizeEmail,
  normalizeFirmType,
  normalizeLegalSuffix,
  normalizeNumber,
  normalizeOrgName,
  normalizePercentage,
  normalizePhone,
  normalizeRange,
  normalizeState,
  normalizeUrl,
  normalizeUnicodeWhitespace,
  planOrganizationMerge,
  transitionImportStatus,
} from '../index.js';
import {
  InMemoryBatchRepo,
  InMemoryConsentPort,
  InMemoryDuplicateCandidateRepo,
  InMemoryDuplicateRepo,
  InMemoryEvidencePort,
  InMemoryObservationPort,
  InMemoryOrgPort,
  InMemoryRowRepo,
  InMemoryVariablePort,
  mergeSnapshot,
  researcher,
  reviewer,
} from './support/fakes.js';

describe('collection unit domain coverage', () => {
  it('normalizes all major primitive and identity field kinds deterministically', () => {
    expect(normalizeUnicodeWhitespace(' A\u00a0 B ').normalized).toBe('A B');
    expect(normalizeOrgName('  Acme Communities, LLC ').normalized).toBe('acme communities');
    expect(normalizeLegalSuffix('L.L.C.').normalized).toBe('llc');
    expect(normalizeDomain('https://www.Example.com/path').normalized).toBe('example.com');
    expect(normalizeUrl('Example.com/path#fragment').normalized).toBe('https://example.com/path');
    expect(normalizeEmail(' Person@Example.COM ').normalized).toBe('person@example.com');
    expect(normalizePhone('(303) 555-0101').normalized).toBe('+13035550101');
    expect(normalizeState('Colorado').normalized).toBe('CO');
    expect(normalizeCountry('United States').normalized).toBe('US');
    expect(normalizeFirmType('Association Management Company').normalized).toBe('amc');
    expect(normalizeContactRole('Property Manager').normalized).toBe('property_manager');
    expect(normalizeBoolean('no').normalized).toBe(false);
    expect(normalizeDate('2026-07-22T14:00:00Z').normalized).toBe('2026-07-22');
    expect(normalizeNumber('1,250').normalized).toBe(1250);
    expect(normalizePercentage('25%').normalized).toBe(0.25);
    expect(normalizeCurrency('$1,200.50').normalized).toBe(1200.5);
    expect(normalizeRange('10 - 20').normalized).toEqual({ min: 10, max: 20 });
  });

  it('loads a 52-field registry and rejects duplicate aliases', () => {
    const registry = loadFieldRegistry();
    expect(registry.fields).toHaveLength(52);
    expect(registry.fields.map((field) => field.key)).toContain(
      'variable.estimated_contract_value',
    );
    expect(() =>
      loadFieldRegistry({
        version: 'duplicate-test',
        fields: [
          {
            key: 'organization.display_name',
            label: 'Organization display name',
            subject: 'organization',
            valueKind: 'string',
            requiredForCommit: true,
            aliases: ['company'],
          },
          {
            key: 'organization.legal_name',
            label: 'Organization legal name',
            subject: 'organization',
            valueKind: 'string',
            aliases: ['company'],
          },
        ],
      }),
    ).toThrow(/Duplicate field registry/);
  });

  it('validates mappings, required fields, field values, and blank-not-unknown semantics', () => {
    const registry = loadFieldRegistry();
    const valid = applyMappingToRawRow({
      raw: {
        Company: 'Acme HOA',
        Domain: 'https://acme.example/path',
        Consent: '',
        Revenue: '$12,500',
      },
      mapping: {
        Company: 'organization.display_name',
        Domain: 'organization.domain',
        Consent: 'consent.email_state',
        Revenue: 'variable.estimated_contract_value',
      },
      registry,
    });
    expect(valid.errors).toEqual([]);
    expect(valid.mapped['consent.email_state']).toBeNull();
    expect(valid.normalized['consent.email_state']).toBeNull();
    expect(valid.normalized['consent.email_state.__blank']).toBe(true);
    expect(valid.normalized['variable.estimated_contract_value']).toBe(12500);

    expect(
      applyMappingToRawRow({
        raw: { Email: 'not an email' },
        mapping: { Email: 'contact.email' },
        registry,
      }).errors,
    ).toEqual(['Invalid Contact email', 'Missing required field Organization display name']);
  });

  it('enforces lifecycle transitions and commit eligibility preconditions', () => {
    expect(
      transitionImportStatus('validating', 'preview_ready', {
        hasMapping: true,
        hasValidRows: true,
        hasValidationErrors: true,
      }),
    ).toBe('preview_ready');
    expect(() => transitionImportStatus('uploaded', 'committed')).toThrow();
    expect(() =>
      transitionImportStatus('preview_ready', 'ready_to_commit', {
        hasPreviewReport: true,
        hasUnresolvedDuplicates: true,
      }),
    ).toThrow(/preconditions/);
  });

  it('returns duplicate features and explanations across exact and ambiguous tiers', () => {
    const matches = findDuplicateCandidates(
      {
        displayName: 'Acme HOA LLC',
        domain: 'acme.example',
        addressLine1: '1 Main Street',
        city: 'Denver',
        contactEmails: ['president@acme.example'],
      },
      [
        {
          organizationId: 'exact-domain',
          displayName: 'Acme HOA',
          domain: 'https://www.acme.example',
        },
        {
          organizationId: 'ambiguous-address',
          displayName: 'Acme HOA',
          addressLine1: '1 Main St',
          city: 'Denver',
        },
        {
          organizationId: 'contact-only',
          displayName: 'Other Community',
          addressLine1: '1 Main St',
          city: 'Denver',
          contactEmails: ['president@acme.example'],
        },
      ],
    );
    expect(matches.map((match) => [match.candidateOrganizationId, match.tier])).toEqual([
      ['exact-domain', 'exact'],
      ['ambiguous-address', 'likely'],
      ['contact-only', 'possible'],
    ]);
    expect(
      matches[0]?.features.some(
        (feature) => feature.key === 'normalized_domain' && feature.matched,
      ),
    ).toBe(true);
    expect(matches[1]?.explanation).toContain('legal_name');
  });

  it('plans merge child reassignment and surfaces relationship/cycle blockers', () => {
    const plan = planOrganizationMerge({
      survivorOrganizationId: 'survivor',
      duplicateOrganizationIds: ['duplicate'],
      snapshots: [
        mergeSnapshot('survivor', {}, true),
        mergeSnapshot('duplicate', { contacts: 2, locations: 1 }, true),
      ],
      idempotencyKey: 'merge-key',
    });
    expect(plan.childReassignments).toContainEqual({
      childType: 'contacts',
      fromOrganizationId: 'duplicate',
      toOrganizationId: 'survivor',
      count: 2,
    });
    expect(plan.conflicts).toEqual([
      expect.objectContaining({ type: 'existing_relationship', organizationId: 'duplicate' }),
    ]);
    expect(() =>
      planOrganizationMerge({
        survivorOrganizationId: 'a',
        duplicateOrganizationIds: ['b'],
        snapshots: [mergeSnapshot('a'), mergeSnapshot('b')],
        priorMergeEdges: [{ fromOrganizationId: 'a', toOrganizationId: 'b' }],
        idempotencyKey: 'cycle',
      }),
    ).toThrow(/cycle/);
  });

  it('evaluates import and merge reversal eligibility with explicit blockers', () => {
    expect(
      evaluateImportReversal({
        batchStatus: 'committed',
        createdEntityCount: 3,
        touchedAfterImportCount: 0,
        hasExternalReferences: false,
        hasConsentWeakeningRisk: false,
      }),
    ).toMatchObject({ eligible: true, blockers: [] });
    expect(
      evaluateImportReversal({
        batchStatus: 'committed',
        createdEntityCount: 1,
        touchedAfterImportCount: 1,
        hasExternalReferences: true,
        hasConsentWeakeningRisk: true,
      }).blockers,
    ).toEqual([
      'entities_touched_after_import',
      'external_references_present',
      'consent_preservation_required',
    ]);
    expect(
      evaluateMergeReversal({
        mergeStatus: 'applied',
        survivorTouchedAfterMerge: false,
        duplicateArchivedOnly: true,
        movedChildrenTouchedCount: 0,
        wouldOrphanHistory: false,
      }),
    ).toMatchObject({ eligible: true });
    expect(
      evaluateMergeReversal({
        mergeStatus: 'applied',
        survivorTouchedAfterMerge: true,
        duplicateArchivedOnly: false,
        movedChildrenTouchedCount: 1,
        wouldOrphanHistory: true,
      }).blockers,
    ).toContain('moved_children_touched_after_merge');
  });
});

describe('collection unit service gates', () => {
  it('keeps dry-run free of business mutations and idempotent for duplicate reviews', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const duplicates = new InMemoryDuplicateRepo();
    const orgs = new InMemoryOrgPort();
    const batch = await createValidatedBatch(batches, rows, [
      {
        rowNumber: 2,
        mapped: {
          'organization.display_name': 'Existing HOA',
          'organization.domain': 'existing.example',
        },
        normalized: {
          'organization.display_name': 'Existing HOA',
          'organization.domain': 'existing.example',
        },
      },
    ]);
    await batches.updateStatus(batch.id, 'preview_ready');

    const service = new ImportDryRunService(
      batches,
      rows,
      new InMemoryDuplicateCandidateRepo(() => [
        {
          organizationId: orgs.existingOrganizationId,
          displayName: 'Existing HOA',
          domain: 'existing.example',
        },
      ]),
      duplicates,
    );
    await service.dryRun({ actor: researcher, batchId: batch.id });
    await service.dryRun({ actor: researcher, batchId: batch.id });

    expect(await duplicates.listByBatch(batch.id)).toHaveLength(1);
    expect(orgs.createdOrganizations).toHaveLength(0);
  });

  it('blocks commit until dry-run eligibility and duplicate review resolution are complete', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const duplicates = new InMemoryDuplicateRepo();
    const orgs = new InMemoryOrgPort();
    const batch = await createValidatedBatch(batches, rows, [
      {
        rowNumber: 2,
        mapped: { 'organization.display_name': 'Acme HOA' },
        normalized: { 'organization.display_name': 'Acme HOA' },
      },
    ]);
    await batches.updateStatus(batch.id, 'preview_ready');

    const commit = new ImportCommitService(
      batches,
      rows,
      duplicates,
      orgs,
      new InMemoryEvidencePort(),
      new InMemoryVariablePort(),
      new InMemoryConsentPort(),
    );
    await expect(
      commit.commit({ actor: reviewer, batchId: batch.id, idempotencyKey: 'commit-too-early' }),
    ).rejects.toThrow(/transition/);

    await batches.updateStatus(batch.id, 'duplicate_review_required');
    const [row] = await rows.listByBatch(batch.id);
    await duplicates.insertCandidates([
      {
        batchId: batch.id,
        rowId: row?.id ?? '',
        candidateOrganizationId: orgs.existingOrganizationId,
        tier: 'exact',
        features: [],
      },
    ]);
    await expect(
      commit.commit({ actor: reviewer, batchId: batch.id, idempotencyKey: 'commit-unresolved' }),
    ).rejects.toThrow(/Duplicate reviews/);
  });

  it('commits rows with evidence, observation, variable, and consent preservation behavior', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const duplicates = new InMemoryDuplicateRepo();
    const orgs = new InMemoryOrgPort();
    const evidence = new InMemoryEvidencePort();
    const variables = new InMemoryVariablePort();
    const consent = new InMemoryConsentPort();
    const observations = new InMemoryObservationPort();
    const batch = await createValidatedBatch(batches, rows, [
      {
        rowNumber: 2,
        mapped: {
          'organization.display_name': 'Consent HOA',
          'contact.display_name': 'Casey Consent',
          'contact.email': 'casey@example.com',
          'consent.email_state': 'restricted',
          'variable.import_note': 'board led',
        },
        normalized: {
          'organization.display_name': 'Consent HOA',
          'contact.display_name': 'Casey Consent',
          'contact.email': 'casey@example.com',
          'consent.email_state': 'restricted',
          'variable.import_note': 'board led',
        },
      },
    ]);
    await batches.updateStatus(batch.id, 'ready_to_commit');

    const report = await new ImportCommitService(
      batches,
      rows,
      duplicates,
      orgs,
      evidence,
      variables,
      consent,
      observations,
    ).commit({ actor: reviewer, batchId: batch.id, idempotencyKey: 'commit-with-ports' });

    expect(report).toMatchObject({ committedRows: 1, failedRows: 0 });
    expect(evidence.records).toHaveLength(1);
    expect(observations.observations).toHaveLength(1);
    expect(variables.proposals.map((proposal) => proposal.fieldKey)).toEqual([
      'variable.import_note',
    ]);
    expect(consent.decisions).toEqual([
      expect.objectContaining({ applied: true, reason: 'applied_imported_state' }),
    ]);
  });

  it('resets failed rows for honest commit retry eligibility', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const batch = await createValidatedBatch(batches, rows, [
      {
        rowNumber: 2,
        mapped: { 'organization.display_name': 'Retry HOA' },
        normalized: { 'organization.display_name': 'Retry HOA' },
        status: 'failed',
        errors: ['transient'],
      },
    ]);

    const retry = await new ImportRetryService(rows).resetFailedRows({
      actor: reviewer,
      batchId: batch.id,
    });
    expect(retry.resetRows).toBe(1);
    expect((await rows.listByBatch(batch.id))[0]?.status).toBe('valid');
  });
});

async function createValidatedBatch(
  batches: InMemoryBatchRepo,
  rows: InMemoryRowRepo,
  rowInputs: Array<{
    rowNumber: number;
    mapped: Record<string, string | null>;
    normalized: Record<string, unknown>;
    status?: 'valid' | 'failed';
    errors?: string[];
  }>,
) {
  const batch = await batches.create({
    originalFilename: 'unit.csv',
    storageKey: 'imports/unit/unit.csv',
    contentType: 'text/csv',
    contentHash: 'hash',
    fileSizeBytes: 10,
    delimiter: ',',
    idempotencyKey: `unit-${Math.random()}`,
    rowCount: rowInputs.length,
    createdByUserId: null,
  });
  await rows.insertMany(
    rowInputs.map((row) => ({
      batchId: batch.id,
      rowNumber: row.rowNumber,
      raw: Object.fromEntries(
        Object.entries(row.mapped).map(([key, value]) => [key, String(value ?? '')]),
      ),
      mapped: row.mapped,
      normalized: row.normalized,
      status: row.status ?? 'valid',
      errors: row.errors ?? [],
      createdOrganizationId: null,
      createdContactId: null,
      createdLocationId: null,
    })),
  );
  return batch;
}
