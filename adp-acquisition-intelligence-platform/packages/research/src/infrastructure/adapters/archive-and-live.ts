import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';

import {
  validateRetrievalUrl,
  validateRedirectTarget,
  validateResolvedDestination,
} from '../../domain/network-security.js';
import { evaluateRobotsPolicy } from '../../domain/robots.js';
import {
  assertNetworkRetrievalPermitted,
  type SourceGateInput,
} from '../../domain/research-run-gates.js';
import type { ResearchRunMode } from '../../domain/research-run.js';
import type { RetrievalPort, RetrievalResponse } from '../../domain/ports.js';

export type AdapterRetrievalResult = RetrievalResponse & {
  provenance: Record<string, unknown>;
  adapterType: string;
  sourceKey: string;
};

export type NetworkRequestProbe = {
  outboundRequests: number;
  urls: string[];
};

export type ArchiveIndexRecord = {
  domain: string;
  originalUrl: string;
  crawlId: string;
  indexRecord: Record<string, unknown>;
  warcLocation: string;
  retrievedAt?: string;
  body?: string;
};

/**
 * Common Crawl–shaped archive adapter.
 * Default: recorded/fixture index only — never opens sockets unless dual gates permit
 * AND an explicit live transport is injected (owner-approved smoke only).
 */
export class CommonCrawlArchiveAdapter {
  readonly adapterType = 'archived_web' as const;
  private readonly probe: NetworkRequestProbe = { outboundRequests: 0, urls: [] };

  constructor(
    private readonly options: {
      indexCache?: Map<string, ArchiveIndexRecord[]>;
      recordedRecords?: ArchiveIndexRecord[];
      liveFetch?: (url: string) => Promise<RetrievalResponse>;
      userAgent?: string;
    } = {},
  ) {}

  getRequestProbe(): NetworkRequestProbe {
    return { ...this.probe, urls: [...this.probe.urls] };
  }

  async lookupIndex(domain: string): Promise<ArchiveIndexRecord[]> {
    const cache = this.options.indexCache ?? new Map();
    const cached = cache.get(domain);
    if (cached) return cached;
    const records = (this.options.recordedRecords ?? []).filter((r) => r.domain === domain);
    cache.set(domain, records);
    return records;
  }

  async retrieveSelected(input: {
    domain: string;
    source: SourceGateInput;
    mode: ResearchRunMode;
    liveResearchEnabled: boolean;
    globalKillSwitchActive: boolean;
    runKillSwitchActive: boolean;
  }): Promise<AdapterRetrievalResult | null> {
    assertNetworkRetrievalPermitted({
      liveResearchEnabled: input.liveResearchEnabled,
      source: input.source,
      globalKillSwitchActive: input.globalKillSwitchActive,
      runKillSwitchActive: input.runKillSwitchActive,
      mode: input.mode,
    });

    const records = await this.lookupIndex(input.domain);
    const selected = records[0];
    if (!selected) return null;

    if (selected.body) {
      const hash = createHash('sha256').update(selected.body).digest('hex');
      return {
        status: 200,
        finalUrl: selected.originalUrl,
        body: selected.body,
        contentType: 'text/html',
        etag: null,
        lastModified: null,
        redirectChain: [],
        provenance: {
          crawlId: selected.crawlId,
          indexRecord: selected.indexRecord,
          warcLocation: selected.warcLocation,
          retrievedAt: new Date().toISOString(),
          contentHash: hash,
          adapter: 'common_crawl',
          network: false,
        },
        adapterType: this.adapterType,
        sourceKey: input.source.sourceKey,
      };
    }

    if (!this.options.liveFetch) {
      throw new Error('archive_live_transport_not_configured');
    }
    this.probe.outboundRequests += 1;
    this.probe.urls.push(selected.warcLocation);
    const response = await this.options.liveFetch(selected.warcLocation);
    const hash = createHash('sha256').update(response.body).digest('hex');
    return {
      ...response,
      provenance: {
        crawlId: selected.crawlId,
        indexRecord: selected.indexRecord,
        warcLocation: selected.warcLocation,
        retrievedAt: new Date().toISOString(),
        contentHash: hash,
        adapter: 'common_crawl',
        network: true,
      },
      adapterType: this.adapterType,
      sourceKey: input.source.sourceKey,
    };
  }
}

/**
 * Official organization website adapter — RFC 9309 robots, SSRF, same-registrable-domain.
 * Disabled unless ADP_LIVE_RESEARCH_ENABLED and source registry permit.
 */
export class OfficialWebsiteAdapter {
  readonly adapterType = 'organization_website' as const;
  private readonly probe: NetworkRequestProbe = { outboundRequests: 0, urls: [] };

  constructor(
    private readonly options: {
      retrieval?: RetrievalPort;
      robotsTxt?: string;
      userAgent?: string;
      operatorContact?: string;
      redirectPolicy?: 'same_host' | 'same_registrable_domain' | 'https_only_upgrade';
      /** Injected resolver for tests; defaults to dns.lookup. */
      resolveAddresses?: (hostname: string) => Promise<string[]>;
    } = {},
  ) {}

  getRequestProbe(): NetworkRequestProbe {
    return { ...this.probe, urls: [...this.probe.urls] };
  }

  private async resolveAndValidateHostname(hostname: string): Promise<string[]> {
    const resolve =
      this.options.resolveAddresses ??
      (async (host: string) => {
        const results = await lookup(host, { all: true });
        return results.map((r) => r.address);
      });
    const addresses = await resolve(hostname);
    const dest = validateResolvedDestination(hostname, addresses);
    if (!dest.ok) throw new Error(dest.code);
    return addresses;
  }

  async retrievePage(input: {
    url: string;
    domain: string;
    source: SourceGateInput;
    mode: ResearchRunMode;
    liveResearchEnabled: boolean;
    globalKillSwitchActive: boolean;
    runKillSwitchActive: boolean;
    timeoutMs: number;
    maxBytes: number;
  }): Promise<AdapterRetrievalResult> {
    assertNetworkRetrievalPermitted({
      liveResearchEnabled: input.liveResearchEnabled,
      source: input.source,
      globalKillSwitchActive: input.globalKillSwitchActive,
      runKillSwitchActive: input.runKillSwitchActive,
      mode: input.mode,
    });

    const urlCheck = validateRetrievalUrl(input.url);
    if (!urlCheck.ok) throw new Error(urlCheck.code);

    // DNS/IP validation before any outbound request (anti-rebinding baseline).
    await this.resolveAndValidateHostname(urlCheck.hostname);

    const ua =
      this.options.userAgent ??
      `ADPResearchBot/1.2 (+${this.options.operatorContact ?? 'research-ops@example.invalid'})`;
    const robots = evaluateRobotsPolicy({
      behavior: 'respect',
      robotsTxt: this.options.robotsTxt ?? 'User-agent: *\nAllow: /\n',
      userAgent: ua,
      path: new URL(input.url).pathname,
    });
    if (!robots.allowed) {
      throw new Error('robots_disallow');
    }

    if (!this.options.retrieval) {
      throw new Error('live_retrieval_transport_not_configured');
    }

    this.probe.outboundRequests += 1;
    this.probe.urls.push(input.url);
    const response = await this.options.retrieval.retrieve(input.url, {
      timeoutMs: input.timeoutMs,
      maxBytes: input.maxBytes,
    });

    for (const hop of response.redirectChain ?? []) {
      const redirect = validateRedirectTarget(
        input.url,
        hop,
        this.options.redirectPolicy ?? 'same_registrable_domain',
      );
      if (!redirect.ok) throw new Error(redirect.code);
      const hopCheck = validateRetrievalUrl(hop);
      if (!hopCheck.ok) throw new Error(hopCheck.code);
      await this.resolveAndValidateHostname(hopCheck.hostname);
    }

    const hash = createHash('sha256').update(response.body).digest('hex');
    return {
      ...response,
      provenance: {
        userAgent: ua,
        retrievedAt: new Date().toISOString(),
        contentHash: hash,
        adapter: 'official_website',
        network: true,
        domain: input.domain,
      },
      adapterType: this.adapterType,
      sourceKey: input.source.sourceKey,
    };
  }
}
