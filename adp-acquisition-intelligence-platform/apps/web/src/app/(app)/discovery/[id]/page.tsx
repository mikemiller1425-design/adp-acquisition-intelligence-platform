import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DiscoverySessionPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-16',
        title: `Discovery session ${id}`,
        description: 'Record verbatim answers and proposed mappings.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: ['Save verbatim', 'Propose mapping'],
      }}
      searchParams={await searchParams}
    />
  );
}
