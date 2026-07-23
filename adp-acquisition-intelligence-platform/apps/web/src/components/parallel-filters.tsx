'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { PARALLEL_FILTER_KEYS } from '@/lib/filter-url';

import styles from './parallel-filters.module.css';

const FILTER_LABELS: Record<(typeof PARALLEL_FILTER_KEYS)[number], string> = {
  prospectStage: 'Prospect stage',
  researchStatus: 'Research status',
  outreachStatus: 'Outreach status',
  dataFreshnessStatus: 'Data freshness',
  opportunityStage: 'Opportunity stage',
};

const FILTER_PARAM: Record<(typeof PARALLEL_FILTER_KEYS)[number], string> = {
  prospectStage: 'prospect_stage',
  researchStatus: 'research_status',
  outreachStatus: 'outreach_status',
  dataFreshnessStatus: 'freshness',
  opportunityStage: 'opportunity_stage',
};

const FILTER_OPTIONS: Record<
  (typeof PARALLEL_FILTER_KEYS)[number],
  { value: string; label: string }[]
> = {
  prospectStage: [
    { value: '', label: 'Any' },
    { value: 'normalization', label: 'Normalization' },
    { value: 'research', label: 'Research' },
    { value: 'scored', label: 'Scored' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'discovery', label: 'Discovery' },
    { value: 'outreach', label: 'Outreach' },
    { value: 'opportunity', label: 'Opportunity' },
  ],
  researchStatus: [
    { value: '', label: 'Any' },
    { value: 'gaps_open', label: 'Gaps open' },
    { value: 'sufficient_for_purpose', label: 'Sufficient' },
  ],
  outreachStatus: [
    { value: '', label: 'Any' },
    { value: 'active', label: 'Active' },
    { value: 'ready', label: 'Ready' },
    { value: 'blocked_restriction', label: 'Blocked (restriction)' },
  ],
  dataFreshnessStatus: [
    { value: '', label: 'Any' },
    { value: 'current', label: 'Current' },
    { value: 'stale', label: 'Stale' },
    { value: 'mixed', label: 'Mixed' },
  ],
  opportunityStage: [
    { value: '', label: 'Any' },
    { value: 'discovery', label: 'Discovery' },
    { value: 'proposal', label: 'Proposal' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
  ],
};

type ParallelFiltersProps = {
  enabled?: readonly (typeof PARALLEL_FILTER_KEYS)[number][];
};

export function ParallelFilters({ enabled = PARALLEL_FILTER_KEYS }: ParallelFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilter(key: (typeof PARALLEL_FILTER_KEYS)[number], value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const param = FILTER_PARAM[key];
    if (value) {
      params.set(param, value);
    } else {
      params.delete(param);
    }
    params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Parallel dimension filters</legend>
      <div className={styles.grid}>
        {enabled.map((key) => {
          const param = FILTER_PARAM[key];
          const current = searchParams.get(param) ?? '';
          const id = `filter-${param}`;
          return (
            <label key={key} className={styles.label} htmlFor={id}>
              {FILTER_LABELS[key]}
              <select
                id={id}
                className={styles.select}
                value={current}
                onChange={(event) => updateFilter(key, event.target.value)}
              >
                {FILTER_OPTIONS[key].map((option) => (
                  <option key={option.value || 'any'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
