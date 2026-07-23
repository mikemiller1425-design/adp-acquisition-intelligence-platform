import { normalizePopulationRow, type PopulationRow } from '../domain/normalize.js';
import type {
  OrganizationLookupPort,
  OutboxPort,
  PopulationImportRecord,
  PopulationRepository,
} from '../domain/ports.js';
import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import { resolveEntity } from '../domain/entity-resolution.js';

export type PopulationImportRequest = {
  populationSourceId: string;
  idempotencyKey: string;
  dryRun: boolean;
  rows: PopulationRow[];
  mapping: Record<string, string>;
  actorUserId: string;
  role: ResearchRole;
};

export class PopulationImportService {
  constructor(
    private readonly population: PopulationRepository,
    private readonly orgs: OrganizationLookupPort,
    private readonly outbox: OutboxPort,
  ) {}

  async importUniverse(request: PopulationImportRequest): Promise<{
    import: PopulationImportRecord;
    idempotentReplay: boolean;
    report: Record<string, unknown>;
  }> {
    const authz = new AllowListResearchCapabilityChecker(request.role);
    authz.assert('population_import:create');

    const existing = await this.population.findImportByIdempotency(request.idempotencyKey);
    if (existing) {
      return { import: existing, idempotentReplay: true, report: existing.report };
    }

    const created = await this.population.createImport({
      id: crypto.randomUUID(),
      populationSourceId: request.populationSourceId,
      status: 'normalizing',
      idempotencyKey: request.idempotencyKey,
      dryRun: request.dryRun,
      rowCount: request.rows.length,
    });

    await this.outbox.insert({
      aggregateType: 'population_import',
      aggregateId: created.id,
      eventType: 'population.import_created',
      idempotencyKey: `population.import_created:${created.id}`,
      payload: {
        populationSourceId: request.populationSourceId,
        rowCount: request.rows.length,
        dryRun: request.dryRun,
      },
    });

    const normalized = request.rows.map((row) => normalizePopulationRow(row, request.mapping));
    const accepted = normalized.filter((n) => n.validationErrors.length === 0);
    const rejected = normalized.filter((n) => n.validationErrors.length > 0);

    // Dry runs must not persist candidates or mutate organizations.
    const candidates = request.dryRun
      ? accepted.map((n) => ({
          id: `dryrun-${crypto.randomUUID()}`,
          identityKey: n.identityKey,
          displayName: n.displayName,
          legalName: n.legalName,
          domain: n.domain,
          website: n.website,
          phone: n.phone,
          addressLine1: n.addressLine1,
          city: n.city,
          region: n.region,
          postalCode: n.postalCode,
          aliases: n.aliases,
          status: 'normalized',
          organizationId: null,
        }))
      : await this.population.insertCandidates(
          accepted.map((n) => ({
            identityKey: n.identityKey,
            displayName: n.displayName,
            legalName: n.legalName,
            domain: n.domain,
            website: n.website,
            phone: n.phone,
            addressLine1: n.addressLine1,
            city: n.city,
            region: n.region,
            postalCode: n.postalCode,
            aliases: n.aliases,
            status: 'normalized',
            organizationId: null,
          })),
        );

    let matched = 0;
    let createdOrgs = 0;
    let ambiguous = 0;
    const decisions: Array<Record<string, unknown>> = [];

    for (const candidate of candidates) {
      const dupes = await this.orgs.findDuplicateCandidates({
        domain: candidate.domain,
        displayName: candidate.displayName,
        legalName: candidate.legalName,
      });
      const result = resolveEntity(
        {
          displayName: candidate.displayName,
          legalName: candidate.legalName,
          domain: candidate.domain,
          phone: candidate.phone,
          addressLine1: candidate.addressLine1,
          city: candidate.city,
          region: candidate.region,
          postalCode: candidate.postalCode,
          aliases: candidate.aliases,
        },
        dupes,
      );
      decisions.push({
        candidateId: candidate.id,
        decision: result.decision,
        organizationId: result.candidateOrganizationId,
        confidence: result.matchConfidence,
        explanation: result.explanation,
      });

      if (request.dryRun) {
        if (result.decision === 'link_existing') matched += 1;
        else if (result.decision === 'create_new') createdOrgs += 1;
        else if (
          result.decision === 'ambiguous_review' ||
          result.decision === 'possible_duplicate'
        ) {
          ambiguous += 1;
        }
        continue;
      }

      if (result.decision === 'link_existing' && result.candidateOrganizationId) {
        await this.orgs.linkCandidate(candidate.id, result.candidateOrganizationId);
        matched += 1;
        await this.outbox.insert({
          aggregateType: 'raw_candidate',
          aggregateId: candidate.id,
          eventType: 'population.organization_matched',
          idempotencyKey: `population.organization_matched:${candidate.id}`,
          payload: { organizationId: result.candidateOrganizationId },
        });
      } else if (result.decision === 'create_new') {
        const org = await this.orgs.createOrganization({
          displayName: candidate.displayName ?? candidate.legalName ?? 'Unknown Organization',
          legalName: candidate.legalName,
          domain: candidate.domain,
        });
        await this.orgs.linkCandidate(candidate.id, org.id);
        createdOrgs += 1;
        await this.outbox.insert({
          aggregateType: 'raw_candidate',
          aggregateId: candidate.id,
          eventType: 'population.organization_created',
          idempotencyKey: `population.organization_created:${candidate.id}`,
          payload: { organizationId: org.id },
        });
      } else if (
        result.decision === 'ambiguous_review' ||
        result.decision === 'possible_duplicate'
      ) {
        ambiguous += 1;
        await this.outbox.insert({
          aggregateType: 'raw_candidate',
          aggregateId: candidate.id,
          eventType: 'population.resolution_review_requested',
          idempotencyKey: `population.resolution_review_requested:${candidate.id}`,
          payload: { decision: result.decision },
        });
      }
    }

    const report = {
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      matchedCount: matched,
      createdCount: createdOrgs,
      ambiguousCount: ambiguous,
      rejectedSamples: rejected.slice(0, 20).map((r) => r.validationErrors),
      decisions: decisions.slice(0, request.dryRun ? decisions.length : 100),
      mutated: !request.dryRun,
    };

    const updated = await this.population.updateImport(created.id, {
      status: request.dryRun ? 'preview_ready' : 'committed',
      report,
    });

    return { import: updated, idempotentReplay: false as const, report };
  }
}
