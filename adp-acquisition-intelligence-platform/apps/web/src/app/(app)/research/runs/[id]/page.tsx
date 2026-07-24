import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import {
  activateResearchRunKillSwitchAction,
  advanceResearchRunAction,
  cancelResearchRunAction,
  exportResearchRunReportAction,
  pauseResearchRunAction,
  resumeResearchRunAction,
} from '@/lib/research-run-actions';
import { getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

export default async function ResearchRunDetailPage({ params, searchParams }: PageProps) {
  const runtime = await getWebResearchRuntime();
  const { id } = await params;
  const query = await searchParams;
  const showExport = first(query.export) === '1';
  const run = await runtime.researchRuns.getRun(id);
  const targets = run ? await runtime.researchRuns.listTargets(id) : [];
  const events = run ? await runtime.researchRuns.listEvents(id) : [];
  const approvals = run ? await runtime.researchRuns.listApprovals(id) : [];
  const metrics = run ? await runtime.researchRuns.listMetrics(id) : [];
  const report = showExport && run ? await runtime.researchRuns.exportRunReport(id) : null;
  const pendingJobs = runtime.jobs.pendingResearchExecuteCount();
  const blockedTargets = targets.filter((t) => t.status === 'blocked');
  const config = (run?.configSnapshot ?? {}) as Record<string, unknown>;
  const maxRequests = Number(config.maxTotalRequests ?? 0);
  const requestBudgetRemaining = Math.max(0, maxRequests - (run?.requestsConsumed ?? 0));

  const canPause = run?.status === 'running';
  const canResume = run?.status === 'paused';
  const canCancel =
    run != null && !['completed', 'cancelled', 'blocked', 'failed'].includes(run.status);
  const canAdvance =
    run != null && (run.status === 'queued' || run.status === 'running') && pendingJobs > 0;
  const canKill =
    run != null &&
    !run.killSwitchActive &&
    !['completed', 'cancelled', 'blocked'].includes(run.status);

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R12b',
        title: 'Research Run Detail',
        description:
          'Lifecycle, counters, events, and authorized pause / resume / cancel controls.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
      }}
      searchParams={query}
    >
      <div className="detail-panel" data-testid="research-run-detail">
        {!run ? (
          <p data-testid="research-run-missing">Research run {id} not found.</p>
        ) : (
          <>
            <dl className="detail-grid" data-testid="research-run-counters">
              <div>
                <dt>Status</dt>
                <dd data-testid="research-run-status">{run.status}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd data-testid="research-run-mode">{run.mode}</dd>
              </div>
              <div>
                <dt>Targets total</dt>
                <dd data-testid="research-run-targets-total">{run.targetsTotal}</dd>
              </div>
              <div>
                <dt>Targets completed</dt>
                <dd data-testid="research-run-targets-completed">{run.targetsCompleted}</dd>
              </div>
              <div>
                <dt>Targets failed</dt>
                <dd data-testid="research-run-targets-failed">{run.targetsFailed}</dd>
              </div>
              <div>
                <dt>Targets blocked</dt>
                <dd data-testid="research-run-targets-blocked">{run.targetsBlocked}</dd>
              </div>
              <div>
                <dt>Archive hits</dt>
                <dd data-testid="research-run-archive-hits">{run.archiveHits}</dd>
              </div>
              <div>
                <dt>Live fallbacks</dt>
                <dd data-testid="research-run-live-fallbacks">{run.liveFallbacks}</dd>
              </div>
              <div>
                <dt>Requests consumed</dt>
                <dd data-testid="research-run-requests">{run.requestsConsumed}</dd>
              </div>
              <div>
                <dt>Request budget remaining</dt>
                <dd data-testid="research-run-budget-remaining">{requestBudgetRemaining}</dd>
              </div>
              <div>
                <dt>Pages retrieved</dt>
                <dd data-testid="research-run-pages">{run.pagesRetrieved}</dd>
              </div>
              <div>
                <dt>Snapshots created</dt>
                <dd data-testid="research-run-snapshots">{run.snapshotsCreated}</dd>
              </div>
              <div>
                <dt>Claims proposed</dt>
                <dd data-testid="research-run-claims">{run.claimsProposed}</dd>
              </div>
              <div>
                <dt>Queue depth (deferred execute)</dt>
                <dd data-testid="research-run-pending-jobs">{pendingJobs}</dd>
              </div>
              <div>
                <dt>Kill switch</dt>
                <dd data-testid="research-run-kill-switch">
                  {run.killSwitchActive ? 'active' : 'off'}
                </dd>
              </div>
              <div>
                <dt>Correlation ID</dt>
                <dd data-testid="research-run-correlation">{run.correlationId}</dd>
              </div>
            </dl>

            <h3 className="section-heading">Lifecycle actions</h3>
            <ul className="stub-actions" data-testid="research-run-actions">
              {canAdvance ? (
                <li>
                  <form action={advanceResearchRunAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button type="submit" data-testid="advance-research-run">
                      Process next target
                    </button>
                  </form>
                </li>
              ) : null}
              {canPause ? (
                <li>
                  <form action={pauseResearchRunAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <input type="hidden" name="reason" value="Paused via research run detail" />
                    <button type="submit" data-testid="pause-research-run">
                      Pause
                    </button>
                  </form>
                </li>
              ) : null}
              {canResume ? (
                <li>
                  <form action={resumeResearchRunAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button type="submit" data-testid="resume-research-run">
                      Resume
                    </button>
                  </form>
                </li>
              ) : null}
              {canCancel ? (
                <li>
                  <form action={cancelResearchRunAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <input type="hidden" name="reason" value="Cancelled via research run detail" />
                    <button type="submit" data-testid="cancel-research-run">
                      Cancel
                    </button>
                  </form>
                </li>
              ) : null}
              {canKill ? (
                <li>
                  <form action={activateResearchRunKillSwitchAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button type="submit" data-testid="kill-switch-research-run">
                      Activate kill switch
                    </button>
                  </form>
                </li>
              ) : null}
              <li>
                <form action={exportResearchRunReportAction}>
                  <input type="hidden" name="runId" value={run.id} />
                  <button type="submit" data-testid="export-research-run-report">
                    Export run report
                  </button>
                </form>
              </li>
            </ul>

            <h3 className="section-heading">Targets</h3>
            {targets.length === 0 ? (
              <p data-testid="research-run-targets-empty">No targets.</p>
            ) : (
              <table className="data-table" data-testid="research-run-targets-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Domain</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => (
                    <tr key={t.id} data-testid={`research-run-target-${t.id}`}>
                      <td>{t.organizationId.slice(0, 8)}</td>
                      <td>{t.canonicalDomain ?? '—'}</td>
                      <td data-testid={`research-run-target-status-${t.id}`}>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {blockedTargets.length > 0 ? (
              <p data-testid="research-run-blocked-note">
                {blockedTargets.length} target(s) blocked (policy, kill switch, or gate). They are
                not silently retried.
              </p>
            ) : (
              <p data-testid="research-run-blocked-note">No blocked targets.</p>
            )}

            <h3 className="section-heading">Approvals</h3>
            {approvals.length === 0 ? (
              <p data-testid="research-run-approvals-empty">No approval rows.</p>
            ) : (
              <ul data-testid="research-run-approvals">
                {approvals.map((a, index) => (
                  <li key={`${a.approvalType}-${index}`}>
                    {a.approvalType}: {a.status}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="section-heading">Metrics</h3>
            {metrics.length === 0 ? (
              <p data-testid="research-run-metrics-empty">No metric samples yet.</p>
            ) : (
              <ul data-testid="research-run-metrics">
                {metrics.map((m, index) => (
                  <li key={`${m.metricKey}-${index}`}>
                    {m.metricKey}: {JSON.stringify(m.metricValue)}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="section-heading">Events</h3>
            {events.length === 0 ? (
              <p data-testid="research-run-events-empty">No events yet.</p>
            ) : (
              <ul data-testid="research-run-events">
                {events.map((e, index) => (
                  <li key={`${e.eventType}-${index}`} data-testid={`research-run-event-${index}`}>
                    {e.eventType}
                  </li>
                ))}
              </ul>
            )}

            {report ? (
              <section data-testid="research-run-export">
                <h3 className="section-heading">Exported run report</h3>
                <pre>{JSON.stringify(report, null, 2)}</pre>
              </section>
            ) : null}
          </>
        )}

        <p>
          <Link href="/research/extraction-review" data-testid="link-extraction-review">
            Open extraction review →
          </Link>
          {' · '}
          <Link href="/research/sources" data-testid="link-source-registry">
            View source registry / blockers
          </Link>
        </p>
        <p>
          <Link href="/research/runs">← All research runs</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
