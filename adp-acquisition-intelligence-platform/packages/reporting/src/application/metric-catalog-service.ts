import { readFile } from 'node:fs/promises';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { DASHBOARD_KEYS, type DashboardKey } from '../domain/reporting.js';
import type {
  DashboardMetricCatalog,
  MetricCatalogDocument,
  MetricCatalogRepository,
  MetricDefinition,
} from '../domain/ports.js';

const metricDefinitionSchema = z.object({
  key: z.string().min(1),
  display_name: z.string().min(1),
  subject: z.string().min(1),
  numerator: z.string().min(1),
  denominator: z.string().nullable(),
  time_basis: z.string().min(1),
  excluded_states: z.array(z.string()),
  drilldown_key: z.string().min(1),
});

const dashboardSchema = z.object({
  display_name: z.string().min(1),
  table_key: z.string().optional(),
  metrics: z.array(metricDefinitionSchema).min(1),
});

const catalogSchema = z.object({
  version: z.string().min(1),
  timezone: z.string().min(1),
  tiny_cohort_threshold: z.number().int().positive(),
  refresh_schedule_minutes: z.number().int().positive(),
  dashboards: z.record(z.enum(DASHBOARD_KEYS), dashboardSchema),
});

const defaultCatalogPath = new URL('../../../../config/reporting/metrics.v1.yaml', import.meta.url);

function mapMetricDefinition(raw: z.infer<typeof metricDefinitionSchema>): MetricDefinition {
  return {
    key: raw.key,
    displayName: raw.display_name,
    subject: raw.subject,
    numerator: raw.numerator,
    denominator: raw.denominator,
    timeBasis: raw.time_basis,
    excludedStates: raw.excluded_states,
    drilldownKey: raw.drilldown_key,
  };
}

function mapDashboard(
  key: DashboardKey,
  raw: z.infer<typeof dashboardSchema>,
): DashboardMetricCatalog {
  return {
    dashboardKey: key,
    displayName: raw.display_name,
    tableKey: (raw.table_key as DashboardMetricCatalog['tableKey']) ?? null,
    metrics: raw.metrics.map(mapMetricDefinition),
  };
}

export class FileMetricCatalogRepository implements MetricCatalogRepository {
  constructor(private readonly catalogPath: URL = defaultCatalogPath) {}

  async load(): Promise<MetricCatalogDocument> {
    const text = await readFile(this.catalogPath, 'utf8');
    const parsed = catalogSchema.parse(parseYaml(text));
    const dashboards = Object.fromEntries(
      DASHBOARD_KEYS.map((key) => [key, mapDashboard(key, parsed.dashboards[key])]),
    ) as Record<DashboardKey, DashboardMetricCatalog>;

    return {
      version: parsed.version,
      timezone: parsed.timezone,
      tinyCohortThreshold: parsed.tiny_cohort_threshold,
      refreshScheduleMinutes: parsed.refresh_schedule_minutes,
      dashboards,
    };
  }
}

export class MetricCatalogService {
  private cache: MetricCatalogDocument | null = null;

  constructor(private readonly repository: MetricCatalogRepository) {}

  async loadCatalog(): Promise<MetricCatalogDocument> {
    if (this.cache === null) {
      this.cache = await this.repository.load();
    }
    return this.cache;
  }

  async listDashboards(): Promise<readonly DashboardMetricCatalog[]> {
    const catalog = await this.loadCatalog();
    return DASHBOARD_KEYS.map((key) => catalog.dashboards[key]);
  }

  async getDashboard(dashboardKey: DashboardKey): Promise<DashboardMetricCatalog> {
    const catalog = await this.loadCatalog();
    return catalog.dashboards[dashboardKey];
  }

  async getMetricDefinition(
    dashboardKey: DashboardKey,
    metricKey: string,
  ): Promise<MetricDefinition | null> {
    const dashboard = await this.getDashboard(dashboardKey);
    return dashboard.metrics.find((metric) => metric.key === metricKey) ?? null;
  }
}
