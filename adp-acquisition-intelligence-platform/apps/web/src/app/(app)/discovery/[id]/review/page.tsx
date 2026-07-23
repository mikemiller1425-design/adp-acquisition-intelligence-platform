import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DiscoveryReviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-17',
        title: `Mapping review ${id}`,
        description: 'Confirm or reject mappings, recalculate, route.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
        primaryActions: ['Confirm mapping', 'Reject mapping', 'Recalculate'],
      }}
      searchParams={await searchParams}
    />
  );
}
