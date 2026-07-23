'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getWebSession, roleCanAccess } from '@/lib/auth';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';
import {
  getFixtureApprovedSource,
  type ResearchRole,
  type ResearchRunConfigInput,
  type ResearchRunMode,
  type SourceGateInput,
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
    .filter(Boolean);
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

function fixtureSourcesFor(config: ResearchRunConfigInput): SourceGateInput[] {
  const fixture = getFixtureApprovedSource();
  return config.sourceKeys.map((sourceKey) => {
    if (sourceKey === fixture.sourceKey) {
      return {
        sourceKey: fixture.sourceKey,
        adapterType: fixture.adapterType,
        lifecycle: fixture.lifecycle,
        killSwitchActive: fixture.killSwitchActive,
        termsReviewStatus: fixture.termsReviewStatus,
        privacyReviewStatus: fixture.privacyReviewStatus,
        legalReviewStatus: fixture.legalReviewStatus,
        securityReviewStatus: fixture.securityReviewStatus,
      };
    }
    // Unknown / non-fixture sources stay fail-closed (draft + pending reviews).
    return {
      sourceKey,
      adapterType: sourceKey.includes('archive') ? 'archived_web' : 'organization_website',
      lifecycle: 'draft',
      killSwitchActive: true,
      termsReviewStatus: 'pending',
      privacyReviewStatus: 'pending',
      legalReviewStatus: 'pending',
      securityReviewStatus: 'pending',
    };
  });
}

async function resolveLaunchTargets(maxOrganizations: number) {
  const snapshot = await getResearchWorkflowSnapshot();
  const fromSnapshot = snapshot.organizations.slice(0, maxOrganizations).map((o) => ({
    organizationId: o.organizationId,
    canonicalDomain: (o.domain ?? 'acme-advisory.test').replace(/^www\./, ''),
  }));
  if (fromSnapshot.length >= Math.min(2, maxOrganizations)) return fromSnapshot;

  const defaults = [
    { organizationId: 'org-fixture-acme', canonicalDomain: 'acme-advisory.test' },
    { organizationId: 'org-fixture-beta', canonicalDomain: 'beta-advisory.test' },
  ];
  return defaults.slice(0, Math.max(1, maxOrganizations));
}

/**
 * Preview (intent=preview) or launch (intent=launch) a research run.
 * Never enables live network — gates enforce ADP_LIVE_RESEARCH_ENABLED.
 */
export async function previewOrLaunchResearchRunAction(formData: FormData) {
  assertRoles(['admin', 'sales']);
  const intent = String(formData.get('intent') ?? 'preview');
  const config = parseConfig(formData);
  const runtime = await getWebResearchRuntime();
  const role = primaryResearchRole();
  const sources = fixtureSourcesFor(config);

  const preview = runtime.researchRuns.preview({ role, config, sources });

  if (intent === 'preview') {
    const params = new URLSearchParams({
      preview: '1',
      allowed: preview.allowed ? '1' : '0',
      estimatedRequests: String(preview.estimates.estimatedRequests),
      estimatedRuntimeMinutes: String(preview.estimates.estimatedRuntimeMinutes),
      policyVersion: preview.policyVersion,
      killSwitchStatus: preview.killSwitchStatus,
      liveResearchEnabled: preview.liveResearchEnabled ? '1' : '0',
      blockers: JSON.stringify(preview.blockers),
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
    redirect(`/research/runs/new?${params.toString()}`);
  }

  if (!preview.allowed) {
    const params = new URLSearchParams({
      preview: '1',
      allowed: '0',
      estimatedRequests: String(preview.estimates.estimatedRequests),
      estimatedRuntimeMinutes: String(preview.estimates.estimatedRuntimeMinutes),
      policyVersion: preview.policyVersion,
      killSwitchStatus: preview.killSwitchStatus,
      liveResearchEnabled: preview.liveResearchEnabled ? '1' : '0',
      blockers: JSON.stringify(preview.blockers),
      launchBlocked: '1',
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
    redirect(`/research/runs/new?${params.toString()}`);
  }

  const targets = await resolveLaunchTargets(config.maxOrganizations);
  const { run } = await runtime.researchRuns.createAndLaunch({
    role,
    config,
    sources,
    targets,
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
  await runtime.jobs.processNextResearchExecute();
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
