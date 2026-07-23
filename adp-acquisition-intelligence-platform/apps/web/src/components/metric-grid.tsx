import type { MetricValue } from '@adp/reporting';

import styles from './metric-grid.module.css';

type MetricGridProps = {
  metrics: readonly MetricValue[];
  asOf: string;
  timezone: string;
};

export function MetricGrid({ metrics, asOf, timezone }: MetricGridProps) {
  return (
    <section aria-labelledby="metric-grid-heading">
      <div className={styles.meta}>
        <h2 id="metric-grid-heading" className={styles.heading}>
          Metrics
        </h2>
        <p className={styles.asOf}>
          As of {formatAsOf(asOf, timezone)} ({timezone})
        </p>
      </div>
      <div className={styles.grid}>
        {metrics.map((metric) => (
          <article key={metric.key} className={styles.card}>
            <h3 className={styles.cardTitle}>{formatMetricKey(metric.key)}</h3>
            <p className={styles.value}>{formatMetricValue(metric)}</p>
            {metric.emptyReason ? <p className={styles.reason}>{metric.emptyReason}</p> : null}
            {metric.rateSuppressed && metric.suppressionReason ? (
              <p className={styles.reason}>Rate suppressed: {metric.suppressionReason}</p>
            ) : null}
            <a className={styles.drilldown} href={drilldownHref(metric.drilldownKey)}>
              View details
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatMetricKey(key: string): string {
  return key.replaceAll('_', ' ');
}

function formatMetricValue(metric: MetricValue): string {
  if (metric.rate !== null && !metric.rateSuppressed) {
    return `${(metric.rate * 100).toFixed(1)}%`;
  }
  if (metric.count !== null) return String(metric.count);
  return '—';
}

function formatAsOf(asOf: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(asOf));
}

function drilldownHref(drilldownKey: string): string {
  const routes: Record<string, string> = {
    table_prospect_master: '/prospects',
    table_collection_research: '/research',
    table_scoring: '/scoring',
    table_discovery: '/discovery',
    table_outreach: '/outreach',
    table_opportunities: '/opportunities',
  };
  return routes[drilldownKey] ?? '/prospects';
}
