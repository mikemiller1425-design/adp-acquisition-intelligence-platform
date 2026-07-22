import { AppError } from '@adp/platform';

export type MergeEntitySnapshot = {
  organizationId: string;
  recordVersion: number;
  existingRelationshipFlag: boolean;
  childCounts: {
    contacts: number;
    locations: number;
    evidence: number;
    variableValues: number;
    consentRecords: number;
  };
};

export type MergeRelationshipConflict = {
  type: 'existing_relationship' | 'self_merge' | 'cycle' | 'relationship_conflict';
  organizationId: string;
  explanation: string;
};

export type MergePlan = {
  survivorOrganizationId: string;
  duplicateOrganizationIds: string[];
  childReassignments: Array<{
    childType: keyof MergeEntitySnapshot['childCounts'];
    fromOrganizationId: string;
    toOrganizationId: string;
    count: number;
  }>;
  conflicts: MergeRelationshipConflict[];
  idempotencyKey: string;
};

export function planOrganizationMerge(input: {
  survivorOrganizationId: string;
  duplicateOrganizationIds: readonly string[];
  snapshots: readonly MergeEntitySnapshot[];
  priorMergeEdges?: readonly { fromOrganizationId: string; toOrganizationId: string }[];
  idempotencyKey: string;
}): MergePlan {
  const duplicateIds = [...new Set(input.duplicateOrganizationIds)];
  if (duplicateIds.includes(input.survivorOrganizationId)) {
    throw mergeError('Organization merge cannot merge an organization into itself', {
      survivorOrganizationId: input.survivorOrganizationId,
    });
  }
  const snapshotById = new Map(input.snapshots.map((snapshot) => [snapshot.organizationId, snapshot]));
  const missing = [input.survivorOrganizationId, ...duplicateIds].filter((id) => !snapshotById.has(id));
  if (missing.length > 0) {
    throw mergeError('Organization merge snapshot is missing an organization', { missing });
  }
  const cycle = duplicateIds.find((id) => createsCycle(id, input.survivorOrganizationId, input.priorMergeEdges ?? []));
  if (cycle !== undefined) {
    throw mergeError('Organization merge would create a cycle', {
      fromOrganizationId: cycle,
      toOrganizationId: input.survivorOrganizationId,
    });
  }

  const conflicts: MergeRelationshipConflict[] = [];
  const survivor = snapshotById.get(input.survivorOrganizationId);
  if (survivor?.existingRelationshipFlag === true) {
    for (const duplicateId of duplicateIds) {
      const duplicate = snapshotById.get(duplicateId);
      if (duplicate?.existingRelationshipFlag === true) {
        conflicts.push({
          type: 'existing_relationship',
          organizationId: duplicateId,
          explanation: 'Both survivor and duplicate have existing-relationship flags',
        });
      }
    }
  }

  const childReassignments = duplicateIds.flatMap((duplicateId) => {
    const snapshot = snapshotById.get(duplicateId);
    if (snapshot === undefined) return [];
    return Object.entries(snapshot.childCounts)
      .filter(([, count]) => count > 0)
      .map(([childType, count]) => ({
        childType: childType as keyof MergeEntitySnapshot['childCounts'],
        fromOrganizationId: duplicateId,
        toOrganizationId: input.survivorOrganizationId,
        count,
      }));
  });

  return {
    survivorOrganizationId: input.survivorOrganizationId,
    duplicateOrganizationIds: duplicateIds,
    childReassignments,
    conflicts,
    idempotencyKey: input.idempotencyKey,
  };
}

function createsCycle(
  fromOrganizationId: string,
  toOrganizationId: string,
  edges: readonly { fromOrganizationId: string; toOrganizationId: string }[],
): boolean {
  const nextByFrom = new Map(edges.map((edge) => [edge.fromOrganizationId, edge.toOrganizationId]));
  let cursor: string | undefined = toOrganizationId;
  while (cursor !== undefined) {
    if (cursor === fromOrganizationId) return true;
    cursor = nextByFrom.get(cursor);
  }
  return false;
}

function mergeError(message: string, details: Record<string, unknown>): AppError {
  return new AppError({ code: 'CONFLICT', message, details });
}
