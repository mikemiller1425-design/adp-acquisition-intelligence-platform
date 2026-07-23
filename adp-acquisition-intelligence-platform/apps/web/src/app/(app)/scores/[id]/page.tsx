import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ScoreDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-11',
        title: `Score explanation ${id}`,
        description: 'View snapshot, contributions, gaps, version and history.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
      }}
      searchParams={await searchParams}
    />
  );
}
