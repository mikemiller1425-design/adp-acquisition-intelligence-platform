import { createHash } from 'node:crypto';
import { canExecuteApprovedSource, type ApprovedSourceGate } from '../domain/approved-source.js';
import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import {
  extractClaimsFromHtml,
  detectPromptInjectionMarkers,
  EXTRACTOR_VERSION,
  MAPPING_VERSION,
} from '../domain/extraction.js';
import { validateRetrievalUrl, validateRedirectTarget } from '../domain/network-security.js';
import { evaluateRateLimit } from '../domain/rate-limit.js';
import { evaluateRobotsPolicy } from '../domain/robots.js';
import { contentHash, contentUnchanged } from '../domain/snapshot.js';
import type { ClaimRepository, OutboxPort, RetrievalPort } from '../domain/ports.js';
import type {
  ApprovedSourceRepository,
  CollectionAttemptRepository,
  CollectionRunRepository,
  CollectionRunStatus,
  ConcurrencyGatePort,
  ExtractionRunRepository,
  RateLimitStateRepository,
  SnapshotRepository,
} from '../domain/persistence-ports.js';

export type CollectionTarget = {
  organizationId: string;
  canonicalDomain: string;
};

export type CollectionRunResult = {
  runId: string;
  status: CollectionRunStatus;
  pagesRetrieved: number;
  pagesSkippedUnchanged: number;
  claimsProposed: number;
  blocked: Array<{ organizationId: string; code: string; message: string }>;
};

export class TargetedCollectionService {
  private cancelled = false;

  constructor(
    private readonly retrieval: RetrievalPort,
    private readonly claims: ClaimRepository,
    private readonly snapshots: SnapshotRepository,
    private readonly extractionRuns: ExtractionRunRepository,
    private readonly attempts: CollectionAttemptRepository,
    private readonly collectionRuns: CollectionRunRepository,
    private readonly approvedSources: ApprovedSourceRepository,
    private readonly rateLimits: RateLimitStateRepository,
    private readonly concurrency: ConcurrencyGatePort,
    private readonly outbox: OutboxPort,
  ) {}

  async activateKillSwitch(sourceKey: string, role: ResearchRole) {
    new AllowListResearchCapabilityChecker(role).assert('kill_switch:operate');
    await this.approvedSources.setKillSwitch(sourceKey, true);
    await this.outbox.insert({
      aggregateType: 'approved_source',
      aggregateId: sourceKey,
      eventType: 'research.kill_switch_activated',
      idempotencyKey: `research.kill_switch_activated:${sourceKey}:${Date.now()}`,
      payload: { sourceKey },
    });
  }

  cancel() {
    this.cancelled = true;
  }

  async run(input: {
    runId: string;
    source: ApprovedSourceGate & {
      id: string;
      sourceKey: string;
      rateLimitPerMinute: number;
      concurrencyLimit: number;
      pageLimit: number;
      responseSizeLimitBytes: number;
      timeoutMs: number;
      parserVersion: string;
      domains: string[];
      adapterType?: string;
    };
    targets: CollectionTarget[];
    role: ResearchRole;
    previousHashes?: Record<string, string>;
    robotsTxtByDomain?: Record<string, string | null>;
  }): Promise<CollectionRunResult> {
    new AllowListResearchCapabilityChecker(input.role).assert('collection_run:create');

    const persistedKill = await this.approvedSources.getKillSwitch(input.source.sourceKey);
    const sourceGate = {
      ...input.source,
      killSwitchActive: input.source.killSwitchActive || persistedKill,
    };

    const gate = canExecuteApprovedSource(sourceGate);
    if (!gate.allowed) {
      await this.outbox.insert({
        aggregateType: 'collection_run',
        aggregateId: input.runId,
        eventType: 'research.retrieval_blocked',
        idempotencyKey: `research.retrieval_blocked:${input.runId}:gate`,
        payload: { code: gate.code },
      });
      await this.collectionRuns
        .updateStatus(input.runId, 'blocked', {
          killSwitchObserved: gate.code === 'kill_switch',
          blockedCount: input.targets.length,
          summary: { code: gate.code, message: gate.message },
          completedAt: new Date(),
        })
        .catch(() => undefined);
      return {
        runId: input.runId,
        status: 'blocked',
        pagesRetrieved: 0,
        pagesSkippedUnchanged: 0,
        claimsProposed: 0,
        blocked: input.targets.map((t) => ({
          organizationId: t.organizationId,
          code: gate.code,
          message: gate.message,
        })),
      };
    }

    const acquired = await this.concurrency.tryAcquire(
      input.source.id,
      input.source.concurrencyLimit,
    );
    if (!acquired) {
      await this.collectionRuns
        .updateStatus(input.runId, 'blocked', {
          blockedCount: input.targets.length,
          summary: { code: 'concurrency_limit' },
          completedAt: new Date(),
        })
        .catch(() => undefined);
      return {
        runId: input.runId,
        status: 'blocked',
        pagesRetrieved: 0,
        pagesSkippedUnchanged: 0,
        claimsProposed: 0,
        blocked: input.targets.map((t) => ({
          organizationId: t.organizationId,
          code: 'concurrency_limit',
          message: 'Source concurrency limit reached',
        })),
      };
    }

    try {
      await this.collectionRuns
        .updateStatus(input.runId, 'running', { startedAt: new Date() })
        .catch(() => undefined);

      await this.outbox.insert({
        aggregateType: 'collection_run',
        aggregateId: input.runId,
        eventType: 'research.collection_run_started',
        idempotencyKey: `research.collection_run_started:${input.runId}`,
        payload: { sourceKey: input.source.sourceKey, targetCount: input.targets.length },
      });

      let pagesRetrieved = 0;
      let pagesSkippedUnchanged = 0;
      let claimsProposed = 0;
      const blocked: CollectionRunResult['blocked'] = [];

      for (const target of input.targets) {
        const killNow = await this.approvedSources.getKillSwitch(input.source.sourceKey);
        if (this.cancelled || killNow) break;

        const domain = target.canonicalDomain.toLowerCase();
        if (
          input.source.domains.length &&
          !input.source.domains.includes(domain) &&
          !input.source.domains.includes('*')
        ) {
          blocked.push({
            organizationId: target.organizationId,
            code: 'domain_not_allowlisted',
            message: `Domain ${domain} not on approved allowlist`,
          });
          continue;
        }

        const paths = ['/', '/about', '/services'].slice(0, input.source.pageLimit);
        for (const path of paths) {
          const killSwitch = await this.approvedSources.getKillSwitch(input.source.sourceKey);
          if (this.cancelled || killSwitch) break;

          const url = `https://${domain}${path === '/' ? '/' : path}`;
          const attempt = await this.attempts.insert({
            collectionRunId: input.runId,
            organizationId: target.organizationId,
            approvedSourceId: input.source.id,
            requestedUrl: url,
            domain,
            status: 'running',
            startedAt: new Date(),
          });

          const urlCheck = validateRetrievalUrl(url);
          if (!urlCheck.ok) {
            await this.attempts.update(attempt.id, {
              status: 'blocked',
              errorCode: urlCheck.code,
              errorMessage: urlCheck.message,
              completedAt: new Date(),
            });
            blocked.push({
              organizationId: target.organizationId,
              code: urlCheck.code,
              message: urlCheck.message,
            });
            continue;
          }

          const robots = evaluateRobotsPolicy({
            robotsTxt: input.robotsTxtByDomain?.[domain] ?? null,
            path,
            behavior: 'respect',
          });
          if (!robots.allowed) {
            await this.attempts.update(attempt.id, {
              status: 'blocked',
              errorCode: 'robots_disallow',
              errorMessage: robots.reason,
              completedAt: new Date(),
            });
            blocked.push({
              organizationId: target.organizationId,
              code: 'robots_disallow',
              message: robots.reason,
            });
            continue;
          }

          const priorRate = await this.rateLimits.load(input.source.id, domain);
          const rl = evaluateRateLimit(priorRate, Date.now(), input.source.rateLimitPerMinute);
          await this.rateLimits.save(input.source.id, domain, rl.nextState);
          if (!rl.allowed) {
            await this.attempts.update(attempt.id, {
              status: 'blocked',
              errorCode: 'rate_limited',
              errorMessage: `Retry after ${rl.retryAfterMs}ms`,
              completedAt: new Date(),
            });
            blocked.push({
              organizationId: target.organizationId,
              code: 'rate_limited',
              message: `Retry after ${rl.retryAfterMs}ms`,
            });
            continue;
          }

          let response;
          try {
            response = await this.retrieval.retrieve(url, {
              timeoutMs: input.source.timeoutMs,
              maxBytes: input.source.responseSizeLimitBytes,
            });
          } catch (error) {
            const code =
              error && typeof error === 'object' && 'code' in error
                ? String((error as { code: unknown }).code)
                : 'retrieve_failed';
            const message = error instanceof Error ? error.message : 'retrieve_failed';
            await this.attempts.update(attempt.id, {
              status: 'failed',
              errorCode: code,
              errorMessage: message,
              completedAt: new Date(),
            });
            blocked.push({ organizationId: target.organizationId, code, message });
            continue;
          }

          let redirectInvalid = false;
          for (let i = 0; i < response.redirectChain.length; i++) {
            const from = i === 0 ? url : response.redirectChain[i - 1]!;
            const to = response.redirectChain[i]!;
            const redirectCheck = validateRedirectTarget(from, to);
            if (!redirectCheck.ok) {
              await this.attempts.update(attempt.id, {
                status: 'blocked',
                errorCode: redirectCheck.code,
                errorMessage: redirectCheck.message,
                redirectChain: response.redirectChain,
                completedAt: new Date(),
              });
              blocked.push({
                organizationId: target.organizationId,
                code: redirectCheck.code,
                message: redirectCheck.message,
              });
              redirectInvalid = true;
              break;
            }
          }
          if (redirectInvalid) {
            // Abort further processing for this retrieval — do not snapshot or extract.
            continue;
          }

          if (
            !response.contentType.includes('text/html') &&
            !response.contentType.includes('application/xhtml')
          ) {
            await this.attempts.update(attempt.id, {
              status: 'blocked',
              errorCode: 'unsupported_mime',
              errorMessage: response.contentType,
              completedAt: new Date(),
            });
            blocked.push({
              organizationId: target.organizationId,
              code: 'unsupported_mime',
              message: response.contentType,
            });
            continue;
          }

          const hash = contentHash(response.body);
          const prev = input.previousHashes?.[`${target.organizationId}:${path}`];
          if (contentUnchanged(prev, hash)) {
            pagesSkippedUnchanged += 1;
            await this.attempts.update(attempt.id, {
              status: 'succeeded',
              finalUrl: response.finalUrl,
              httpStatus: response.status,
              contentHash: hash,
              redirectChain: response.redirectChain,
              completedAt: new Date(),
            });
            continue;
          }

          const injection = detectPromptInjectionMarkers(response.body);
          pagesRetrieved += 1;

          const snapshot = await this.snapshots.insert({
            organizationId: target.organizationId,
            approvedSourceId: input.source.id,
            requestedUrl: url,
            finalUrl: response.finalUrl,
            domain,
            adapterVersion: `${input.source.adapterType ?? 'fixture'}-v1`,
            policyVersion: 'collection-policy-v1',
            retrievedAt: new Date(),
            httpStatus: response.status,
            contentType: response.contentType,
            contentLength: Buffer.byteLength(response.body, 'utf8'),
            contentHash: hash,
            etag: response.etag,
            lastModified: response.lastModified,
            redirectChain: response.redirectChain,
            parserVersion: input.source.parserVersion,
          });

          await this.attempts.update(attempt.id, {
            status: 'succeeded',
            finalUrl: response.finalUrl,
            httpStatus: response.status,
            contentHash: hash,
            redirectChain: response.redirectChain,
            completedAt: new Date(),
          });

          await this.outbox.insert({
            aggregateType: 'collection_run',
            aggregateId: input.runId,
            eventType: 'research.retrieval_completed',
            idempotencyKey: `research.retrieval_completed:${input.runId}:${createHash('sha256').update(url).digest('hex').slice(0, 12)}`,
            payload: {
              organizationId: target.organizationId,
              domain,
              httpStatus: response.status,
              contentHash: hash,
              snapshotId: snapshot.id,
              injectionMarkers: injection.length,
            },
          });

          const proposals = extractClaimsFromHtml(response.body);
          if (proposals.length) {
            const extraction = await this.extractionRuns.insert({
              sourceSnapshotId: snapshot.id,
              extractorVersion: EXTRACTOR_VERSION,
              mappingVersion: MAPPING_VERSION,
              status: 'completed',
              summary: { proposalCount: proposals.length },
            });
            const inserted = await this.claims.insertProposals(
              proposals.map((p) => ({
                ...p,
                organizationId: target.organizationId,
                sourceUrl: response.finalUrl,
                sourceSnapshotId: snapshot.id,
                extractionRunId: extraction.id,
                extractorVersion: EXTRACTOR_VERSION,
                mappingVersion: MAPPING_VERSION,
              })),
            );
            claimsProposed += inserted.length;
            for (const claim of inserted) {
              await this.outbox.insert({
                aggregateType: 'extracted_claim',
                aggregateId: claim.id,
                eventType: 'research.claim_proposed',
                idempotencyKey: `research.claim_proposed:${claim.id}`,
                payload: {
                  variableKey: claim.variableKey,
                  organizationId: claim.organizationId,
                  snapshotId: snapshot.id,
                },
              });
            }
          }
        }
      }

      const killFinal = await this.approvedSources.getKillSwitch(input.source.sourceKey);
      const status: CollectionRunStatus =
        this.cancelled || killFinal
          ? 'cancelled'
          : blocked.length && !pagesRetrieved
            ? 'blocked'
            : 'completed';

      await this.collectionRuns
        .updateStatus(input.runId, status, {
          completedCount: pagesRetrieved,
          blockedCount: blocked.length,
          killSwitchObserved: killFinal,
          summary: {
            pagesRetrieved,
            claimsProposed,
            pagesSkippedUnchanged,
            blocked: blocked.length,
          },
          completedAt: new Date(),
          ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}),
        })
        .catch(() => undefined);

      await this.outbox.insert({
        aggregateType: 'collection_run',
        aggregateId: input.runId,
        eventType:
          status === 'cancelled'
            ? 'research.collection_run_cancelled'
            : 'research.collection_run_completed',
        idempotencyKey: `research.collection_run_terminal:${input.runId}`,
        payload: {
          status,
          pagesRetrieved,
          claimsProposed,
          pagesSkippedUnchanged,
          blocked: blocked.length,
        },
      });

      return {
        runId: input.runId,
        status,
        pagesRetrieved,
        pagesSkippedUnchanged,
        claimsProposed,
        blocked,
      };
    } finally {
      await this.concurrency.release(input.source.id);
    }
  }
}
