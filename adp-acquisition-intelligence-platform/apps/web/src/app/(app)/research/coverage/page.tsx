import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-R08',
        title: 'Source Coverage',
        description: 'Collection coverage is distinct from data completeness and score confidence.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
        primaryActions: ['Refresh coverage'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel">
        Controlled pilot surface. Live public retrieval remains gated by approved-source lifecycle and kill switch.
      </div>
    </StubScreen>
  );
}
