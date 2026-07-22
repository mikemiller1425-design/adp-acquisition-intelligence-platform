import { describe, expect, it } from 'vitest';

import { parseCsvRows, validateCsvArtifact } from '../index.js';

describe('collection CSV performance', () => {
  it(
    'streams at least 10,000 rows with bounded memory',
    async () => {
      const csv = buildLargeCsv(10_000);
      const started = performance.now();
      const startHeap = process.memoryUsage().heapUsed;
      const artifact = validateCsvArtifact({
        filename: 'large.csv',
        contentType: 'text/csv',
        bytes: new TextEncoder().encode(csv),
        limits: {
          maxBytes: 5_000_000,
          maxRows: 10_001,
          maxColumns: 10,
          maxCellBytes: 1_000,
        },
      });
      let rows = 0;
      for await (const _row of parseCsvRows(artifact.text, artifact.delimiter)) {
        rows += 1;
      }
      const durationMs = performance.now() - started;
      const heapDeltaMb = (process.memoryUsage().heapUsed - startHeap) / 1024 / 1024;
      console.info(
        JSON.stringify({
          test: 'collection_csv_10k',
          rows,
          durationMs: Math.round(durationMs),
          heapDeltaMb: Number(heapDeltaMb.toFixed(2)),
        }),
      );
      expect(rows).toBe(10_001);
      expect(durationMs).toBeLessThan(5_000);
      expect(heapDeltaMb).toBeLessThan(64);
    },
    15_000,
  );
});

function buildLargeCsv(rows: number): string {
  const lines = ['Company,Domain,Contact,Email'];
  for (let index = 0; index < rows; index += 1) {
    lines.push(`Org ${index},org${index}.example,Person ${index},person${index}@org${index}.example`);
  }
  return `${lines.join('\n')}\n`;
}
