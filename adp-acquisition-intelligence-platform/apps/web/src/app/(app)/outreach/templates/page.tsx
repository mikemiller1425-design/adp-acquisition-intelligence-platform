import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OutreachTemplatesPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-19',
        title: 'Template and sequence library',
        description: 'Draft, approve, version, and retire outreach templates.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: ['Draft template', 'Submit for approval'],
      }}
      searchParams={await searchParams}
    />
  );
}
