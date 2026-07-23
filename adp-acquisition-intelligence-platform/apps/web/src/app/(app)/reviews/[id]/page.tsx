import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReviewWorkspacePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-13',
        title: `Review workspace ${id}`,
        description: 'Decide, override with reason, create task.',
        requiredRoles: ['admin', 'reviewer'],
        primaryActions: ['Approve', 'Reject', 'Override', 'Create task'],
      }}
      searchParams={await searchParams}
    />
  );
}
