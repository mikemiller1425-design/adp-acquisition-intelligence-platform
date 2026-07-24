export function normalizeWhitespace(value: string | null | undefined): string | null {
  if (value == null) return null;
  const out = value.replace(/\s+/g, ' ').trim();
  return out.length ? out : null;
}

export function normalizeOrgName(value: string | null | undefined): string | null {
  const base = normalizeWhitespace(value);
  if (!base) return null;
  return base
    .toLowerCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/\b(llc|inc|corp|co|ltd|llp|pc|pllc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (value == null) return null;
  let v = value.trim().toLowerCase();
  if (!v) return null;
  v =
    v
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0] ?? v;
  v = v.split(':')[0] ?? v;
  if (!v.includes('.') || v.includes(' ')) return null;
  return v;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = value.replace(/\D+/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function candidateIdentityKey(input: {
  domain?: string | null;
  legalName?: string | null;
  displayName?: string | null;
  externalId?: string | null;
  postalCode?: string | null;
}): string {
  const domain = normalizeDomain(input.domain);
  if (domain) return `domain:${domain}`;
  if (input.externalId) return `ext:${input.externalId.trim().toLowerCase()}`;
  const name = normalizeOrgName(input.legalName ?? input.displayName);
  const postal = normalizeWhitespace(input.postalCode)?.toLowerCase() ?? '';
  if (name) return `name:${name}|postal:${postal}`;
  return `anon:${cryptoRandom()}`;
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type PopulationRow = Record<string, unknown>;

export type NormalizedCandidate = {
  displayName: string | null;
  legalName: string | null;
  domain: string | null;
  website: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  externalId: string | null;
  aliases: string[];
  identityKey: string;
  validationErrors: string[];
};

export function normalizePopulationRow(
  row: PopulationRow,
  mapping: Record<string, string>,
): NormalizedCandidate {
  const get = (field: string): string | null => {
    const col = mapping[field];
    if (!col) return null;
    const raw = row[col];
    if (raw == null) return null;
    return normalizeWhitespace(String(raw));
  };
  const errors: string[] = [];
  const displayName = get('displayName');
  const legalName = get('legalName');
  const domain = normalizeDomain(get('domain') ?? get('website'));
  const website = get('website');
  if (!displayName && !legalName && !domain) {
    errors.push('missing_identity');
  }
  const phone = normalizePhone(get('phone'));
  const externalId = get('externalId');
  const aliases = (get('aliases') ?? '')
    .split('|')
    .map((a) => a.trim())
    .filter(Boolean);
  const postalCode = get('postalCode');
  const identityKey = candidateIdentityKey({
    domain,
    legalName,
    displayName,
    externalId,
    postalCode,
  });
  return {
    displayName,
    legalName,
    domain,
    website,
    phone,
    addressLine1: get('addressLine1'),
    city: get('city'),
    region: get('region'),
    postalCode,
    country: get('country'),
    externalId,
    aliases,
    identityKey,
    validationErrors: errors,
  };
}
