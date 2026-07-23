import { describe, expect, it } from 'vitest';

import { applyExportRedaction } from '../application/export-service.js';
import {
  FileMetricCatalogRepository,
  MetricCatalogService,
} from '../application/metric-catalog-service.js';
import { DASHBOARD_KEYS, applyRateSuppression, redactChannelValue } from '../domain/reporting.js';

describe('reporting policy', () => {
  it('suppresses rates for tiny cohorts and zero denominators', () => {
    expect(applyRateSuppression(2, 3, 5)).toEqual({
      rate: null,
      suppressed: true,
      reason: 'tiny_cohort',
    });
    expect(applyRateSuppression(4, 10, 5)).toEqual({
      rate: 0.4,
      suppressed: false,
      reason: null,
    });
    expect(applyRateSuppression(1, 0, 5)).toEqual({
      rate: null,
      suppressed: true,
      reason: 'denominator_zero',
    });
  });

  it('redacts restricted, opted-out, and unknown channel fields with explicit reasons', () => {
    expect(redactChannelValue('casey@example.com', 'restricted', 'email')).toEqual({
      value: null,
      redaction: {
        field: 'email',
        action: 'omitted',
        reason: 'channel_restricted',
        permissionState: 'restricted',
      },
    });
    expect(redactChannelValue('555-0100', 'opted_out', 'phone')).toEqual({
      value: null,
      redaction: {
        field: 'phone',
        action: 'omitted',
        reason: 'channel_opted_out',
        permissionState: 'opted_out',
      },
    });
    expect(redactChannelValue('555-0100', 'unknown', 'phone')).toEqual({
      value: null,
      redaction: {
        field: 'phone',
        action: 'omitted',
        reason: 'channel_permission_unknown',
        permissionState: 'unknown',
      },
    });
    expect(redactChannelValue('casey@example.com', 'allowed', 'email')).toEqual({
      value: 'casey@example.com',
      redaction: null,
    });
  });

  it('applies export redaction across channel columns', () => {
    const result = applyExportRedaction({
      row: {
        id: 'row-1',
        email: 'casey@example.com',
        phone: '555-0100',
        displayName: 'Casey',
      },
      permissionByField: {
        email: 'restricted',
        phone: 'opted_out',
      },
    });

    expect(result.row.email).toBeNull();
    expect(result.row.phone).toBeNull();
    expect(result.row.displayName).toBe('Casey');
    expect(result.redactions).toHaveLength(2);
  });

  it('loads D1–D8 metric definitions from config YAML', async () => {
    const service = new MetricCatalogService(new FileMetricCatalogRepository());
    const catalog = await service.loadCatalog();

    expect(catalog.version).toBe('1.0.0');
    expect(catalog.tinyCohortThreshold).toBe(5);
    expect(catalog.timezone).toBe('America/New_York');

    for (const dashboardKey of DASHBOARD_KEYS) {
      const dashboard = catalog.dashboards[dashboardKey];
      expect(dashboard.metrics.length).toBeGreaterThan(0);
      for (const metric of dashboard.metrics) {
        expect(metric.numerator.length).toBeGreaterThan(0);
        expect(metric.drilldownKey.length).toBeGreaterThan(0);
        expect(metric.timeBasis.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps parallel operational dimensions independent in filter payloads', () => {
    const filters = {
      prospectStage: 'qualified',
      researchStatus: 'gaps_open',
      outreachStatus: 'active',
      dataFreshnessStatus: 'stale',
      opportunityStage: 'open',
    };

    expect(filters.prospectStage).not.toBe(filters.researchStatus);
    expect(filters.outreachStatus).not.toBe(filters.dataFreshnessStatus);
    expect(Object.keys(filters)).toEqual([
      'prospectStage',
      'researchStatus',
      'outreachStatus',
      'dataFreshnessStatus',
      'opportunityStage',
    ]);
  });
});
