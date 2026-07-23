import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImportDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-06',
        title: `Import batch ${id}`,
        description: 'Row results, entity links, and error export.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: ['Export errors', 'Commit', 'Revert'],
      }}
      searchParams={await searchParams}
    />
  );
}
