import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DiscoveryAgendaPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-15',
        title: `Agenda builder ${id}`,
        description: 'Accept, reorder recommended questions, export agenda.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: ['Reorder', 'Export agenda'],
      }}
      searchParams={await searchParams}
    />
  );
}
