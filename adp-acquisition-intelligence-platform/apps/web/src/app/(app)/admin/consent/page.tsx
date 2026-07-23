import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminConsentPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-27',
        title: 'Consent and suppressions',
        description:
          'Assert permissions, org restrictions, global suppressions, and lift opt-out with reviewer.',
        requiredRoles: ['admin'],
        primaryActions: ['Assert permission', 'Lift opt-out'],
      }}
      searchParams={await searchParams}
    />
  );
}
