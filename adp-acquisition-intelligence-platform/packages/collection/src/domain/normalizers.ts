export const NORMALIZER_VERSION = 'collection-normalizers-v1';

export type Normalized<T> = {
  original: string | null;
  normalized: T | null;
  normalizerVersion: typeof NORMALIZER_VERSION;
};

export type NormalizedRange = {
  min: number | null;
  max: number | null;
};

const legalSuffixes = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'plc',
  'pc',
  'pllc',
]);

const stateMap = new Map<string, string>([
  ['alabama', 'AL'],
  ['alaska', 'AK'],
  ['arizona', 'AZ'],
  ['arkansas', 'AR'],
  ['california', 'CA'],
  ['colorado', 'CO'],
  ['connecticut', 'CT'],
  ['delaware', 'DE'],
  ['district of columbia', 'DC'],
  ['florida', 'FL'],
  ['georgia', 'GA'],
  ['hawaii', 'HI'],
  ['idaho', 'ID'],
  ['illinois', 'IL'],
  ['indiana', 'IN'],
  ['iowa', 'IA'],
  ['kansas', 'KS'],
  ['kentucky', 'KY'],
  ['louisiana', 'LA'],
  ['maine', 'ME'],
  ['maryland', 'MD'],
  ['massachusetts', 'MA'],
  ['michigan', 'MI'],
  ['minnesota', 'MN'],
  ['mississippi', 'MS'],
  ['missouri', 'MO'],
  ['montana', 'MT'],
  ['nebraska', 'NE'],
  ['nevada', 'NV'],
  ['new hampshire', 'NH'],
  ['new jersey', 'NJ'],
  ['new mexico', 'NM'],
  ['new york', 'NY'],
  ['north carolina', 'NC'],
  ['north dakota', 'ND'],
  ['ohio', 'OH'],
  ['oklahoma', 'OK'],
  ['oregon', 'OR'],
  ['pennsylvania', 'PA'],
  ['rhode island', 'RI'],
  ['south carolina', 'SC'],
  ['south dakota', 'SD'],
  ['tennessee', 'TN'],
  ['texas', 'TX'],
  ['utah', 'UT'],
  ['vermont', 'VT'],
  ['virginia', 'VA'],
  ['washington', 'WA'],
  ['west virginia', 'WV'],
  ['wisconsin', 'WI'],
  ['wyoming', 'WY'],
]);

const countryMap = new Map<string, string>([
  ['united states', 'US'],
  ['united states of america', 'US'],
  ['usa', 'US'],
  ['us', 'US'],
  ['canada', 'CA'],
  ['ca', 'CA'],
]);

const firmTypeMap = new Map<string, string>([
  ['association', 'association'],
  ['association management company', 'amc'],
  ['amc', 'amc'],
  ['management company', 'management_company'],
  ['vendor', 'vendor'],
  ['developer', 'developer'],
  ['law firm', 'law_firm'],
]);

const contactRoleMap = new Map<string, string>([
  ['ceo', 'executive'],
  ['chief executive officer', 'executive'],
  ['owner', 'owner'],
  ['president', 'executive'],
  ['property manager', 'property_manager'],
  ['community manager', 'community_manager'],
  ['board member', 'board_member'],
  ['director', 'director'],
]);

export function normalizeUnicodeWhitespace(value: string | null | undefined): Normalized<string> {
  const original = value ?? null;
  const normalized =
    original === null
      ? null
      : original
          .normalize('NFKC')
          .replace(/\p{White_Space}+/gu, ' ')
          .trim();
  return wrap(original, normalized === '' ? null : normalized);
}

export function normalizeOrgName(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return cleaned;
  const tokens = cleaned.normalized
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/\.$/, ''))
    .filter(Boolean);
  while (tokens.length > 1 && legalSuffixes.has(tokens[tokens.length - 1] as string)) {
    tokens.pop();
  }
  return wrap(cleaned.original, tokens.join(' '));
}

export function normalizeLegalSuffix(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return cleaned;
  const suffix = cleaned.normalized.toLowerCase().replace(/\./g, '');
  return wrap(cleaned.original, legalSuffixes.has(suffix) ? suffix : null);
}

export function normalizeDomain(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  const candidate = cleaned.normalized.includes('://')
    ? cleaned.normalized
    : `https://${cleaned.normalized}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return wrap(cleaned.original, host === '' ? null : host);
  } catch {
    const stripped = cleaned.normalized
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    return wrap(cleaned.original, /^[a-z0-9.-]+\.[a-z]{2,}$/.test(stripped) ? stripped : null);
  }
}

export function normalizeUrl(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  try {
    const url = new URL(
      cleaned.normalized.includes('://') ? cleaned.normalized : `https://${cleaned.normalized}`,
    );
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return wrap(cleaned.original, url.toString().replace(/\/$/, ''));
  } catch {
    return wrap<string>(cleaned.original, null);
  }
}

export function normalizeEmail(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  const normalized = cleaned.normalized.toLowerCase();
  return wrap(cleaned.original, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null);
}

export function normalizePhone(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  const prefixed = cleaned.normalized.trim().startsWith('+');
  const digits = cleaned.normalized.replace(/\D/g, '');
  if (digits.length === 10) return wrap(cleaned.original, `+1${digits}`);
  if (digits.length >= 8 && digits.length <= 15)
    return wrap(cleaned.original, prefixed ? `+${digits}` : digits);
  return wrap<string>(cleaned.original, null);
}

export function normalizeAddress(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return cleaned;
  return wrap(
    cleaned.original,
    cleaned.normalized
      .toLowerCase()
      .replace(/\b(street)\b/g, 'st')
      .replace(/\b(avenue)\b/g, 'ave')
      .replace(/\b(suite)\b/g, 'ste')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function normalizeState(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  const lower = cleaned.normalized.toLowerCase();
  if (/^[a-z]{2}$/i.test(cleaned.normalized))
    return wrap(cleaned.original, cleaned.normalized.toUpperCase());
  return wrap(cleaned.original, stateMap.get(lower) ?? null);
}

export function normalizeCountry(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  const lower = cleaned.normalized.toLowerCase();
  if (/^[a-z]{2}$/i.test(cleaned.normalized))
    return wrap(cleaned.original, cleaned.normalized.toUpperCase());
  return wrap(cleaned.original, countryMap.get(lower) ?? null);
}

export function normalizeEnum(
  value: string | null | undefined,
  allowedValues: readonly string[],
): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  const lower = cleaned.normalized.toLowerCase().replace(/[\s-]+/g, '_');
  const match = allowedValues.find((allowed) => allowed.toLowerCase() === lower);
  return wrap(cleaned.original, match ?? null);
}

export function normalizeBoolean(value: string | null | undefined): Normalized<boolean> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<boolean>(cleaned.original, null);
  const lower = cleaned.normalized.toLowerCase();
  if (['true', 't', 'yes', 'y', '1'].includes(lower)) return wrap(cleaned.original, true);
  if (['false', 'f', 'no', 'n', '0'].includes(lower)) return wrap(cleaned.original, false);
  return wrap<boolean>(cleaned.original, null);
}

export function normalizeDate(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  const parsed = new Date(cleaned.normalized);
  if (Number.isNaN(parsed.getTime())) return wrap<string>(cleaned.original, null);
  return wrap(cleaned.original, parsed.toISOString().slice(0, 10));
}

export function normalizeNumber(value: string | null | undefined): Normalized<number> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<number>(cleaned.original, null);
  const parsed = Number(cleaned.normalized.replace(/,/g, ''));
  return wrap(cleaned.original, Number.isFinite(parsed) ? parsed : null);
}

export function normalizePercentage(value: string | null | undefined): Normalized<number> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<number>(cleaned.original, null);
  const raw = cleaned.normalized.replace('%', '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return wrap<number>(cleaned.original, null);
  return wrap(cleaned.original, parsed > 1 ? parsed / 100 : parsed);
}

export function normalizeCurrency(value: string | null | undefined): Normalized<number> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<number>(cleaned.original, null);
  const parsed = Number(cleaned.normalized.replace(/[$,\s]/g, ''));
  return wrap(cleaned.original, Number.isFinite(parsed) ? parsed : null);
}

export function normalizeRange(value: string | null | undefined): Normalized<NormalizedRange> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<NormalizedRange>(cleaned.original, null);
  const parts = cleaned.normalized
    .replace(/[–—]/g, '-')
    .split(/\s*(?:-|to)\s*/i)
    .map((part) => Number(part.replace(/[$,%\s,]/g, '')))
    .filter((part) => Number.isFinite(part));
  if (parts.length === 1)
    return wrap(cleaned.original, { min: parts[0] as number, max: parts[0] as number });
  if (parts.length >= 2)
    return wrap(cleaned.original, { min: parts[0] as number, max: parts[1] as number });
  return wrap<NormalizedRange>(cleaned.original, null);
}

export function normalizeFirmType(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  return wrap(cleaned.original, firmTypeMap.get(cleaned.normalized.toLowerCase()) ?? null);
}

export function normalizeContactRole(value: string | null | undefined): Normalized<string> {
  const cleaned = normalizeUnicodeWhitespace(value);
  if (cleaned.normalized === null) return wrap<string>(cleaned.original, null);
  return wrap(
    cleaned.original,
    contactRoleMap.get(cleaned.normalized.toLowerCase()) ?? cleaned.normalized.toLowerCase(),
  );
}

function wrap<T>(original: string | null, normalized: T | null): Normalized<T> {
  return { original, normalized, normalizerVersion: NORMALIZER_VERSION };
}
