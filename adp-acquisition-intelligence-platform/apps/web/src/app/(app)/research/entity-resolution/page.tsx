import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-R03',
        title: 'Entity Resolution',
        description:
          'Match candidates to canonical organizations. Name-only matches require review.',
        requiredRoles: ['admin', 'reviewer'],
        primaryActions: ['Resolve Candidate Organizations', 'Review ambiguous matches'],
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
