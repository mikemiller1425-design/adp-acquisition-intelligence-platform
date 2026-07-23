import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TasksPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-22',
        title: 'Work queue',
        description: 'Assign, prioritize, complete, and reschedule tasks.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
        primaryActions: ['Assign', 'Complete', 'Reschedule'],
      }}
      searchParams={await searchParams}
    />
  );
}
