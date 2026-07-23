import { AppError } from '@adp/platform';

import { actorCanManageViews } from '../domain/reporting.js';
import type {
  DashboardFilters,
  ReportingAuthorizationScope,
  TableSort,
} from '../domain/reporting.js';
import type {
  ReportingAuditPort,
  ReportingOutboxPort,
  SavedViewRepository,
} from '../domain/ports.js';

function forbidden(action: string): AppError {
  return new AppError({
    code: 'FORBIDDEN',
    message: `Not authorized to ${action}`,
  });
}

export class SavedViewService {
  constructor(
    private readonly views: SavedViewRepository,
    private readonly audit?: ReportingAuditPort,
    private readonly outbox?: ReportingOutboxPort,
  ) {}

  async create(command: {
    ownerUserId: string;
    dashboardKey: string;
    viewKey?: string | null;
    name: string;
    filters: DashboardFilters;
    columns: readonly string[];
    sort?: TableSort | null;
    isDefault?: boolean;
    scope: ReportingAuthorizationScope;
    correlationId?: string | null;
  }) {
    if (command.scope.userId !== command.ownerUserId && !command.scope.roles.includes('admin')) {
      throw forbidden('create saved views for another user');
    }

    const saved = await this.views.create({
      ownerUserId: command.ownerUserId,
      dashboardKey: command.dashboardKey,
      viewKey: command.viewKey ?? null,
      name: command.name,
      filters: command.filters,
      columns: command.columns,
      sort: command.sort ?? null,
      isDefault: command.isDefault ?? false,
    });

    await this.emitLifecycle('reporting.saved_view_created', command.ownerUserId, saved.id, {
      dashboardKey: saved.dashboardKey,
      name: saved.name,
      correlationId: command.correlationId,
    });

    return saved;
  }

  async update(command: {
    id: string;
    scope: ReportingAuthorizationScope;
    name?: string;
    filters?: DashboardFilters;
    columns?: readonly string[];
    sort?: TableSort | null;
    isDefault?: boolean;
    correlationId?: string | null;
  }) {
    const existing = await this.views.findById(command.id);
    if (existing === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Saved view not found',
        details: { id: command.id },
      });
    }
    if (!actorCanManageViews(command.scope, existing.ownerUserId)) {
      throw forbidden('update this saved view');
    }

    const saved = await this.views.update({
      id: command.id,
      ownerUserId: existing.ownerUserId,
      ...(command.name !== undefined ? { name: command.name } : {}),
      ...(command.filters !== undefined ? { filters: command.filters } : {}),
      ...(command.columns !== undefined ? { columns: command.columns } : {}),
      ...(command.sort !== undefined ? { sort: command.sort } : {}),
      ...(command.isDefault !== undefined ? { isDefault: command.isDefault } : {}),
    });

    await this.emitLifecycle('reporting.saved_view_updated', existing.ownerUserId, saved.id, {
      dashboardKey: saved.dashboardKey,
      correlationId: command.correlationId,
    });

    return saved;
  }

  async delete(command: {
    id: string;
    scope: ReportingAuthorizationScope;
    correlationId?: string | null;
  }) {
    const existing = await this.views.findById(command.id);
    if (existing === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Saved view not found',
        details: { id: command.id },
      });
    }
    if (!actorCanManageViews(command.scope, existing.ownerUserId)) {
      throw forbidden('delete this saved view');
    }

    await this.views.delete({ id: command.id, ownerUserId: existing.ownerUserId });
    await this.emitLifecycle('reporting.saved_view_deleted', existing.ownerUserId, command.id, {
      dashboardKey: existing.dashboardKey,
      correlationId: command.correlationId,
    });
  }

  async list(command: { ownerUserId: string; dashboardKey?: string }) {
    return this.views.listByOwner(command.ownerUserId, command.dashboardKey);
  }

  async restore(command: { id: string; scope: ReportingAuthorizationScope }) {
    const saved = await this.views.findById(command.id);
    if (saved === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Saved view not found',
        details: { id: command.id },
      });
    }
    if (!actorCanManageViews(command.scope, saved.ownerUserId)) {
      throw forbidden('restore this saved view');
    }

    return {
      id: saved.id,
      dashboardKey: saved.dashboardKey,
      viewKey: saved.viewKey,
      filters: saved.filters,
      columns: saved.columns,
      sort: saved.sort,
      name: saved.name,
    };
  }

  private async emitLifecycle(
    eventType: string,
    ownerUserId: string,
    viewId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const correlationId =
      typeof metadata.correlationId === 'string' ? metadata.correlationId : null;

    await this.audit?.append({
      actorUserId: ownerUserId,
      action: eventType,
      subjectType: 'user',
      subjectId: ownerUserId,
      correlationId,
      metadata: { viewId, ...metadata },
    });
    await this.outbox?.insert({
      aggregateType: 'user',
      aggregateId: ownerUserId,
      eventType,
      idempotencyKey: correlationId
        ? `${correlationId}:${eventType}`
        : `${ownerUserId}:${eventType}:${viewId}`,
      payload: { viewId, ...metadata },
    });
  }
}
