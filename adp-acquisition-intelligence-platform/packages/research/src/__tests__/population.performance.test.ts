import { describe, expect, it } from 'vitest';
import { PopulationImportService } from '../application/population-service.js';
import {
  InMemoryOrganizationLookup,
  InMemoryOutbox,
  InMemoryPopulationRepository,
} from '../infrastructure/in-memory.js';

describe('population import 10k', () => {
  it('dry-runs 10,000 candidate rows', async () => {
    const service = new PopulationImportService(
      new InMemoryPopulationRepository(),
      new InMemoryOrganizationLookup(),
      new InMemoryOutbox(),
    );
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      Name: `Org ${i}`,
      Website: `https://org${i}.example`,
    }));
    const started = Date.now();
    const result = await service.importUniverse({
      populationSourceId: 'src',
      idempotencyKey: 'perf-10k',
      dryRun: true,
      rows,
      mapping: { displayName: 'Name', website: 'Website' },
      actorUserId: 'u1',
      role: 'admin',
    });
    expect(result.report.acceptedCount).toBe(10_000);
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});
