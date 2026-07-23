'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getWebSession, roleCanAccess } from '@/lib/auth';
import {
  getResearchWorkflowSnapshot,
  getWebResearchRuntime,
  resetWebResearchRuntimeForTests,
} from '@/lib/research-runtime';
import type { ResearchRole } from '@adp/research';

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

const DEFAULT_MAPPING: Record<string, string> = {
  displayName: 'practiceName',
  website: 'websiteUrl',
  city: 'city',
  region: 'state',
  phone: 'phone',
};

const DEMO_ROWS = [
  {
    practiceName: 'Acme Advisory',
    websiteUrl: 'https://www.acme-advisory.test/',
    city: 'Austin',
    state: 'TX',
    phone: '(512) 555-0100',
    sourceSystem: 'fixture_csv',
    sourceRecordId: 'row-001',
  },
];

export async function resetResearchFixtureAction() {
  assertRoles(['admin', 'sales', 'reviewer']);
  resetWebResearchRuntimeForTests();
  getWebResearchRuntime();
  revalidatePath('/research');
  redirect('/research/population-imports?reset=1');
}

export async function importPopulationAction(formData: FormData) {
  assertRoles(['admin', 'sales']);
  const dryRun = formData.get('dryRun') === 'on' || formData.get('dryRun') === 'true';
  const runtime = getWebResearchRuntime();
  const session = getWebSession();

  await runtime.jobs.enqueue({
    name: 'population.import.requested',
    idempotencyKey: `web-import:${Date.now()}`,
    correlationId: crypto.randomUUID(),
    payload: {
      populationSourceId: 'ps-fixture-1',
      dryRun,
      rows: DEMO_ROWS,
      mapping: DEFAULT_MAPPING,
      actorUserId: session.userId,
      role: primaryResearchRole(),
      idempotencyKey: `web-import:${crypto.randomUUID()}`,
    },
  });

  revalidatePath('/research');
  redirect(dryRun ? '/research/population-imports?dryRun=1' : '/research/entity-resolution');
}

export async function resolveEntitiesAction() {
  assertRoles(['admin', 'sales', 'reviewer']);
  const runtime = getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot(runtime);
  const importId = snapshot.imports.at(-1)?.id;
  if (!importId) {
    throw new Error('No population import to resolve');
  }

  await runtime.jobs.enqueue({
    name: 'population.resolve.requested',
    idempotencyKey: `web-resolve:${importId}`,
    payload: {
      importId,
      dryRun: false,
    },
  });

  revalidatePath('/research');
  redirect('/research/priorities');
}

export async function calculatePrioritiesAction() {
  assertRoles(['admin', 'sales', 'reviewer']);
  const runtime = getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot(runtime);
  const org = snapshot.organizations[0];
  if (!org) throw new Error('No organization to prioritize');

  await runtime.jobs.enqueue({
    name: 'research.priority.requested',
    idempotencyKey: `web-priority:${org.organizationId}`,
    payload: {
      organizationId: org.organizationId,
      role: primaryResearchRole(),
      input: {
        commercialPotential: 'high',
        completenessGaps: 3,
        missingHighImpactVariables: ['services_offered'],
        sourceAvailability: 'high',
        expectedInformationGain: 'high',
      },
    },
  });

  revalidatePath('/research');
  redirect('/research/collection-jobs');
}

export async function startCollectionRunAction() {
  assertRoles(['admin', 'sales']);
  const runtime = getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot(runtime);
  const org = snapshot.organizations[0];
  if (!org) throw new Error('No organization for collection');
  const domain = (org.domain ?? 'acme-advisory.test').replace(/^www\./, '');

  const runId = crypto.randomUUID();
  await runtime.jobs.enqueue({
    name: 'collection.run.requested',
    idempotencyKey: `web-collection:${runId}`,
    payload: {
      runId,
      sourceKey: 'organization_website_fixture',
      role: primaryResearchRole(),
      actorUserId: getWebSession().userId,
      pageLimit: 3,
      targets: [{ organizationId: org.organizationId, canonicalDomain: domain }],
    },
  });

  revalidatePath('/research');
  redirect(`/research/collection-jobs/${runId}`);
}

export async function acceptClaimAction(formData: FormData) {
  assertRoles(['admin', 'reviewer']);
  const claimId = String(formData.get('claimId') ?? '');
  if (!claimId) throw new Error('claimId required');
  const runtime = getWebResearchRuntime();
  const session = getWebSession();

  await runtime.claimReview.review({
    claimId,
    action: 'accept',
    actorUserId: session.userId,
    role: primaryResearchRole(),
    rationale: 'Accepted via research extraction review UI (fixture pilot)',
  });

  revalidatePath('/research');
  redirect('/research/coverage?accepted=1');
}

export async function rejectClaimAction(formData: FormData) {
  assertRoles(['admin', 'reviewer']);
  const claimId = String(formData.get('claimId') ?? '');
  if (!claimId) throw new Error('claimId required');
  const runtime = getWebResearchRuntime();
  const session = getWebSession();

  await runtime.claimReview.review({
    claimId,
    action: 'reject',
    actorUserId: session.userId,
    role: primaryResearchRole(),
    rationale: 'Rejected via research extraction review UI',
  });

  revalidatePath('/research/extraction-review');
  redirect('/research/extraction-review');
}
