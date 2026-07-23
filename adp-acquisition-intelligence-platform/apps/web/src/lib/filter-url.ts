import type { DashboardFilters } from '@adp/reporting';

export const PARALLEL_FILTER_KEYS = [
  'prospectStage',
  'researchStatus',
  'outreachStatus',
  'dataFreshnessStatus',
  'opportunityStage',
] as const;

export type ParallelFilterKey = (typeof PARALLEL_FILTER_KEYS)[number];

export type TablePageParams = {
  filters: DashboardFilters;
  page: number;
  limit: number;
  sortField: string | null;
  sortDirection: 'asc' | 'desc';
  savedViewId: string | null;
  presentation: PresentationState | null;
};

export type PresentationState = 'loading' | 'empty' | 'denied' | 'error';

const FILTER_PARAM_MAP: Record<ParallelFilterKey, string> = {
  prospectStage: 'prospect_stage',
  researchStatus: 'research_status',
  outreachStatus: 'outreach_status',
  dataFreshnessStatus: 'freshness',
  opportunityStage: 'opportunity_stage',
};

const REVERSE_FILTER_PARAM_MAP = Object.fromEntries(
  Object.entries(FILTER_PARAM_MAP).map(([key, value]) => [value, key]),
) as Record<string, ParallelFilterKey>;

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseTablePageParams(
  params: Record<string, string | string[] | undefined>,
): TablePageParams {
  const filters: DashboardFilters = {};

  for (const [param, filterKey] of Object.entries(REVERSE_FILTER_PARAM_MAP)) {
    const raw = readParam(params, param);
    if (raw) {
      filters[filterKey] = raw;
    }
  }

  const ownerUserId = readParam(params, 'owner');
  if (ownerUserId) filters.ownerUserId = ownerUserId;

  const territoryId = readParam(params, 'territory');
  if (territoryId) filters.territoryId = territoryId;

  const firmType = readParam(params, 'firm_type');
  if (firmType) filters.firmType = firmType;

  const motion = readParam(params, 'motion');
  if (motion) filters.motion = motion;

  const dateFrom = readParam(params, 'date_from');
  if (dateFrom) filters.dateFrom = new Date(dateFrom);

  const dateTo = readParam(params, 'date_to');
  if (dateTo) filters.dateTo = new Date(dateTo);

  const page = readPositiveInt(readParam(params, 'page'), 1);
  const limit = Math.min(readPositiveInt(readParam(params, 'limit'), 25), 100);
  const sortField = readParam(params, 'sort') ?? null;
  const sortDirection = readParam(params, 'sort_dir') === 'desc' ? 'desc' : 'asc';
  const savedViewId = readParam(params, 'saved_view') ?? null;
  const presentationRaw = readParam(params, 'state');
  const presentation =
    presentationRaw === 'loading' ||
    presentationRaw === 'empty' ||
    presentationRaw === 'denied' ||
    presentationRaw === 'error'
      ? presentationRaw
      : null;

  return {
    filters,
    page,
    limit,
    sortField,
    sortDirection,
    savedViewId,
    presentation,
  };
}

export function buildFilterSearchParams(filters: DashboardFilters): URLSearchParams {
  const search = new URLSearchParams();

  for (const key of PARALLEL_FILTER_KEYS) {
    const value = filters[key];
    if (value === undefined) continue;
    const param = FILTER_PARAM_MAP[key];
    if (Array.isArray(value)) {
      if (value[0]) search.set(param, value[0]);
    } else if (typeof value === 'string') {
      search.set(param, value);
    }
  }

  if (filters.ownerUserId) search.set('owner', filters.ownerUserId);
  if (filters.territoryId) search.set('territory', filters.territoryId);
  if (filters.firmType) search.set('firm_type', filters.firmType);
  if (filters.motion) search.set('motion', filters.motion);
  if (filters.dateFrom) search.set('date_from', filters.dateFrom.toISOString().slice(0, 10));
  if (filters.dateTo) search.set('date_to', filters.dateTo.toISOString().slice(0, 10));

  return search;
}

export function serializeTablePageParams(input: {
  filters?: DashboardFilters;
  page?: number;
  limit?: number;
  sortField?: string | null;
  sortDirection?: 'asc' | 'desc';
  savedViewId?: string | null;
}): string {
  const search = buildFilterSearchParams(input.filters ?? {});
  if (input.page && input.page > 1) search.set('page', String(input.page));
  if (input.limit && input.limit !== 25) search.set('limit', String(input.limit));
  if (input.sortField) search.set('sort', input.sortField);
  if (input.sortDirection) search.set('sort_dir', input.sortDirection);
  if (input.savedViewId) search.set('saved_view', input.savedViewId);
  const query = search.toString();
  return query ? `?${query}` : '';
}
