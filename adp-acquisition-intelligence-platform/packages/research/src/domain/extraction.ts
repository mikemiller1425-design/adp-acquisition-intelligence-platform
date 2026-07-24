export const EXTRACTOR_VERSION = 'structured-extractor-v1';
export const MAPPING_VERSION = 'claim-variable-mapping-v1';

export type ExtractedClaimProposal = {
  variableKey: string;
  originalExcerpt: string;
  proposedValue: unknown;
  confidenceComponents: {
    sourceReliability: number;
    extractionCertainty: number;
    corroboration: number;
  };
  explanation: string;
  affectedCompletenessPurposes: string[];
  affectedScores: string[];
};

const SERVICE_PATTERNS: Array<{ re: RegExp; variableKey: string; value: unknown; label: string }> =
  [
    {
      re: /\bpayroll\b/i,
      variableKey: 'services.payroll_offered',
      value: true,
      label: 'Payroll offered',
    },
    {
      re: /\bbookkeeping\b/i,
      variableKey: 'services.bookkeeping_offered',
      value: true,
      label: 'Bookkeeping offered',
    },
    {
      re: /\bclient accounting services\b|\b\bcas\b/i,
      variableKey: 'services.cas_offered',
      value: true,
      label: 'CAS offered',
    },
    {
      re: /\bfractional cfo\b/i,
      variableKey: 'services.fractional_cfo_offered',
      value: true,
      label: 'Fractional CFO offered',
    },
    {
      re: /\bhr advisory\b|\bhuman resources advisory\b/i,
      variableKey: 'services.hr_advisory_offered',
      value: true,
      label: 'HR advisory offered',
    },
    {
      re: /\bbenefits advisory\b/i,
      variableKey: 'services.benefits_advisory_offered',
      value: true,
      label: 'Benefits advisory offered',
    },
  ];

/** Strip scripts/styles/forms — treat content as hostile. Never execute JS. */
export function sanitizeHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return blocks;
}

export function extractClaimsFromHtml(html: string): ExtractedClaimProposal[] {
  const text = sanitizeHtmlToText(html);
  const claims: ExtractedClaimProposal[] = [];
  const jsonLd = extractJsonLdBlocks(html);
  for (const block of jsonLd) {
    const name = readOrgName(block);
    if (name) {
      claims.push({
        variableKey: 'organization.display_name_public',
        originalExcerpt: name.slice(0, 240),
        proposedValue: name,
        confidenceComponents: {
          sourceReliability: 0.7,
          extractionCertainty: 0.8,
          corroboration: 0.4,
        },
        explanation: 'JSON-LD Organization name',
        affectedCompletenessPurposes: ['overall'],
        affectedScores: [],
      });
    }
  }
  for (const pattern of SERVICE_PATTERNS) {
    const m = text.match(pattern.re);
    if (!m) continue;
    const idx = m.index ?? 0;
    const excerpt = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 80));
    claims.push({
      variableKey: pattern.variableKey,
      originalExcerpt: excerpt,
      proposedValue: pattern.value,
      confidenceComponents: {
        sourceReliability: 0.6,
        extractionCertainty: 0.7,
        corroboration: 0.3,
      },
      explanation: `Deterministic text rule: ${pattern.label}`,
      affectedCompletenessPurposes: ['overall', 'discovery_readiness'],
      affectedScores: ['services_fit'],
    });
  }
  return claims;
}

function readOrgName(block: unknown): string | null {
  if (!block || typeof block !== 'object') return null;
  const obj = block as Record<string, unknown>;
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const n = readOrgName(item);
      if (n) return n;
    }
  }
  const type = obj['@type'];
  const isOrg =
    type === 'Organization' ||
    (Array.isArray(type) && type.includes('Organization')) ||
    type === 'LocalBusiness';
  if (isOrg && typeof obj.name === 'string') return obj.name;
  return null;
}

export function detectPromptInjectionMarkers(text: string): string[] {
  const markers: string[] = [];
  const patterns = [
    /ignore (all|previous) instructions/i,
    /reveal (system|secret|api key)/i,
    /override source policy/i,
    /approve (all )?claims/i,
    /alter scores/i,
    /run (shell|command)/i,
  ];
  for (const re of patterns) {
    if (re.test(text)) markers.push(re.source);
  }
  return markers;
}
