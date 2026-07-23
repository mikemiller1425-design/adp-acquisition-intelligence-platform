import type { ReportingAuthorizationScope, ReportingRole } from '@adp/reporting';

export type WebSession = {
  userId: string;
  displayName: string;
  roles: readonly ReportingRole[];
  territoryIds: readonly string[];
  viewAllTerritories: boolean;
  timezone: string;
};

const DEFAULT_TIMEZONE = 'America/New_York';

function parseRoles(raw: string | undefined): ReportingRole[] {
  if (!raw) return ['admin', 'sales', 'reviewer'];
  const roles = raw
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean) as ReportingRole[];
  return roles.length > 0 ? roles : ['viewer'];
}

export function getWebSession(): WebSession {
  const userId = process.env.ADP_WEB_USER_ID ?? 'demo-user-001';
  const displayName = process.env.ADP_WEB_USER_NAME ?? 'Demo Operator';
  const roles = parseRoles(process.env.ADP_WEB_USER_ROLES);
  const territoryIds = (process.env.ADP_WEB_TERRITORY_IDS ?? 'territory-east')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const viewAllTerritories =
    process.env.ADP_WEB_VIEW_ALL_TERRITORIES === 'true' || roles.includes('admin');
  const timezone = process.env.ADP_WEB_TIMEZONE ?? DEFAULT_TIMEZONE;

  return {
    userId,
    displayName,
    roles,
    territoryIds,
    viewAllTerritories,
    timezone,
  };
}

export function toReportingScope(session: WebSession): ReportingAuthorizationScope {
  return {
    userId: session.userId,
    roles: session.roles,
    territoryIds: session.territoryIds,
    viewAllTerritories: session.viewAllTerritories,
  };
}

export function getAppEnvironment(): string {
  return process.env.ADP_ENV ?? process.env.NODE_ENV ?? 'development';
}

export function isProductionEnvironment(): boolean {
  return getAppEnvironment() === 'production';
}

export function roleCanAccess(
  roles: readonly ReportingRole[],
  required: readonly ReportingRole[],
): boolean {
  if (roles.includes('admin')) return true;
  return required.some((role) => roles.includes(role));
}
