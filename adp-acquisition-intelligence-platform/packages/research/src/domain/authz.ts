export type ResearchCapability =
  | 'population_source:view'
  | 'population_import:create'
  | 'entity_resolution:resolve'
  | 'entity_resolution:review'
  | 'research_priority:view'
  | 'collection_run:create'
  | 'collection_run:cancel'
  | 'collection_job:retry'
  | 'snapshot:view'
  | 'claim:view'
  | 'claim:accept'
  | 'claim:correct'
  | 'claim:reject'
  | 'approved_source:administer'
  | 'approved_source:enable_suspend'
  | 'kill_switch:operate'
  | 'source_policy:view';

export type ResearchRole = 'admin' | 'sales' | 'reviewer' | 'viewer' | 'ops';

const ROLE_CAPS: Record<ResearchRole, readonly ResearchCapability[]> = {
  admin: [
    'population_source:view',
    'population_import:create',
    'entity_resolution:resolve',
    'entity_resolution:review',
    'research_priority:view',
    'collection_run:create',
    'collection_run:cancel',
    'collection_job:retry',
    'snapshot:view',
    'claim:view',
    'claim:accept',
    'claim:correct',
    'claim:reject',
    'approved_source:administer',
    'approved_source:enable_suspend',
    'kill_switch:operate',
    'source_policy:view',
  ],
  ops: [
    'population_source:view',
    'population_import:create',
    'entity_resolution:resolve',
    'research_priority:view',
    'collection_run:create',
    'collection_run:cancel',
    'collection_job:retry',
    'snapshot:view',
    'claim:view',
    'approved_source:enable_suspend',
    'kill_switch:operate',
    'source_policy:view',
  ],
  reviewer: [
    'population_source:view',
    'entity_resolution:review',
    'research_priority:view',
    'snapshot:view',
    'claim:view',
    'claim:accept',
    'claim:correct',
    'claim:reject',
    'source_policy:view',
  ],
  sales: [
    'population_source:view',
    'research_priority:view',
    'collection_run:create',
    'claim:view',
    'snapshot:view',
  ],
  viewer: ['population_source:view', 'research_priority:view', 'claim:view', 'source_policy:view'],
};

export class AllowListResearchCapabilityChecker {
  constructor(private readonly role: ResearchRole) {}

  can(capability: ResearchCapability): boolean {
    return ROLE_CAPS[this.role].includes(capability);
  }

  assert(capability: ResearchCapability): void {
    if (!this.can(capability)) {
      throw new Error(`Forbidden: missing capability ${capability}`);
    }
  }
}
