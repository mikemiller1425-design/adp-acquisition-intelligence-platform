import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { previewOrLaunchResearchRunAction } from '@/lib/research-run-actions';
import { getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

type Blocker = { code: string; message: string; blockerRecord?: string; sourceKey?: string };

export default async function NewResearchRunPage({ searchParams }: PageProps) {
  await getWebResearchRuntime();
  const query = await searchParams;

  const previewed = first(query.preview) === '1';
  const allowed = first(query.allowed) === '1';
  const estimatedRequests = first(query.estimatedRequests) ?? '—';
  const estimatedRuntimeMinutes = first(query.estimatedRuntimeMinutes) ?? '—';
  const policyVersion = first(query.policyVersion) ?? 'research-run-policy-v1';
  const killSwitchStatus = first(query.killSwitchStatus) ?? 'off';
  const liveResearchEnabled = first(query.liveResearchEnabled) === '1';

  let blockers: Blocker[] = [];
  const blockersRaw = first(query.blockers);
  if (blockersRaw) {
    try {
      blockers = JSON.parse(blockersRaw) as Blocker[];
    } catch {
      blockers = [{ code: 'parse_error', message: 'Could not parse launch blockers' }];
    }
  }

  const defaults = {
    name: first(query.name) ?? 'Fixture pilot research run',
    objective: first(query.objective) ?? 'Bounded fixture retrieval for pilot verification',
    mode: first(query.mode) ?? 'fixture',
    savedTargetSegment: first(query.savedTargetSegment) ?? 'pilot-accounting-segment',
    territory: first(query.territory) ?? 'territory-east',
    organizationType: first(query.organizationType) ?? 'accounting',
    maxOrganizations: first(query.maxOrganizations) ?? '2',
    maxPagesPerOrganization: first(query.maxPagesPerOrganization) ?? '3',
    maxTotalRequests: first(query.maxTotalRequests) ?? '20',
    sourceKeys: first(query.sourceKeys) ?? 'organization_website_fixture',
    archiveFirst: first(query.archiveFirst) === '1',
    liveFallback: first(query.liveFallback) === '1',
    dryRun: first(query.dryRun) === '1',
    freshnessThresholdHours: first(query.freshnessThresholdHours) ?? '168',
  };

  const launchDisabled = previewed && !allowed;

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R12a',
        title: 'Start Research Run',
        description:
          'Configure a bounded research run. Fixture mode is the pilot default. Live network retrieval stays disabled unless ADP_LIVE_RESEARCH_ENABLED and source approvals pass.',
        requiredRoles: ['admin', 'sales'],
      }}
      searchParams={query}
    >
      <div className="detail-panel" data-testid="research-run-new">
        <form
          action={previewOrLaunchResearchRunAction}
          className="form-panel"
          data-testid="research-run-form"
        >
          <label>
            Run name
            <input name="name" defaultValue={defaults.name} required data-testid="run-name" />
          </label>
          <label>
            Objective
            <textarea
              name="objective"
              defaultValue={defaults.objective}
              rows={3}
              required
              data-testid="run-objective"
            />
          </label>
          <label>
            Saved target segment
            <input
              name="savedTargetSegment"
              defaultValue={defaults.savedTargetSegment}
              required
              data-testid="run-segment"
            />
          </label>
          <label>
            Territory
            <input name="territory" defaultValue={defaults.territory} data-testid="run-territory" />
          </label>
          <label>
            Organization type
            <input
              name="organizationType"
              defaultValue={defaults.organizationType}
              data-testid="run-org-type"
            />
          </label>
          <label>
            Max organizations
            <input
              name="maxOrganizations"
              type="number"
              min={1}
              defaultValue={defaults.maxOrganizations}
              data-testid="run-max-orgs"
            />
          </label>
          <label>
            Max pages per organization
            <input
              name="maxPagesPerOrganization"
              type="number"
              min={1}
              defaultValue={defaults.maxPagesPerOrganization}
              data-testid="run-max-pages"
            />
          </label>
          <label>
            Max total requests
            <input
              name="maxTotalRequests"
              type="number"
              min={1}
              defaultValue={defaults.maxTotalRequests}
              data-testid="run-max-requests"
            />
          </label>
          <label>
            Source selection
            <select name="sourceKeys" defaultValue={defaults.sourceKeys} data-testid="run-source">
              <option value="organization_website_fixture">
                organization_website_fixture (fixture — default)
              </option>
              <option value="archived_web_common_crawl">archived_web_common_crawl (gated)</option>
              <option value="organization_website_live">organization_website_live (gated)</option>
            </select>
          </label>
          <label>
            <span>
              <input
                name="archiveFirst"
                type="checkbox"
                defaultChecked={defaults.archiveFirst}
                data-testid="run-archive-first"
              />{' '}
              Archive-first preference
            </span>
          </label>
          <label>
            <span>
              <input
                name="liveFallback"
                type="checkbox"
                defaultChecked={defaults.liveFallback}
                data-testid="run-live-fallback"
              />{' '}
              Live fallback (requires live research enabled + approvals)
            </span>
          </label>
          <label>
            <span>
              <input
                name="dryRun"
                type="checkbox"
                defaultChecked={defaults.dryRun}
                data-testid="run-dry-run"
              />{' '}
              Dry-run (plan only — no snapshot writes)
            </span>
          </label>
          <label>
            Freshness threshold (hours)
            <input
              name="freshnessThresholdHours"
              type="number"
              min={1}
              defaultValue={defaults.freshnessThresholdHours}
              data-testid="run-freshness"
            />
          </label>
          <label>
            Mode
            <select name="mode" defaultValue={defaults.mode} data-testid="run-mode">
              <option value="fixture">fixture (pilot default)</option>
              <option value="dry_run">dry_run</option>
              <option value="archive_only">archive_only</option>
              <option value="archive_first_live_fallback">archive_first_live_fallback</option>
              <option value="live_official_site_only">live_official_site_only</option>
            </select>
          </label>

          <section data-testid="run-estimates" aria-label="Estimates">
            <h3 className="section-heading">Estimated volume / runtime</h3>
            <dl className="detail-grid">
              <div>
                <dt>Estimated requests</dt>
                <dd data-testid="estimated-requests">{estimatedRequests}</dd>
              </div>
              <div>
                <dt>Estimated runtime (minutes)</dt>
                <dd data-testid="estimated-runtime">{estimatedRuntimeMinutes}</dd>
              </div>
            </dl>
            {!previewed ? <p>Run Preview to compute estimates and evaluate launch gates.</p> : null}
          </section>

          <section data-testid="run-gate-status" aria-label="Approval and safety">
            <h3 className="section-heading">Approval / safety status</h3>
            <dl className="detail-grid">
              <div>
                <dt>Approval status</dt>
                <dd data-testid="approval-status">
                  {!previewed ? 'not_previewed' : allowed ? 'gates_passed' : 'gates_blocked'}
                </dd>
              </div>
              <div>
                <dt>Kill-switch status</dt>
                <dd data-testid="kill-switch-status">{killSwitchStatus}</dd>
              </div>
              <div>
                <dt>Policy version</dt>
                <dd data-testid="policy-version">{policyVersion}</dd>
              </div>
              <div>
                <dt>Live research enabled</dt>
                <dd data-testid="live-research-enabled">
                  {liveResearchEnabled ? 'true' : 'false'}
                </dd>
              </div>
            </dl>
            <p data-testid="confirmation-summary">
              {previewed
                ? `Confirm: “${defaults.name}” in mode ${defaults.mode} against ${defaults.sourceKeys} (segment ${defaults.savedTargetSegment || 'none'}). Live egress default is DISABLED.`
                : 'Confirmation summary appears after preview.'}
            </p>
          </section>

          {previewed && blockers.length > 0 ? (
            <ul data-testid="launch-blockers">
              {blockers.map((b) => (
                <li key={`${b.code}:${b.sourceKey ?? ''}:${b.message}`}>
                  [{b.code}] {b.message}
                  {b.blockerRecord ? ` (${b.blockerRecord})` : ''}
                </li>
              ))}
            </ul>
          ) : previewed ? (
            <p data-testid="launch-blockers">No launch blockers.</p>
          ) : (
            <p data-testid="launch-blockers">Preview required before launch.</p>
          )}

          <div className="stub-actions">
            <button type="submit" name="intent" value="preview" data-testid="preview-research-run">
              Preview
            </button>
            <button
              type="submit"
              name="intent"
              value="launch"
              data-testid="launch-research-run"
              disabled={launchDisabled || !previewed}
            >
              Launch research run
            </button>
          </div>
        </form>

        <p>
          <Link href="/research/runs">← Research runs</Link>
          {' · '}
          <Link href="/research">Research hub</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
