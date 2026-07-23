import Link from 'next/link';

import { StubScreen } from '@/components/stub-screen';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const LINKS = [
  { href: '/research/population-sources', label: 'Population Sources' },
  { href: '/research/population-imports', label: 'Population Imports' },
  { href: '/research/entity-resolution', label: 'Entity Resolution' },
  { href: '/research/priorities', label: 'Research Priorities' },
  { href: '/research/collection-jobs', label: 'Collection Jobs' },
  { href: '/research/extraction-review', label: 'Extraction Review' },
  { href: '/research/coverage', label: 'Source Coverage' },
  { href: '/research/sources', label: 'Approved Sources' },
  {
    href: '/research',
    label: 'Intelligence queue',
    note: 'legacy table view retained via /research/intelligence',
  },
] as const;

export default async function ResearchHubPage({ searchParams }: PageProps) {
  return (
    <StubScreen
      config={{
        screenId: 'UI-08',
        title: 'Research',
        description:
          'Population, enrichment, prioritized collection, and extraction review. Collectors never confirm variables.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
        primaryActions: [
          'Import Target Universe',
          'Resolve Candidate Organizations',
          'Calculate Research Priorities',
          'Start Collection Run',
          'Review Extracted Claims',
        ],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel">
        <ul>
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/research/intelligence">Open intelligence / research queue table</Link>
        </p>
      </div>
    </StubScreen>
  );
}
