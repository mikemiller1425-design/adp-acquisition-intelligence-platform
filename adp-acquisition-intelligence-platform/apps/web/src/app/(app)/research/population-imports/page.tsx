import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { importPopulationAction } from '@/lib/research-actions';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PopulationImportsPage({ searchParams }: PageProps) {
  getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();
  const query = await searchParams;
  const dryRunNote = query.dryRun === '1';

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R02',
        title: 'Population Imports',
        description:
          'Import target universe rows. Dry runs preview normalization without persisting candidates or organizations.',
        requiredRoles: ['admin', 'sales'],
      }}
      searchParams={query}
    >
      <div className="detail-panel" data-testid="population-imports">
        {dryRunNote ? (
          <p data-testid="dry-run-banner">
            Dry run completed — no candidates or organizations mutated.
          </p>
        ) : null}

        <form action={importPopulationAction} className="form-panel">
          <label>
            <span>Dry run (non-mutating)</span>
            <input type="checkbox" name="dryRun" data-testid="import-dry-run" />
          </label>
          <button type="submit" data-testid="import-universe">
            Import Target Universe (fixture)
          </button>
        </form>

        <h2>Imports</h2>
        {snapshot.imports.length === 0 ? (
          <p data-testid="imports-empty">No imports yet.</p>
        ) : (
          <table className="data-table" data-testid="imports-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Dry run</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.imports.map((row) => (
                <tr key={row.id} data-testid={`import-row-${row.id}`}>
                  <td>{row.id.slice(0, 8)}</td>
                  <td>{row.status}</td>
                  <td>{row.rowCount}</td>
                  <td>{row.dryRun ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p>
          <Link href="/research/entity-resolution">Continue to entity resolution →</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
