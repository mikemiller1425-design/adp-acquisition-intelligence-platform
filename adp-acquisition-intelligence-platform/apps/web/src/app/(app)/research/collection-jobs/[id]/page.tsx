import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CollectionJobDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-R10',
        title: `Collection run ${id}`,
        description: 'Observe progress, failures, policy blocks, and cancellation state.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
        primaryActions: ['Retry Eligible Failures', 'Cancel Collection Run'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel">
        Run detail for {id}. Metrics are served from reporting projections.
      </div>
    </StubScreen>
  );
}
