import { isIP } from 'node:net';
import { parse as parseDomain } from 'tldts';

export type UrlValidationResult =
  | { ok: true; url: URL; hostname: string }
  | { ok: false; code: string; message: string };

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata']);

export function isPrivateOrReservedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 0) return false;
  if (v === 4) {
    const parts = ip.split('.').map(Number);
    const [a = 0, b = 0] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  if (normalized.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(normalized.slice('::ffff:'.length));
  }
  return false;
}

export function validateRetrievalUrl(
  raw: string,
  options: { allowedProtocols?: readonly string[]; allowCredentials?: boolean } = {},
): UrlValidationResult {
  const allowedProtocols = options.allowedProtocols ?? ['http:', 'https:'];
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: 'malformed_url', message: 'URL could not be parsed' };
  }
  if (!allowedProtocols.includes(url.protocol)) {
    return {
      ok: false,
      code: 'unsupported_protocol',
      message: `Protocol ${url.protocol} not allowed`,
    };
  }
  if (!options.allowCredentials && (url.username || url.password)) {
    return {
      ok: false,
      code: 'credential_bearing_url',
      message: 'Credential-bearing URLs are blocked',
    };
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname) {
    return { ok: false, code: 'missing_hostname', message: 'Hostname required' };
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, code: 'blocked_hostname', message: `Hostname ${hostname} is blocked` };
  }
  if (hostname === '169.254.169.254' || hostname.endsWith('.internal')) {
    return { ok: false, code: 'cloud_metadata', message: 'Cloud metadata endpoints are blocked' };
  }
  if (isIP(hostname) && isPrivateOrReservedIp(hostname)) {
    return {
      ok: false,
      code: 'private_network',
      message: `Private/reserved address ${hostname} blocked`,
    };
  }
  return { ok: true, url, hostname };
}

export function validateResolvedDestination(
  hostname: string,
  resolvedAddresses: readonly string[],
): UrlValidationResult {
  if (resolvedAddresses.length === 0) {
    return {
      ok: false,
      code: 'dns_resolution_empty',
      message: `No addresses resolved for ${hostname}`,
    };
  }
  for (const addr of resolvedAddresses) {
    if (isPrivateOrReservedIp(addr)) {
      return {
        ok: false,
        code: 'dns_rebinding_or_private',
        message: `Resolved address ${addr} for ${hostname} is private/reserved`,
      };
    }
  }
  return { ok: true, url: new URL(`https://${hostname}`), hostname };
}

export function validateRedirectTarget(
  fromUrl: string,
  toUrl: string,
  policy:
    | 'same_host'
    | 'same_registrable_domain'
    | 'https_only_upgrade' = 'same_registrable_domain',
): UrlValidationResult {
  const from = validateRetrievalUrl(fromUrl);
  const to = validateRetrievalUrl(toUrl);
  if (!from.ok) return from;
  if (!to.ok) return to;
  if (policy === 'same_host' && from.hostname !== to.hostname) {
    return { ok: false, code: 'redirect_host_escape', message: 'Redirect changed host' };
  }
  if (policy === 'same_registrable_domain') {
    const a = registrableDomain(from.hostname);
    const b = registrableDomain(to.hostname);
    if (!a || !b || a !== b) {
      return {
        ok: false,
        code: 'redirect_domain_escape',
        message: 'Redirect left public-suffix registrable domain',
      };
    }
  }
  return to;
}

/** Public-suffix-aware registrable domain (eTag e.g. example.co.uk → example.co.uk). */
export function registrableDomain(hostname: string): string | null {
  const parsed = parseDomain(hostname, { allowPrivateDomains: true });
  if (!parsed.domain) return null;
  return parsed.domain.toLowerCase();
}

export function safeStorageObjectKey(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\./g, '_');
  if (cleaned.includes('..') || cleaned.startsWith('/')) {
    throw new Error('Unsafe object key');
  }
  return cleaned.slice(0, 512);
}

export type DnsResolverPort = {
  resolve(hostname: string): Promise<string[]>;
};

/** Fixture/CI resolver: never returns private addresses for public hostnames. */
export class StaticDnsResolver implements DnsResolverPort {
  constructor(private readonly map: Record<string, string[]> = {}) {}

  async resolve(hostname: string): Promise<string[]> {
    if (isIP(hostname)) return [hostname];
    if (this.map[hostname]) return this.map[hostname]!;
    // Deterministic public placeholder — retrieval still uses fixtures; validates DNS gate path.
    return ['203.0.113.10'];
  }
}
