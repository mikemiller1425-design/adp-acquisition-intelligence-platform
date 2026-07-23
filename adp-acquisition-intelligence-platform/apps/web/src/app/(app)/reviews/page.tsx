import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReviewsPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-12',
        title: 'Qualification queue',
        description: 'Route and assign reviewers.',
        requiredRoles: ['admin', 'reviewer'],
        primaryActions: ['Assign reviewer'],
      }}
      searchParams={await searchParams}
    />
  );
}
