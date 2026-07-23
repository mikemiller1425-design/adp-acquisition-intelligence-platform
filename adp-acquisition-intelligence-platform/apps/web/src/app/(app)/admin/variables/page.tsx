import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminVariablesPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-23',
        title: 'Variable definitions',
        description: 'View, version, and publish authorized configuration.',
        requiredRoles: ['admin'],
      }}
      searchParams={await searchParams}
    />
  );
}
