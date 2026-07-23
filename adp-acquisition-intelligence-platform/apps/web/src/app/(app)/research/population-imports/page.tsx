import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-R02',
        title: 'Population Imports',
        description: 'Bulk candidate ingestion with dry-run, chunking, and import reports.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: ['Import Target Universe', 'View import report'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel">
        Controlled pilot surface. Live public retrieval remains gated by approved-source lifecycle
        and kill switch.
      </div>
    </StubScreen>
  );
}
