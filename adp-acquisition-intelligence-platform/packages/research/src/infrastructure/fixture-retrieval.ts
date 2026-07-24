import {
  validateRetrievalUrl,
  validateResolvedDestination,
  type DnsResolverPort,
  StaticDnsResolver,
} from '../domain/network-security.js';
import type { RetrievalPort, RetrievalResponse } from '../domain/ports.js';

export type FixturePage = {
  status?: number;
  contentType?: string;
  body: string;
  etag?: string | null;
  lastModified?: string | null;
  redirectChain?: string[];
};

/**
 * Deterministic retrieval for CI. Never opens network sockets.
 * DNS resolution is validated at the retrieval boundary before serving fixtures.
 */
export class FixtureRetrievalPort implements RetrievalPort {
  constructor(
    private readonly pages: Record<string, FixturePage>,
    private readonly dns: DnsResolverPort = new StaticDnsResolver(),
  ) {}

  async retrieve(
    url: string,
    options: { timeoutMs: number; maxBytes: number },
  ): Promise<RetrievalResponse> {
    void options.timeoutMs;
    const check = validateRetrievalUrl(url);
    if (!check.ok) {
      throw Object.assign(new Error(check.message), { code: check.code });
    }

    const resolved = await this.dns.resolve(check.hostname);
    const dest = validateResolvedDestination(check.hostname, resolved);
    if (!dest.ok) {
      throw Object.assign(new Error(dest.message), { code: dest.code });
    }

    const page = this.pages[url];
    if (!page) {
      throw Object.assign(new Error(`fixture miss for ${url}`), { code: 'fixture_miss' });
    }
    if (Buffer.byteLength(page.body, 'utf8') > options.maxBytes) {
      throw Object.assign(new Error('response too large'), { code: 'oversized_response' });
    }

    // Validate redirect chain destinations at the boundary as well.
    for (let i = 0; i < (page.redirectChain?.length ?? 0); i++) {
      const hop = page.redirectChain![i]!;
      const hopCheck = validateRetrievalUrl(hop);
      if (!hopCheck.ok) {
        throw Object.assign(new Error(hopCheck.message), { code: hopCheck.code });
      }
      const hopResolved = await this.dns.resolve(hopCheck.hostname);
      const hopDest = validateResolvedDestination(hopCheck.hostname, hopResolved);
      if (!hopDest.ok) {
        throw Object.assign(new Error(hopDest.message), { code: hopDest.code });
      }
    }

    return {
      finalUrl: page.redirectChain?.at(-1) ?? url,
      status: page.status ?? 200,
      contentType: page.contentType ?? 'text/html; charset=utf-8',
      body: page.body,
      etag: page.etag ?? null,
      lastModified: page.lastModified ?? null,
      redirectChain: page.redirectChain ?? [],
    };
  }
}
