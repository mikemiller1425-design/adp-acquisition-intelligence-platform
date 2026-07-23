import { AppError } from '@adp/platform';

import {
  DEFAULT_CLASSIFICATION_NOTICE,
  DEFAULT_EXPORT_EXPIRY_DAYS,
  DEFAULT_SYNC_EXPORT_ROW_THRESHOLD,
  redactChannelValue,
  resolveTableViewKey,
  type ChannelPermissionState,
  type DashboardFilters,
  type DashboardKey,
  type ExportDownloadMetadata,
  type RedactedField,
  type ReportingAuthorizationScope,
  type TableSort,
  type TableViewKey,
} from '../domain/reporting.js';
import type {
  DashboardQueryRepository,
  ExportArtifactPort,
  ExportJobRepository,
  ReportingAuditPort,
  ReportingOutboxPort,
} from '../domain/ports.js';

const CHANNEL_FIELDS = new Set(['email', 'phone', 'linkedin', 'channel_email', 'channel_phone']);

export type ExportRowRedactionInput = {
  row: Record<string, unknown>;
  permissionByField: Record<string, ChannelPermissionState>;
};

export function applyExportRedaction(input: ExportRowRedactionInput): {
  row: Record<string, unknown>;
  redactions: RedactedField[];
} {
  const redactions: RedactedField[] = [];
  const row = { ...input.row };

  for (const [field, permissionState] of Object.entries(input.permissionByField)) {
    if (!CHANNEL_FIELDS.has(field)) continue;
    const raw = row[field];
    const { value, redaction } = redactChannelValue(
      typeof raw === 'string' ? raw : raw === null || raw === undefined ? null : String(raw),
      permissionState,
      field,
    );
    row[field] = value;
    if (redaction !== null) {
      redactions.push(redaction);
    }
  }

  return { row, redactions };
}

export class ExportService {
  constructor(
    private readonly jobs: ExportJobRepository,
    private readonly queries: DashboardQueryRepository,
    private readonly artifacts: ExportArtifactPort,
    private readonly syncRowThreshold = DEFAULT_SYNC_EXPORT_ROW_THRESHOLD,
    private readonly expiryDays = DEFAULT_EXPORT_EXPIRY_DAYS,
    private readonly audit?: ReportingAuditPort,
    private readonly outbox?: ReportingOutboxPort,
  ) {}

  async requestExport(command: {
    requestedByUserId: string;
    dashboardKey: string;
    viewKey?: string | null;
    filters: DashboardFilters;
    columns: readonly string[];
    sort?: TableSort | null;
    scope: ReportingAuthorizationScope;
    idempotencyKey: string;
    classificationNotice?: string;
    correlationId?: string | null;
    permissionByRow?: Record<string, Record<string, ChannelPermissionState>>;
  }) {
    if (command.scope.userId !== command.requestedByUserId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Cannot request exports for another user',
      });
    }

    const existing = await this.jobs.findByIdempotencyKey(command.idempotencyKey);
    if (existing !== null) {
      return { job: existing, synchronous: existing.status === 'completed' };
    }

    const viewKey = (command.viewKey ??
      resolveTableViewKey(command.dashboardKey as DashboardKey)) as TableViewKey;
    const estimatedRows = await this.queries.estimateTableRows({
      viewKey,
      filters: command.filters,
      scope: command.scope,
    });
    const expiresAt = new Date(Date.now() + this.expiryDays * 24 * 60 * 60 * 1000);

    const job = await this.jobs.create({
      requestedByUserId: command.requestedByUserId,
      dashboardKey: command.dashboardKey,
      viewKey: command.viewKey ?? viewKey,
      idempotencyKey: command.idempotencyKey,
      filters: command.filters,
      columns: command.columns,
      sort: command.sort ?? null,
      classificationNotice: command.classificationNotice ?? DEFAULT_CLASSIFICATION_NOTICE,
      expiresAt,
    });

    await this.emitExportEvent('reporting.export_requested', job, command.correlationId);

    if (estimatedRows <= this.syncRowThreshold) {
      const completed = await this.runExport({
        jobId: job.id,
        scope: command.scope,
        permissionByRow: command.permissionByRow ?? {},
        correlationId: command.correlationId ?? null,
      });
      return { job: completed, synchronous: true };
    }

    return { job, synchronous: false };
  }

  async runExport(command: {
    jobId: string;
    scope: ReportingAuthorizationScope;
    permissionByRow?: Record<string, Record<string, ChannelPermissionState>>;
    correlationId?: string | null;
  }) {
    const job = await this.jobs.findById(command.jobId);
    if (job === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Export job not found',
        details: { id: command.jobId },
      });
    }
    if (job.status === 'expired') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Export job has expired',
        details: { id: job.id },
      });
    }

    const startedAt = new Date();
    await this.jobs.updateStatus({ id: job.id, status: 'running', startedAt });

    try {
      const viewKey = (job.viewKey ??
        resolveTableViewKey(job.dashboardKey as DashboardKey)) as TableViewKey;
      const table = await this.queries.queryTable({
        viewKey,
        filters: job.filters,
        sort: job.sort,
        pagination: { limit: 10_000, offset: 0 },
        scope: command.scope,
      });

      const redactions: RedactedField[] = [];
      const exportRows = table.rows.map((row, index) => {
        const rowKey = typeof row.id === 'string' ? row.id : String(index);
        const permissionByField = command.permissionByRow?.[rowKey] ?? {};
        const redacted = applyExportRedaction({ row, permissionByField });
        redactions.push(...redacted.redactions);
        return redacted.row;
      });

      const headers =
        job.columns.length > 0 ? job.columns : table.columns.map((column) => column.key);
      const artifact = await this.artifacts.writeCsv({
        jobId: job.id,
        headers,
        rows: exportRows,
      });

      const redactionSummary = summarizeRedactions(redactions);
      const completed = await this.jobs.updateStatus({
        id: job.id,
        status: 'completed',
        artifactRef: artifact.artifactRef,
        rowCount: exportRows.length,
        redactionSummary,
        completedAt: new Date(),
      });

      await this.emitExportEvent('reporting.export_completed', completed, command.correlationId);
      if (redactions.length > 0) {
        await this.emitExportEvent(
          'reporting.export_redaction_applied',
          completed,
          command.correlationId,
          { redactionCount: redactions.length },
        );
      }

      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      const failed = await this.jobs.updateStatus({
        id: job.id,
        status: 'failed',
        errorMessage: message,
        completedAt: new Date(),
      });
      await this.emitExportEvent('reporting.export_failed', failed, command.correlationId, {
        error: message,
      });
      throw error;
    }
  }

  async getStatus(jobId: string) {
    const job = await this.jobs.findById(jobId);
    if (job === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Export job not found',
        details: { id: jobId },
      });
    }
    return job;
  }

  async getDownloadMetadata(jobId: string): Promise<ExportDownloadMetadata> {
    const job = await this.getStatus(jobId);
    if (job.status !== 'completed') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Export is not ready for download',
        details: { status: job.status },
      });
    }
    if (job.expiresAt.getTime() <= Date.now()) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Export has expired',
        details: { id: job.id },
      });
    }

    return {
      jobId: job.id,
      generatedAt: job.completedAt?.toISOString() ?? job.updatedAt.toISOString(),
      requestedByUserId: job.requestedByUserId,
      classificationNotice: job.classificationNotice,
      filters: job.filters,
      columns: job.columns,
      rowCount: job.rowCount,
      redactionSummary: job.redactionSummary,
      artifactRef: job.artifactRef,
      expiresAt: job.expiresAt.toISOString(),
    };
  }

  async expireDueExports(referenceTime = new Date()) {
    const expired = await this.jobs.expireDue(referenceTime);
    for (const job of expired) {
      await this.emitExportEvent('reporting.export_expired', job, null);
    }
    return expired;
  }

  private async emitExportEvent(
    eventType: string,
    job: { id: string; requestedByUserId: string; dashboardKey: string },
    correlationId: string | null | undefined,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit?.append({
      actorUserId: job.requestedByUserId,
      action: eventType,
      subjectType: 'user',
      subjectId: job.requestedByUserId,
      correlationId: correlationId ?? null,
      metadata: { jobId: job.id, dashboardKey: job.dashboardKey, ...extra },
    });
    await this.outbox?.insert({
      aggregateType: 'user',
      aggregateId: job.requestedByUserId,
      eventType,
      idempotencyKey: correlationId
        ? `${correlationId}:${eventType}`
        : `${job.requestedByUserId}:${eventType}:${job.id}`,
      payload: { jobId: job.id, dashboardKey: job.dashboardKey, ...extra },
    });
  }
}

function summarizeRedactions(redactions: readonly RedactedField[]): Record<string, unknown> {
  const byReason: Record<string, number> = {};
  for (const redaction of redactions) {
    byReason[redaction.reason] = (byReason[redaction.reason] ?? 0) + 1;
  }
  return {
    totalRedactions: redactions.length,
    byReason,
  };
}
