import { canExecuteApprovedSource, type ApprovedSourceGate } from './approved-source.js';
import type { ResearchCapability, ResearchRole } from './authz.js';
import { AllowListResearchCapabilityChecker } from './authz.js';
import type { ResearchRunConfigInput, ResearchRunMode } from './research-run.js';
import { estimateResearchRun } from './research-run.js';

export type LaunchBlocker = {
  code: string;
  message: string;
  blockerRecord?: string;
  /** Relative docs path or blocker id for UI deep-link. */
  href?: string;
  sourceKey?: string;
};

const BLOCKER_HREFS: Record<string, string> = {
  'RB-015': '/docs/release/PHASE1_RELEASE_BLOCKERS.md#rb-015',
  'RB-014': '/docs/release/PHASE1_RELEASE_BLOCKERS.md#rb-014',
  'docs/research/RESEARCH_RUN_SAFETY_CONTROLS.md': '/docs/research/RESEARCH_RUN_SAFETY_CONTROLS.md',
  'docs/research/APPROVED_SOURCE_REGISTRY.md': '/docs/research/APPROVED_SOURCE_REGISTRY.md',
};

export function blockerHref(blockerRecord?: string): string | undefined {
  if (!blockerRecord) return undefined;
  return BLOCKER_HREFS[blockerRecord] ?? `/docs/release/PHASE1_RELEASE_BLOCKERS.md`;
}

function pushBlocker(
  blockers: LaunchBlocker[],
  blocker: Omit<LaunchBlocker, 'href'> & { href?: string },
): void {
  const resolved = blocker.href ?? blockerHref(blocker.blockerRecord);
  const next: LaunchBlocker = {
    code: blocker.code,
    message: blocker.message,
  };
  if (blocker.blockerRecord) next.blockerRecord = blocker.blockerRecord;
  if (blocker.sourceKey) next.sourceKey = blocker.sourceKey;
  if (resolved) next.href = resolved;
  blockers.push(next);
}

export type SourceGateInput = ApprovedSourceGate & {
  sourceKey: string;
  adapterType: string;
  lifecycle: ApprovedSourceGate['lifecycle'];
};

export type LaunchGateContext = {
  role: ResearchRole;
  config: ResearchRunConfigInput;
  sources: SourceGateInput[];
  /** Deployment capability — defaults false. */
  liveResearchEnabled: boolean;
  globalKillSwitchActive: boolean;
  /** Per-source kill already reflected on source records; also accept global. */
  requiredCapability?: ResearchCapability;
};

const LIVE_MODES: ResearchRunMode[] = ['archive_first_live_fallback', 'live_official_site_only'];
const ARCHIVE_MODES: ResearchRunMode[] = ['archive_only', 'archive_first_live_fallback'];

export function evaluateLaunchGates(ctx: LaunchGateContext): {
  allowed: boolean;
  blockers: LaunchBlocker[];
  estimates: ReturnType<typeof estimateResearchRun>;
} {
  const blockers: LaunchBlocker[] = [];
  const authz = new AllowListResearchCapabilityChecker(ctx.role);
  if (!authz.can('research_run:launch')) {
    pushBlocker(blockers, {
      code: 'capability_denied',
      message: 'User lacks research_run:launch capability',
      blockerRecord: 'docs/research/RESEARCH_RUN_SAFETY_CONTROLS.md',
    });
  }

  if (!ctx.config.savedTargetSegment) {
    pushBlocker(blockers, {
      code: 'target_segment_required',
      message: 'A saved target segment must be selected',
    });
  }
  if (
    !ctx.config.maxOrganizations ||
    !ctx.config.maxPagesPerOrganization ||
    !ctx.config.maxTotalRequests
  ) {
    pushBlocker(blockers, {
      code: 'limits_required',
      message: 'Maximum organizations, pages per organization, and total requests are required',
    });
  }
  if (!ctx.config.sourceKeys.length) {
    pushBlocker(blockers, {
      code: 'source_required',
      message: 'At least one source must be selected',
    });
  }

  if (ctx.globalKillSwitchActive) {
    pushBlocker(blockers, {
      code: 'global_kill_switch',
      message: 'Global live-collection kill switch is active',
      blockerRecord: 'RB-015',
    });
  }

  const needsLive = LIVE_MODES.includes(ctx.config.mode) || ctx.config.liveFallback;
  const needsArchive = ARCHIVE_MODES.includes(ctx.config.mode) || ctx.config.archiveFirst;

  if ((needsLive || needsArchive) && !ctx.liveResearchEnabled) {
    pushBlocker(blockers, {
      code: 'live_research_disabled',
      message:
        'ADP_LIVE_RESEARCH_ENABLED is false — live/archive network retrieval is disabled by deployment gate',
      blockerRecord: 'RB-015',
    });
  }

  for (const key of ctx.config.sourceKeys) {
    const source = ctx.sources.find((s) => s.sourceKey === key);
    if (!source) {
      pushBlocker(blockers, {
        code: 'source_not_found',
        message: `Source ${key} is not in the approved registry`,
        sourceKey: key,
        blockerRecord: 'docs/research/APPROVED_SOURCE_REGISTRY.md',
      });
      continue;
    }
    const decision = canExecuteApprovedSource(source);
    if (!decision.allowed) {
      const blocker: LaunchBlocker = {
        code: decision.code,
        message: `${key}: ${decision.message}`,
        sourceKey: key,
      };
      if (decision.code.includes('not_approved') || decision.code === 'lifecycle_not_enabled') {
        blocker.blockerRecord = 'RB-015';
      }
      pushBlocker(blockers, blocker);
    }
    if (source.killSwitchActive) {
      pushBlocker(blockers, {
        code: 'source_kill_switch',
        message: `Kill switch active for ${key}`,
        sourceKey: key,
        blockerRecord: 'RB-015',
      });
    }
    const isLiveAdapter = source.adapterType === 'organization_website';
    const isArchiveAdapter = source.adapterType === 'archived_web';
    if (isLiveAdapter && needsLive && !ctx.liveResearchEnabled) {
      pushBlocker(blockers, {
        code: 'live_adapter_gated',
        message: `Live adapter ${key} blocked by ADP_LIVE_RESEARCH_ENABLED=false`,
        sourceKey: key,
        blockerRecord: 'RB-015',
      });
    }
    if (isArchiveAdapter && needsArchive && source.lifecycle !== 'enabled') {
      pushBlocker(blockers, {
        code: 'archive_not_enabled',
        message: `Archive adapter ${key} is not enabled (RB-015)`,
        sourceKey: key,
        blockerRecord: 'RB-015',
      });
    }
  }

  // Fixture / dry_run modes may proceed when only fixture sources are selected and enabled.
  if (ctx.config.mode === 'fixture' || ctx.config.mode === 'dry_run') {
    const nonFixtureBlocks = blockers.filter(
      (b) =>
        b.code !== 'live_research_disabled' &&
        b.code !== 'live_adapter_gated' &&
        b.code !== 'archive_not_enabled',
    );
    // Keep non-live blockers; drop live/archive deployment blockers for fixture mode
    // unless a non-fixture source was selected.
    const selectedNonFixture = ctx.config.sourceKeys.some((key) => {
      const s = ctx.sources.find((x) => x.sourceKey === key);
      return s && s.adapterType !== 'fixture';
    });
    if (!selectedNonFixture) {
      return {
        allowed: nonFixtureBlocks.length === 0,
        blockers: nonFixtureBlocks,
        estimates: estimateResearchRun(ctx.config),
      };
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    estimates: estimateResearchRun(ctx.config),
  };
}

/** Dual gate checked again immediately before any network access. */
export function assertNetworkRetrievalPermitted(input: {
  liveResearchEnabled: boolean;
  source: SourceGateInput;
  globalKillSwitchActive: boolean;
  runKillSwitchActive: boolean;
  mode: ResearchRunMode;
}): void {
  if (input.globalKillSwitchActive || input.runKillSwitchActive || input.source.killSwitchActive) {
    throw new Error('kill_switch_active');
  }
  const decision = canExecuteApprovedSource(input.source);
  if (!decision.allowed) {
    throw new Error(decision.code);
  }
  const needsNetwork =
    input.source.adapterType === 'organization_website' ||
    input.source.adapterType === 'archived_web';
  if (needsNetwork && !input.liveResearchEnabled) {
    throw new Error('live_research_disabled');
  }
  if (input.mode === 'fixture' || input.mode === 'dry_run') {
    if (needsNetwork) throw new Error('network_forbidden_in_mode');
  }
}
