import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ImportsPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-05',
        title: 'Import history',
        description: 'Upload, map, dry run, inspect errors, commit or revert imports.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: ['Start import', 'View job status'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel">No import batches yet. Upload a CSV to begin.</div>
    </StubScreen>
  );
}
