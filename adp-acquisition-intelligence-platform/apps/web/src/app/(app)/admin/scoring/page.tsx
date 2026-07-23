import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminScoringPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-24',
        title: 'Score definitions',
        description: 'Validate, replay, activate or retire score versions.',
        requiredRoles: ['admin'],
      }}
      searchParams={await searchParams}
    />
  );
}
