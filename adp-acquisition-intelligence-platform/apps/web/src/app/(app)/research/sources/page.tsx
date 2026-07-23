import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-R09',
        title: 'Approved Sources',
        description:
          'Source registry lifecycle. Cursor cannot self-approve legal/privacy/security.',
        requiredRoles: ['admin'],
        primaryActions: ['Enable/suspend adapters', 'Activate Kill Switch'],
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
