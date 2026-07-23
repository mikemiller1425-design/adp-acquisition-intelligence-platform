import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AuditPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-26',
        title: 'Audit search',
        description:
          'Inspect actor, action, subject including permission blocks and state transitions.',
        requiredRoles: ['admin', 'reviewer'],
        primaryActions: ['Search', 'Restricted export'],
      }}
      searchParams={await searchParams}
    />
  );
}
