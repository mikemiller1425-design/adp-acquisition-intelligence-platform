import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-R05',
        title: 'Collection Jobs',
        description:
          'Bounded, cancellable collection runs against approved and enabled sources only.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: [
          'Start Collection Run',
          'Retry Eligible Failures',
          'Cancel Collection Run',
        ],
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
