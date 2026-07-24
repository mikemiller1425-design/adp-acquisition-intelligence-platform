'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getWebSession, roleCanAccess } from '@/lib/auth';
import { getWebResearchRuntime } from '@/lib/research-runtime';
import {
  resolveOrganizationsForSegment,
  sourcePolicySnapshot,
  type ResearchRole,
  type ResearchRunConfigInput,
  type ResearchRunMode,
} from '@adp/research';

function primaryResearchRole(): ResearchRole {
  const session = getWebSession();
  if (session.roles.includes('admin')) return 'admin';
  if (session.roles.includes('reviewer')) return 'reviewer';
  if (session.roles.includes('sales')) return 'sales';
  return 'viewer';
}

function assertRoles(required: readonly ('admin' | 'sales' | 'reviewer' | 'viewer')[]) {
  const session = getWebSession();
  if (!roleCanAccess(session.roles, required)) {
    throw new Error('Forbidden');
  }
  return session;
}

const MODES: ResearchRunMode[] = [
  'fixture',
  'dry_run',
  'archive_only',
  'archive_first_live_fallback',
  'live_official_site_only',
];

function parseMode(raw: FormDataEntryValue | null): ResearchRunMode {
  const value = String(raw ?? 'fixture');
  return (MODES.includes(value as ResearchRunMode) ? value : 'fixture') as ResearchRunMode;
}

function parseIntField(formData: FormData, key: string, fallback: number): number {
  const raw = formData.get(key);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function parseConfig(formData: FormData): ResearchRunConfigInput {
  const sourceKeysRaw = String(formData.get('sourceKeys') ?? 'organization_website_fixture');
  const sourceKeys = sourceKeysRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((k) => (k === 'archived_web_common_crawl' ? 'archived_web_fixture' : k));
  return {
    name: String(formData.get('name') ?? '').trim() || 'Untitled research run',
    objective: String(formData.get('objective') ?? '').trim() || 'Fixture pilot collection',
    mode: parseMode(formData.get('mode')),
    savedTargetSegment: String(formData.get('savedTargetSegment') ?? '').trim() || null,
    territory: String(formData.get('territory') ?? '').trim() || null,
    organizationType: String(formData.get('organizationType') ?? '').trim() || null,
    maxOrganizations: parseIntField(formData, 'maxOrganizations', 2),
    maxPagesPerOrganization: parseIntField(formData, 'maxPagesPerOrganization', 3),
    maxTotalRequests: parseIntField(formData, 'maxTotalRequests', 20),
    sourceKeys,
    archiveFirst: formData.get('archiveFirst') === 'on' || formData.get('archiveFirst') === 'true',
    liveFallback: formData.get('liveFallback') === 'on' || formData.get('liveFallback') === 'true',
    dryRun: formData.get('dryRun') === 'on' || formData.get('dryRun') === 'true',
    freshnessThresholdHours: parseIntField(formData, 'freshnessThresholdHours', 168),
  };
}

function configQueryParams(
  config: ResearchRunConfigInput,
  extra: Record<string, string>,
): URLSearchParams {
  return new URLSearchParams({
    ...extra,
    name: config.name,
    objective: config.objective,
    mode: config.mode,
    savedTargetSegment: config.savedTargetSegment ?? '',
    territory: config.territory ?? '',
    organizationType: config.organizationType ?? '',
    maxOrganizations: String(config.maxOrganizations),
    maxPagesPerOrganization: String(config.maxPagesPerOrganization),
    maxTotalRequests: String(config.maxTotalRequests),
    sourceKeys: config.sourceKeys.join(','),
    archiveFirst: config.archiveFirst ? '1' : '0',
    liveFallback: config.liveFallback ? '1' : '0',
    dryRun: config.dryRun ? '1' : '0',
    freshnessThresholdHours: String(config.freshnessThresholdHours),
  });
}

/**
 * Resolve launch targets from canonical organizations.
 * PostgreSQL: saved segment → real org UUIDs only (no synthetic IDs).
 * Memory: seed deterministic UUID orgs for the requested maxOrganizations bound.
 */
async function resolveLaunchTargets(
  config: ResearchRunConfigInput,
): Promise<
  | { ok: true; targets: Array<{ organizationId: string; canonicalDomain: string | null }> }
  | { ok: false; code: string; message: string }
> {
  const runtime = await getWebResearchRuntime();
  const segment = config.savedTargetSegment;
  if (!segment) {
    return {
      ok: false,
      code: 'target_segment_required',
      message: 'A saved target segment must be selected',
    };
  }

  if (runtime.provider === 'postgres' && runtime.database) {
    const resolved = await resolveOrganizationsForSegment(runtime.database.db, {
      segmentKey: segment,
      maxOrganizations: config.maxOrganizations,
      organizationType: config.organizationType,
      territory: config.territory,
    });
    if (!resolved.ok) {
      return { ok: false, code: resolved.code, message: resolved.message };
    }
    return {
      ok: true,
      targets: resolved.targets.map((t) => ({
        organizationId: t.organizationId,
        canonicalDomain: t.canonicalDomain,
      })),
    };
  }

  // Memory fixture path: seed deterministic UUID orgs for the requested bound.
  // Do not depend on leftover Phase 1.1 snapshot org counts (pause/resume needs ≥2).
  const fixtures = [
    { displayName: 'Acme Advisory', domain: 'acme-advisory.test' },
    { displayName: 'Beta Advisory', domain: 'beta-advisory.test' },
    { displayName: 'Gamma Advisory', domain: 'gamma-advisory.test' },
  ].slice(0, Math.max(1, config.maxOrganizations));
  const seeded: Array<{ organizationId: string; canonicalDomain: string }> = [];
  for (const f of fixtures) {
    const created = await runtime.uow.organizations.createOrganization({
      displayName: f.displayName,
      domain: f.domain,
    });
    seeded.push({ organizationId: created.id, canonicalDomain: f.domain });
  }
  if (!seeded.length) {
    return {
      ok: false,
      code: 'target_segment_empty',
      message: `Segment “${segment}” resolved to zero organizations in memory runtime`,
    };
  }
  return { ok: true, targets: seeded };
}

/**
 * Preview (intent=preview) or launch (intent=launch) a research run.
 * Sources load from canonical SourceRegistryPort (approved_sources).
 * Never enables live network — gates enforce ADP_LIVE_RESEARCH_ENABLED.
 */
export async function previewOrLaunchResearchRunAction(formData: FormData) {
  assertRoles(['admin', 'sales']);
  const intent = String(formData.get('intent') ?? 'preview');
  const config = parseConfig(formData);
  const runtime = await getWebResearchRuntime();
  const role = primaryResearchRole();
  const operatorConfirmed =
    formData.get('operatorConfirmed') === 'on' || formData.get('operatorConfirmed') === 'true';

  const loaded = await runtime.sourceRegistry.loadGates(config.sourceKeys);
  const sources = loaded.gates;

  const preview = runtime.researchRuns.preview({ role, config, sources });
  // Surface registry missing/denied as launch blockers.
  for (const key of loaded.missing) {
    preview.blockers.push({
      code: 'source_not_found',
      message: `Source ${key} is not in the approved registry`,
      sourceKey: key,
      blockerRecord: 'docs/research/APPROVED_SOURCE_REGISTRY.md',
    });
    preview.allowed = false;
  }
  for (const d of loaded.denied) {
    preview.blockers.push({
      code: d.code,
      message: `${d.sourceKey}: ${d.message}`,
      sourceKey: d.sourceKey,
      blockerRecord: 'RB-015',
    });
    preview.allowed = false;
  }

  if (intent === 'preview') {
    const params = configQueryParams(config, {
      preview: '1',
      allowed: preview.allowed ? '1' : '0',
      estimatedRequests: String(preview.estimates.estimatedRequests),
      estimatedRuntimeMinutes: String(preview.estimates.estimatedRuntimeMinutes),
      policyVersion: preview.policyVersion,
      killSwitchStatus: preview.killSwitchStatus,
      liveResearchEnabled: preview.liveResearchEnabled ? '1' : '0',
      blockers: JSON.stringify(preview.blockers),
      operatorConfirmed: operatorConfirmed ? '1' : '0',
      jobMode: runtime.jobMode,
    });
    redirect(`/research/runs/new?${params.toString()}`);
  }

  if (!preview.allowed) {
    const params = configQueryParams(config, {
      preview: '1',
      allowed: '0',
      estimatedRequests: String(preview.estimates.estimatedRequests),
      estimatedRuntimeMinutes: String(preview.estimates.estimatedRuntimeMinutes),
      policyVersion: preview.policyVersion,
      killSwitchStatus: preview.killSwitchStatus,
      liveResearchEnabled: preview.liveResearchEnabled ? '1' : '0',
      blockers: JSON.stringify(preview.blockers),
      launchBlocked: '1',
      operatorConfirmed: operatorConfirmed ? '1' : '0',
      jobMode: runtime.jobMode,
    });
    redirect(`/research/runs/new?${params.toString()}`);
  }

  if (!operatorConfirmed) {
    const params = configQueryParams(config, {
      preview: '1',
      allowed: '1',
      estimatedRequests: String(preview.estimates.estimatedRequests),
      estimatedRuntimeMinutes: String(preview.estimates.estimatedRuntimeMinutes),
      policyVersion: preview.policyVersion,
      killSwitchStatus: preview.killSwitchStatus,
      liveResearchEnabled: preview.liveResearchEnabled ? '1' : '0',
      blockers: JSON.stringify([
        {
          code: 'operator_confirmation_required',
          message: 'Confirm the bounded run configuration before launch',
        },
      ]),
      launchBlocked: '1',
      operatorConfirmed: '0',
      jobMode: runtime.jobMode,
    });
    redirect(`/research/runs/new?${params.toString()}`);
  }

  const targetResolution = await resolveLaunchTargets(config);
  if (!targetResolution.ok) {
    const params = configQueryParams(config, {
      preview: '1',
      allowed: '0',
      estimatedRequests: String(preview.estimates.estimatedRequests),
      estimatedRuntimeMinutes: String(preview.estimates.estimatedRuntimeMinutes),
      policyVersion: preview.policyVersion,
      killSwitchStatus: preview.killSwitchStatus,
      liveResearchEnabled: preview.liveResearchEnabled ? '1' : '0',
      blockers: JSON.stringify([
        { code: targetResolution.code, message: targetResolution.message },
      ]),
      launchBlocked: '1',
      operatorConfirmed: '1',
      jobMode: runtime.jobMode,
    });
    redirect(`/research/runs/new?${params.toString()}`);
  }

  // Persist exact effective source/policy snapshot into config for immutable run history.
  const configWithSnapshot: ResearchRunConfigInput & {
    sources: typeof sources;
    sourcePolicySnapshot: Record<string, unknown>;
  } = {
    ...config,
    sources,
    sourcePolicySnapshot: sourcePolicySnapshot(loaded.records),
  };

  const { run } = await runtime.researchRuns.createAndLaunch({
    role,
    config: configWithSnapshot,
    sources,
    targets: targetResolution.targets,
    idempotencyKey: `web-research-run:${crypto.randomUUID()}`,
  });

  revalidatePath('/research');
  revalidatePath('/research/runs');
  redirect(`/research/runs/${run.id}`);
}

export async function advanceResearchRunAction(formData: FormData) {
  assertRoles(['admin', 'sales']);
  const runId = String(formData.get('runId') ?? '');
  if (!runId) throw new Error('runId required');
  const runtime = await getWebResearchRuntime();
  if (runtime.jobMode === 'durable_postgres') {
    // Worker owns execution — web must not claim/process durable jobs.
    revalidatePath(`/research/runs/${runId}`);
    redirect(`/research/runs/${runId}?workerOwned=1`);
  }
  if (!runtime.deferred) {
    throw new Error('deferred_dispatcher_unavailable');
  }
  await runtime.deferred.processNextResearchExecute();
  revalidatePath(`/research/runs/${runId}`);
  revalidatePath('/research/runs');
  redirect(`/research/runs/${runId}`);
}

export async function pauseResearchRunAction(formData: FormData) {
  assertRoles(['admin', 'sales']);
  const runId = String(formData.get('runId') ?? '');
  if (!runId) throw new Error('runId required');
  const reason = String(formData.get('reason') ?? 'Paused by operator');
  const runtime = await getWebResearchRuntime();
  await runtime.researchRuns.pause(runId, primaryResearchRole(), reason);
  revalidatePath(`/research/runs/${runId}`);
  redirect(`/research/runs/${runId}`);
}

export async function resumeResearchRunAction(formData: FormData) {
  assertRoles(['admin', 'sales']);
  const runId = String(formData.get('runId') ?? '');
  if (!runId) throw new Error('runId required');
  const runtime = await getWebResearchRuntime();
  await runtime.researchRuns.resume(runId, primaryResearchRole());
  revalidatePath(`/research/runs/${runId}`);
  redirect(`/research/runs/${runId}`);
}

export async function cancelResearchRunAction(formData: FormData) {
  assertRoles(['admin', 'sales']);
  const runId = String(formData.get('runId') ?? '');
  if (!runId) throw new Error('runId required');
  const reason = String(formData.get('reason') ?? 'Cancelled by operator');
  const runtime = await getWebResearchRuntime();
  await runtime.researchRuns.cancel(runId, primaryResearchRole(), reason);
  revalidatePath(`/research/runs/${runId}`);
  revalidatePath('/research/runs');
  redirect(`/research/runs/${runId}`);
}

export async function activateResearchRunKillSwitchAction(formData: FormData) {
  assertRoles(['admin']);
  const runId = String(formData.get('runId') ?? '');
  if (!runId) throw new Error('runId required');
  const runtime = await getWebResearchRuntime();
  await runtime.researchRuns.activateKillSwitch(runId, primaryResearchRole());
  revalidatePath(`/research/runs/${runId}`);
  redirect(`/research/runs/${runId}`);
}

export async function exportResearchRunReportAction(formData: FormData) {
  assertRoles(['admin', 'sales', 'reviewer']);
  const runId = String(formData.get('runId') ?? '');
  if (!runId) throw new Error('runId required');
  redirect(`/research/runs/${runId}?export=1`);
}
