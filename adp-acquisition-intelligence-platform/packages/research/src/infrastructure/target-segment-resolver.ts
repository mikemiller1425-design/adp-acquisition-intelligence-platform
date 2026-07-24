import {
  organizationLocations,
  organizations,
  territories,
  type RepositoryExecutor,
} from '@adp/database';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Known saved target segments for Phase 1.2 fixture pilot.
 * Unknown segment keys → target_segment_not_found.
 */
export const KNOWN_TARGET_SEGMENTS: Record<
  string,
  { description: string; firmTypes?: string[]; territoryCodes?: string[] }
> = {
  'pilot-accounting-segment': {
    description: 'Pilot universe — all seeded organizations',
  },
  'pilot-northeast-segment': {
    description: 'Northeast territory organizations',
    territoryCodes: ['NE'],
  },
  'pilot-southeast-segment': {
    description: 'Southeast territory organizations',
    territoryCodes: ['SE'],
  },
};

export type ResolvedTarget = {
  organizationId: string;
  canonicalDomain: string | null;
  displayName: string;
};

export type TargetSegmentResolution =
  | { ok: true; targets: ResolvedTarget[]; segmentKey: string }
  | { ok: false; code: 'target_segment_not_found' | 'target_segment_empty'; message: string };

export async function resolveOrganizationsForSegment(
  db: RepositoryExecutor,
  input: {
    segmentKey: string;
    maxOrganizations: number;
    organizationType?: string | null;
    territory?: string | null;
  },
): Promise<TargetSegmentResolution> {
  const segment = KNOWN_TARGET_SEGMENTS[input.segmentKey];
  if (!segment) {
    return {
      ok: false,
      code: 'target_segment_not_found',
      message: `Saved target segment “${input.segmentKey}” is not defined`,
    };
  }

  const firmTypes = input.organizationType ? [input.organizationType] : (segment.firmTypes ?? null);
  const territoryCodes = input.territory ? [input.territory] : (segment.territoryCodes ?? null);

  const limit = Math.max(1, input.maxOrganizations);
  const conditions = [eq(organizations.recordStatus, 'active')];
  if (firmTypes?.length) {
    conditions.push(inArray(organizations.firmType, firmTypes));
  }

  let rows: Array<{ id: string; displayName: string; domain: string | null }>;

  if (territoryCodes?.length) {
    rows = await db
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        domain: organizations.domain,
      })
      .from(organizations)
      .innerJoin(organizationLocations, eq(organizationLocations.organizationId, organizations.id))
      .innerJoin(territories, eq(territories.id, organizationLocations.territoryId))
      .where(and(...conditions, inArray(territories.code, territoryCodes)))
      .limit(limit);
  } else {
    rows = await db
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        domain: organizations.domain,
      })
      .from(organizations)
      .where(and(...conditions))
      .limit(limit);
  }

  if (!rows.length) {
    return {
      ok: false,
      code: 'target_segment_empty',
      message: `Segment “${input.segmentKey}” resolved to zero organizations`,
    };
  }

  return {
    ok: true,
    segmentKey: input.segmentKey,
    targets: rows.map((r) => ({
      organizationId: r.id,
      displayName: r.displayName,
      canonicalDomain: (r.domain ?? null)?.replace(/^www\./, '') ?? null,
    })),
  };
}
