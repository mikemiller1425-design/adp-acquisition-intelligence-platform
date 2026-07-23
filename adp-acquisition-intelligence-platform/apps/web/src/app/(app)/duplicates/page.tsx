import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DuplicatesPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-07',
        title: 'Duplicate review queue',
        description: 'Compare, merge, dismiss, or defer duplicate candidates.',
        requiredRoles: ['admin', 'reviewer'],
        primaryActions: ['Compare', 'Merge', 'Dismiss', 'Defer'],
      }}
      searchParams={await searchParams}
    />
  );
}
