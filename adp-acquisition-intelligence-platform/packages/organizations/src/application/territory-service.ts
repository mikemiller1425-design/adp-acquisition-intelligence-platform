import { AppError } from '@adp/platform';

import type { AccountAssignmentRepository, TerritoryRepository } from '../domain/ports.js';
import type { AccountAssignment, Territory } from '../domain/types.js';

function notFound(resource: string, id: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message: `${resource} not found`, details: { id } });
}

function assertWindow(effectiveFrom: Date, effectiveTo: Date | null): void {
  if (effectiveTo !== null && effectiveTo <= effectiveFrom) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'effectiveTo must be after effectiveFrom',
      details: { effectiveFrom, effectiveTo },
    });
  }
}

export class TerritoryService {
  constructor(private readonly territories: TerritoryRepository) {}

  async create(input: Parameters<TerritoryRepository['create']>[0]): Promise<Territory> {
    if (input.code.trim().length === 0 || input.name.trim().length === 0) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Territory code and name are required',
      });
    }
    return this.territories.create(input);
  }

  async archive(command: {
    territoryId: string;
    updatedByUserId: string | null;
    at?: Date;
  }): Promise<Territory> {
    const territory = await this.territories.findById(command.territoryId);
    if (territory === null) throw notFound('Territory', command.territoryId);
    if (territory.status === 'retired') return territory;

    const archived = await this.territories.archive(
      command.territoryId,
      command.updatedByUserId,
      command.at ?? new Date(),
    );
    if (archived === null) throw notFound('Territory', command.territoryId);
    return archived;
  }
}

export class AccountAssignmentService {
  constructor(
    private readonly assignments: AccountAssignmentRepository,
    private readonly territories: TerritoryRepository,
  ) {}

  async assign(command: {
    organizationId: string;
    userId: string;
    territoryId: string;
    assignmentRole?: string;
    effectiveFrom?: Date;
    assignedByUserId: string | null;
    reasonCode?: string | null;
    reasonNote?: string | null;
  }): Promise<AccountAssignment> {
    const role = command.assignmentRole ?? 'owner';
    const territory = await this.territories.findById(command.territoryId);
    if (territory === null) throw notFound('Territory', command.territoryId);
    if (territory.status === 'retired') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Cannot assign a retired territory',
        details: { territoryId: command.territoryId },
      });
    }

    const effectiveFrom = command.effectiveFrom ?? new Date();
    const current = await this.assignments.findCurrent(command.organizationId, role);
    if (
      current !== null &&
      current.userId === command.userId &&
      current.territoryId === command.territoryId
    ) {
      return current;
    }
    if (current !== null) {
      assertWindow(current.effectiveFrom, effectiveFrom);
      await this.assignments.closeCurrent(command.organizationId, role, effectiveFrom);
    }

    return this.assignments.create({
      organizationId: command.organizationId,
      userId: command.userId,
      territoryId: command.territoryId,
      assignmentRole: role,
      effectiveFrom,
      assignedByUserId: command.assignedByUserId,
      reasonCode: command.reasonCode ?? null,
      reasonNote: command.reasonNote ?? null,
    });
  }
}
