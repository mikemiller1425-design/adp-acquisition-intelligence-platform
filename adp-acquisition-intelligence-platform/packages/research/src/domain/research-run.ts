/**
 * Phase 1.2 research run lifecycle state machine.
 * Guarding is fail-closed: unknown transitions are rejected.
 */

export type ResearchRunStatus =
  | 'draft'
  | 'validating'
  | 'awaiting_approval'
  | 'queued'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'completed'
  | 'blocked'
  | 'cancelled'
  | 'failed';

export type ResearchRunMode =
  | 'fixture'
  | 'dry_run'
  | 'archive_only'
  | 'archive_first_live_fallback'
  | 'live_official_site_only';

const TRANSITIONS: Record<ResearchRunStatus, readonly ResearchRunStatus[]> = {
  draft: ['validating', 'cancelled', 'blocked'],
  validating: ['awaiting_approval', 'queued', 'blocked', 'failed', 'cancelled'],
  awaiting_approval: ['queued', 'blocked', 'cancelled'],
  queued: ['running', 'cancelled', 'blocked'],
  running: ['pausing', 'completed', 'failed', 'cancelled', 'blocked'],
  pausing: ['paused', 'running', 'cancelled', 'failed'],
  paused: ['queued', 'running', 'cancelled'],
  completed: [],
  blocked: [],
  cancelled: [],
  failed: [],
};

export function canTransitionResearchRun(from: ResearchRunStatus, to: ResearchRunStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransitionResearchRun(from: ResearchRunStatus, to: ResearchRunStatus): void {
  if (!canTransitionResearchRun(from, to)) {
    throw new Error(`invalid_research_run_transition:${from}->${to}`);
  }
}

export function isTerminalResearchRunStatus(status: ResearchRunStatus): boolean {
  return (
    status === 'completed' || status === 'blocked' || status === 'cancelled' || status === 'failed'
  );
}

export function defaultModeForAdapters(input: {
  commonCrawlApprovedEnabled: boolean;
}): ResearchRunMode {
  return input.commonCrawlApprovedEnabled ? 'archive_only' : 'fixture';
}

export type ResearchRunConfigInput = {
  name: string;
  objective: string;
  mode: ResearchRunMode;
  savedTargetSegment: string | null;
  territory: string | null;
  organizationType: string | null;
  maxOrganizations: number;
  maxPagesPerOrganization: number;
  maxTotalRequests: number;
  sourceKeys: string[];
  archiveFirst: boolean;
  liveFallback: boolean;
  dryRun: boolean;
  freshnessThresholdHours: number;
};

export function estimateResearchRun(config: ResearchRunConfigInput): {
  estimatedRequests: number;
  estimatedRuntimeMinutes: number;
} {
  const orgs = Math.max(0, config.maxOrganizations);
  const pages = Math.max(0, config.maxPagesPerOrganization);
  const estimatedRequests = Math.min(config.maxTotalRequests || orgs * pages, orgs * pages);
  const estimatedRuntimeMinutes = Math.max(1, Math.ceil(estimatedRequests / 30));
  return { estimatedRequests, estimatedRuntimeMinutes };
}
