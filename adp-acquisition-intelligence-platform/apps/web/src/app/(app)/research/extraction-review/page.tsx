import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-R07',
        title: 'Extraction Review',
        description:
          'Claims are proposals until accepted. Acceptance writes evidence via canonical services.',
        requiredRoles: ['admin', 'reviewer'],
        primaryActions: ['Accept', 'Accept with correction', 'Reject'],
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
