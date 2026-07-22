import { AppError } from '@adp/platform';

import type { CapabilityChecker } from './ports.js';
import type { CollectionCapability, CollectionRole } from './types.js';

const roleCapabilities: Record<CollectionRole, ReadonlySet<CollectionCapability>> = {
  admin: new Set<CollectionCapability>([
    'manual_entry:create',
    'import:upload',
    'import:map',
    'import:validate',
    'import:dry_run',
    'duplicate:review',
    'import:commit',
    'import:reverse',
    'import:report',
    'merge:preview',
    'merge:approve',
    'merge:reverse',
  ]),
  researcher: new Set<CollectionCapability>([
    'manual_entry:create',
    'import:upload',
    'import:map',
    'import:validate',
    'import:dry_run',
    'import:report',
    'merge:preview',
  ]),
  sales: new Set<CollectionCapability>([
    'manual_entry:create',
    'import:upload',
    'import:report',
  ]),
  reviewer: new Set<CollectionCapability>([
    'duplicate:review',
    'import:commit',
    'import:report',
    'merge:preview',
    'merge:approve',
  ]),
};

export class AllowListCollectionCapabilityChecker implements CapabilityChecker {
  assertCan(
    actor: { roles: readonly CollectionRole[] },
    capability: CollectionCapability,
  ): void {
    if (actor.roles.some((role) => roleCapabilities[role].has(capability))) return;
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Actor is not authorized for collection capability',
      details: { capability, roles: actor.roles },
    });
  }
}
