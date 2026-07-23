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

export type CollectionTarget = {
  organizationId: string;
  canonicalDomain: string;
};

export type CollectionRunResult = {
  runId: string;
  status: 'completed' | 'cancelled' | 'failed' | 'blocked';
  pagesRetrieved: number;
  pagesSkippedUnchanged: number;
  claimsProposed: number;
  blocked: Array<{ organizationId: string; code: string; message: string }>;
};

export class TargetedCollectionService {
  private cancelled = false;
  private killSwitch = false;

  constructor(
    private readonly retrieval: RetrievalPort,
    private readonly claims: ClaimRepository,
    private readonly outbox: OutboxPort,
  ) {}

  activateKillSwitch(role: ResearchRole) {
    new AllowListResearchCapabilityChecker(role).assert('kill_switch:operate');
    this.killSwitch = true;
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
      pageLimit: number;
      responseSizeLimitBytes: number;
      timeoutMs: number;
      parserVersion: string;
      domains: string[];
    };
    targets: CollectionTarget[];
    role: ResearchRole;
    previousHashes?: Record<string, string>;
    robotsTxtByDomain?: Record<string, string | null>;
  }): Promise<CollectionRunResult> {
    new AllowListResearchCapabilityChecker(input.role).assert('collection_run:create');

    const gate = canExecuteApprovedSource(input.source);
    if (!gate.allowed) {
      await this.outbox.insert({
        aggregateType: 'collection_run',
        aggregateId: input.runId,
        eventType: 'research.retrieval_blocked',
        idempotencyKey: `research.retrieval_blocked:${input.runId}:gate`,
        payload: { code: gate.code },
      });
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
    let rate: { windowStartedAtMs: number; requestCount: number } | null = null;

    for (const target of input.targets) {
      if (this.cancelled || this.killSwitch) break;
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
        if (this.cancelled || this.killSwitch) break;
        const url = `https://${domain}${path === '/' ? '/' : path}`;
        const urlCheck = validateRetrievalUrl(url);
        if (!urlCheck.ok) {
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
          blocked.push({
            organizationId: target.organizationId,
            code: 'robots_disallow',
            message: robots.reason,
          });
          continue;
        }

        const rl = evaluateRateLimit(rate, Date.now(), input.source.rateLimitPerMinute);
        rate = rl.nextState;
        if (!rl.allowed) {
          blocked.push({
            organizationId: target.organizationId,
            code: 'rate_limited',
            message: `Retry after ${rl.retryAfterMs}ms`,
          });
          continue;
        }

        const response = await this.retrieval.retrieve(url, {
          timeoutMs: input.source.timeoutMs,
          maxBytes: input.source.responseSizeLimitBytes,
        });

        for (let i = 0; i < response.redirectChain.length; i++) {
          const from = i === 0 ? url : response.redirectChain[i - 1]!;
          const to = response.redirectChain[i]!;
          const redirectCheck = validateRedirectTarget(from, to);
          if (!redirectCheck.ok) {
            blocked.push({
              organizationId: target.organizationId,
              code: redirectCheck.code,
              message: redirectCheck.message,
            });
            continue;
          }
        }

        if (
          !response.contentType.includes('text/html') &&
          !response.contentType.includes('application/xhtml')
        ) {
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
          continue;
        }

        const injection = detectPromptInjectionMarkers(response.body);
        pagesRetrieved += 1;
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
            injectionMarkers: injection.length,
          },
        });

        const proposals = extractClaimsFromHtml(response.body);
        if (proposals.length) {
          const snapshotId = crypto.randomUUID();
          const extractionRunId = crypto.randomUUID();
          const inserted = await this.claims.insertProposals(
            proposals.map((p) => ({
              ...p,
              organizationId: target.organizationId,
              sourceUrl: response.finalUrl,
              sourceSnapshotId: snapshotId,
              extractionRunId,
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
              payload: { variableKey: claim.variableKey, organizationId: claim.organizationId },
            });
          }
        }
      }
    }

    const status =
      this.killSwitch || this.cancelled
        ? 'cancelled'
        : blocked.length && !pagesRetrieved
          ? 'blocked'
          : 'completed';

    await this.outbox.insert({
      aggregateType: 'collection_run',
      aggregateId: input.runId,
      eventType:
        status === 'cancelled'
          ? 'research.collection_run_cancelled'
          : 'research.collection_run_completed',
      idempotencyKey: `research.collection_run_terminal:${input.runId}`,
      payload: { pagesRetrieved, claimsProposed, pagesSkippedUnchanged, blocked: blocked.length },
    });

    return {
      runId: input.runId,
      status,
      pagesRetrieved,
      pagesSkippedUnchanged,
      claimsProposed,
      blocked,
    };
  }
}
