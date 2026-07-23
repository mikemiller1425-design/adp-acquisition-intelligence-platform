import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-R04',
        title: 'Research Priorities',
        description: 'Versioned priority tiers A–D. Production numeric weights remain gated.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
        primaryActions: ['Calculate Research Priorities'],
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
