import { validateRetrievalUrl, isPrivateOrReservedIp } from '../domain/network-security.js';
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
 * Keys are full URLs.
 */
export class FixtureRetrievalPort implements RetrievalPort {
  constructor(private readonly pages: Record<string, FixturePage>) {}

  async retrieve(
    url: string,
    options: { timeoutMs: number; maxBytes: number },
  ): Promise<RetrievalResponse> {
    void options.timeoutMs;
    const check = validateRetrievalUrl(url);
    if (!check.ok) {
      throw Object.assign(new Error(check.message), { code: check.code });
    }
    // Defense in depth: never allow IP-literal private targets even in fixtures map miss paths
    if (isPrivateOrReservedIp(check.hostname)) {
      throw Object.assign(new Error('private network blocked'), { code: 'private_network' });
    }
    const page = this.pages[url];
    if (!page) {
      throw Object.assign(new Error(`fixture miss for ${url}`), { code: 'fixture_miss' });
    }
    if (Buffer.byteLength(page.body, 'utf8') > options.maxBytes) {
      throw Object.assign(new Error('response too large'), { code: 'oversized_response' });
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
