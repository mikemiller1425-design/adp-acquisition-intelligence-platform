import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EvidenceDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return (
    <StubScreen
      config={{
        screenId: 'UI-09',
        title: `Evidence ${id}`,
        description: 'Inspect claim, source, context; accept, reject, or contradict.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
        primaryActions: ['Accept', 'Reject', 'Contradict'],
      }}
      searchParams={await searchParams}
    />
  );
}
