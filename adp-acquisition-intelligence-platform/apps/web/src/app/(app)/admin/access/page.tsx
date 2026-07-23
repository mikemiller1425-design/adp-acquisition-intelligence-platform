import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminAccessPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-25',
        title: 'Users, roles, and territories',
        description: 'Administer access and assignments.',
        requiredRoles: ['admin'],
      }}
      searchParams={await searchParams}
    />
  );
}
