import {
  normalizeAddress,
  normalizeDomain,
  normalizeOrgName,
  normalizePhone,
} from './normalizers.js';

export const MATCH_POLICY_VERSION = 'collection-duplicate-match-v1';

export type DuplicateTier = 'none' | 'possible' | 'likely' | 'exact';

export type DuplicateInput = {
  externalId?: string | null;
  displayName?: string | null;
  legalName?: string | null;
  domain?: string | null;
  aliases?: readonly string[];
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  contactEmails?: readonly string[];
  contactPhones?: readonly string[];
};

export type DuplicateCandidate = DuplicateInput & {
  organizationId: string;
};

export type DuplicateSignal = {
  key:
    | 'normalized_domain'
    | 'legal_name'
    | 'external_id'
    | 'name_address'
    | 'name_phone'
    | 'aliases'
    | 'shared_location'
    | 'contact_overlap';
  matched: boolean;
  weight: number;
  explanation: string;
};

export type DuplicateMatchResult = {
  candidateOrganizationId: string;
  features: DuplicateSignal[];
  tier: DuplicateTier;
  explanation: string;
  matchPolicyVersion: typeof MATCH_POLICY_VERSION;
};

export function matchDuplicateCandidate(
  incoming: DuplicateInput,
  candidate: DuplicateCandidate,
): DuplicateMatchResult {
  const features: DuplicateSignal[] = [
    signal(
      'normalized_domain',
      normalizeDomain(incoming.domain).normalized !== null &&
        normalizeDomain(incoming.domain).normalized ===
          normalizeDomain(candidate.domain).normalized,
      40,
      'Same normalized internet domain',
    ),
    signal(
      'external_id',
      presentEqual(incoming.externalId, candidate.externalId),
      45,
      'Same source external identifier',
    ),
    signal(
      'legal_name',
      normalizedName(incoming.legalName ?? incoming.displayName) !== null &&
        normalizedName(incoming.legalName ?? incoming.displayName) ===
          normalizedName(candidate.legalName ?? candidate.displayName),
      30,
      'Same normalized legal/display name',
    ),
    signal(
      'name_address',
      sameName(incoming, candidate) && sameAddress(incoming, candidate),
      25,
      'Same normalized name and address',
    ),
    signal(
      'name_phone',
      sameName(incoming, candidate) &&
        normalizePhone(incoming.phone).normalized !== null &&
        normalizePhone(incoming.phone).normalized === normalizePhone(candidate.phone).normalized,
      20,
      'Same normalized name and phone',
    ),
    signal('aliases', aliasOverlap(incoming, candidate), 15, 'Incoming name matches a known alias'),
    signal('shared_location', sameAddress(incoming, candidate), 10, 'Shared normalized location'),
    signal(
      'contact_overlap',
      contactOverlap(incoming, candidate),
      20,
      'Overlapping contact email or phone',
    ),
  ];
  const score = features.reduce((sum, feature) => sum + (feature.matched ? feature.weight : 0), 0);
  const tier: DuplicateTier =
    features.some(
      (feature) => feature.matched && ['external_id', 'normalized_domain'].includes(feature.key),
    ) && score >= 40
      ? 'exact'
      : score >= 55
        ? 'likely'
        : score >= 25
          ? 'possible'
          : 'none';
  const matched = features.filter((feature) => feature.matched).map((feature) => feature.key);
  return {
    candidateOrganizationId: candidate.organizationId,
    features,
    tier,
    explanation:
      matched.length === 0
        ? 'No duplicate signals matched'
        : `Matched duplicate signals: ${matched.join(', ')}`,
    matchPolicyVersion: MATCH_POLICY_VERSION,
  };
}

export function findDuplicateCandidates(
  incoming: DuplicateInput,
  candidates: readonly DuplicateCandidate[],
): DuplicateMatchResult[] {
  return candidates
    .map((candidate) => matchDuplicateCandidate(incoming, candidate))
    .filter((result) => result.tier !== 'none')
    .sort((left, right) => tierRank(right.tier) - tierRank(left.tier));
}

function signal(
  key: DuplicateSignal['key'],
  matched: boolean,
  weight: number,
  explanation: string,
): DuplicateSignal {
  return { key, matched, weight, explanation };
}

function normalizedName(value: string | null | undefined): string | null {
  return normalizeOrgName(value).normalized;
}

function sameName(left: DuplicateInput, right: DuplicateInput): boolean {
  const leftName = normalizedName(left.legalName ?? left.displayName);
  const rightName = normalizedName(right.legalName ?? right.displayName);
  return leftName !== null && leftName === rightName;
}

function sameAddress(left: DuplicateInput, right: DuplicateInput): boolean {
  const leftAddress = [
    normalizeAddress(left.addressLine1).normalized,
    left.city?.trim().toLowerCase() ?? null,
    left.region?.trim().toLowerCase() ?? null,
    left.postalCode?.replace(/\s/g, '').toLowerCase() ?? null,
  ]
    .filter(Boolean)
    .join('|');
  const rightAddress = [
    normalizeAddress(right.addressLine1).normalized,
    right.city?.trim().toLowerCase() ?? null,
    right.region?.trim().toLowerCase() ?? null,
    right.postalCode?.replace(/\s/g, '').toLowerCase() ?? null,
  ]
    .filter(Boolean)
    .join('|');
  return leftAddress !== '' && leftAddress === rightAddress;
}

function aliasOverlap(left: DuplicateInput, right: DuplicateInput): boolean {
  const leftNames = new Set(
    [left.displayName, left.legalName, ...(left.aliases ?? [])]
      .map((value) => normalizedName(value))
      .filter((value): value is string => value !== null),
  );
  return [right.displayName, right.legalName, ...(right.aliases ?? [])]
    .map((value) => normalizedName(value))
    .some((value) => value !== null && leftNames.has(value));
}

function contactOverlap(left: DuplicateInput, right: DuplicateInput): boolean {
  const emails = new Set((left.contactEmails ?? []).map((email) => email.trim().toLowerCase()));
  const phones = new Set(
    (left.contactPhones ?? [])
      .map((phone) => normalizePhone(phone).normalized)
      .filter((phone): phone is string => phone !== null),
  );
  return (
    (right.contactEmails ?? []).some((email) => emails.has(email.trim().toLowerCase())) ||
    (right.contactPhones ?? []).some((phone) => {
      const normalized = normalizePhone(phone).normalized;
      return normalized !== null && phones.has(normalized);
    })
  );
}

function presentEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  return left !== undefined && left !== null && left.trim() !== '' && left.trim() === right?.trim();
}

function tierRank(tier: DuplicateTier): number {
  switch (tier) {
    case 'exact':
      return 4;
    case 'likely':
      return 3;
    case 'possible':
      return 2;
    case 'none':
      return 1;
  }
}
