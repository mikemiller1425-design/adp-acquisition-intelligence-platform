import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  accountAssignments,
  auditEvents,
  contactChannelPermissions,
  contactRoles,
  contacts,
  createDatabaseClient,
  notes,
  operationalStateTransitions,
  organizationCommunicationRestrictions,
  organizationLocations,
  organizationRoles,
  organizations,
  outboxEvents,
  permissions,
  rolePermissions,
  roles,
  suppressionEntries,
  taggings,
  tags,
  tasks,
  territories,
  userRoles,
  users,
  type RepositoryExecutor,
} from '../src/index.js';
import { seedDiscoveryLibrary, type DiscoverySeedSummary } from './discovery.js';
import { seedOpportunityLibrary, type OpportunitySeedSummary } from './opportunities.js';
import { seedOutreachLibrary, type OutreachSeedSummary } from './outreach.js';
import { seedScoringDrafts, type ScoringSeedSummary } from './scoring.js';
import { seedVariables, type VariableSeedSummary } from './variables.js';

const DEFAULT_DATABASE_URL = 'postgres://adp:adp@localhost:5432/adp_acquisition';

const seedEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().url().default(DEFAULT_DATABASE_URL),
    ALLOW_PRODUCTION_SEED: z.string().optional(),
    NODE_ENV: z.string().optional(),
    APP_ENV: z.string().optional(),
  })
  .passthrough();

interface SeedSummary {
  users: number;
  roles: number;
  permissions: number;
  territories: number;
  organizations: number;
  contacts: number;
  tasks: number;
  tags: number;
  variables: VariableSeedSummary;
  scoring: ScoringSeedSummary;
  discovery: DiscoverySeedSummary;
  outreach: OutreachSeedSummary;
  opportunities: OpportunitySeedSummary;
}

interface SeedIds {
  users: Record<string, string>;
  roles: Record<string, string>;
  permissions: Record<string, string>;
  territories: Record<string, string>;
  organizations: Record<string, string>;
  locations: Record<string, string>;
  contacts: Record<string, string>;
  tags: Record<string, string>;
}

export async function runSeed(databaseUrl: string): Promise<SeedSummary> {
  assertSeedTargetIsSafe(databaseUrl);
  const client = createDatabaseClient(databaseUrl);

  try {
    return await client.withTransaction(async (tx) => {
      const ids: SeedIds = {
        users: await seedUsers(tx),
        roles: await seedRoles(tx),
        permissions: await seedPermissions(tx),
        territories: {},
        organizations: {},
        locations: {},
        contacts: {},
        tags: {},
      };

      await seedRolePermissions(tx, ids);
      await seedUserRoles(tx, ids);
      ids.territories = await seedTerritories(tx, ids);
      ids.organizations = await seedOrganizations(tx, ids);
      ids.locations = await seedLocations(tx, ids);
      ids.contacts = await seedContacts(tx, ids);
      await seedOrganizationRoles(tx, ids);
      await seedContactRoles(tx, ids);
      await seedAccountAssignments(tx, ids);
      await seedConsent(tx, ids);
      ids.tags = await seedTags(tx, ids);
      await seedTasksNotesAndTaggings(tx, ids);
      await seedOperationalTransitions(tx, ids);
      const variableSummary = await seedVariables(tx, ids);
      const scoringSummary = await seedScoringDrafts(tx);
      const discoverySummary = await seedDiscoveryLibrary(tx, required(ids.users, 'admin'));
      const outreachSummary = await seedOutreachLibrary(tx, required(ids.users, 'admin'));
      const opportunitySummary = await seedOpportunityLibrary(tx, required(ids.users, 'admin'));
      await seedAuditAndOutbox(tx, ids);

      return {
        users: Object.keys(ids.users).length,
        roles: Object.keys(ids.roles).length,
        permissions: Object.keys(ids.permissions).length,
        territories: Object.keys(ids.territories).length,
        organizations: Object.keys(ids.organizations).length,
        contacts: Object.keys(ids.contacts).length,
        tasks: 3,
        tags: Object.keys(ids.tags).length,
        variables: variableSummary,
        scoring: scoringSummary,
        discovery: discoverySummary,
        outreach: outreachSummary,
        opportunities: opportunitySummary,
      };
    });
  } finally {
    await client.close();
  }
}

async function seedUsers(db: RepositoryExecutor): Promise<Record<string, string>> {
  const specs = [
    {
      key: 'admin',
      externalSubjectId: 'seed-user-admin',
      email: 'admin@example.com',
      displayName: 'Avery Admin',
    },
    {
      key: 'researcher',
      externalSubjectId: 'seed-user-researcher',
      email: 'researcher@example.com',
      displayName: 'Riley Researcher',
    },
    {
      key: 'sales',
      externalSubjectId: 'seed-user-sales',
      email: 'sales@example.com',
      displayName: 'Sam Sales',
    },
    {
      key: 'reviewer',
      externalSubjectId: 'seed-user-reviewer',
      email: 'reviewer@example.com',
      displayName: 'Jordan Reviewer',
    },
  ];
  const ids: Record<string, string> = {};

  for (const spec of specs) {
    const row = first(
      await db
        .insert(users)
        .values({
          externalSubjectId: spec.externalSubjectId,
          email: spec.email,
          displayName: spec.displayName,
          status: 'active',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.externalSubjectId,
          set: {
            email: spec.email,
            displayName: spec.displayName,
            status: 'active',
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: users.id }),
      `user ${spec.key}`,
    );
    ids[spec.key] = row.id;
  }

  return ids;
}

async function seedRoles(db: RepositoryExecutor): Promise<Record<string, string>> {
  const specs = [
    ['admin', 'Admin', 'Full platform administration'],
    ['researcher', 'Researcher', 'Research and normalization workflow'],
    ['sales', 'Sales', 'Account ownership and sales workflow'],
    ['reviewer', 'Reviewer', 'Review and approval workflow'],
  ] as const;
  const ids: Record<string, string> = {};

  for (const [key, name, description] of specs) {
    const row = first(
      await db
        .insert(roles)
        .values({ key, name, description, status: 'active', updatedAt: new Date() })
        .onConflictDoUpdate({
          target: roles.key,
          set: { name, description, status: 'active', updatedAt: sql`now()` },
        })
        .returning({ id: roles.id }),
      `role ${key}`,
    );
    ids[key] = row.id;
  }

  return ids;
}

async function seedPermissions(db: RepositoryExecutor): Promise<Record<string, string>> {
  const specs = [
    ['users:manage', 'Manage users and role assignments'],
    ['organizations:read', 'Read organizations and related records'],
    ['organizations:write', 'Create and update organizations'],
    ['research:manage', 'Manage research workflow states'],
    ['sales:manage', 'Manage assignments and follow-up tasks'],
    ['review:approve', 'Approve review workflow decisions'],
    ['audit:read', 'Read audit history'],
  ] as const;
  const ids: Record<string, string> = {};

  for (const [key, description] of specs) {
    const row = first(
      await db
        .insert(permissions)
        .values({ key, description, status: 'active', updatedAt: new Date() })
        .onConflictDoUpdate({
          target: permissions.key,
          set: { description, status: 'active', updatedAt: sql`now()` },
        })
        .returning({ id: permissions.id }),
      `permission ${key}`,
    );
    ids[key] = row.id;
  }

  return ids;
}

async function seedRolePermissions(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const grants: Record<string, string[]> = {
    admin: Object.keys(ids.permissions),
    researcher: ['organizations:read', 'organizations:write', 'research:manage'],
    sales: ['organizations:read', 'sales:manage'],
    reviewer: ['organizations:read', 'review:approve', 'audit:read'],
  };

  for (const [roleKey, permissionKeys] of Object.entries(grants)) {
    for (const permissionKey of permissionKeys) {
      await db
        .insert(rolePermissions)
        .values({
          roleId: required(ids.roles, roleKey),
          permissionId: required(ids.permissions, permissionKey),
          grantedByUserId: required(ids.users, 'admin'),
        })
        .onConflictDoNothing({
          target: [rolePermissions.roleId, rolePermissions.permissionId],
        });
    }
  }
}

async function seedUserRoles(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const assignments = [
    ['admin', 'admin'],
    ['researcher', 'researcher'],
    ['sales', 'sales'],
    ['reviewer', 'reviewer'],
  ] as const;

  for (const [userKey, roleKey] of assignments) {
    await db
      .insert(userRoles)
      .values({
        userId: required(ids.users, userKey),
        roleId: required(ids.roles, roleKey),
        assignedByUserId: required(ids.users, 'admin'),
      })
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
  }
}

async function seedTerritories(
  db: RepositoryExecutor,
  ids: SeedIds,
): Promise<Record<string, string>> {
  const specs = [
    ['northeast', 'NE', 'Northeast', 'Northeast synthetic seed territory'],
    ['southeast', 'SE', 'Southeast', 'Southeast synthetic seed territory'],
  ] as const;
  const territoryIds: Record<string, string> = {};

  for (const [key, code, name, description] of specs) {
    const row = first(
      await db
        .insert(territories)
        .values({
          code,
          name,
          description,
          status: 'active',
          createdByUserId: required(ids.users, 'admin'),
          updatedByUserId: required(ids.users, 'admin'),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: territories.code,
          set: {
            name,
            description,
            status: 'active',
            updatedByUserId: required(ids.users, 'admin'),
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: territories.id }),
      `territory ${key}`,
    );
    territoryIds[key] = row.id;
  }

  return territoryIds;
}

async function seedOrganizations(
  db: RepositoryExecutor,
  ids: SeedIds,
): Promise<Record<string, string>> {
  const specs = [
    {
      key: 'atlas',
      displayName: 'Atlas Advisory Group',
      normalizedName: 'atlas advisory group',
      domain: 'atlas-advisory.example.com',
      normalizedDomain: 'atlas-advisory.example.com',
      firmType: 'ria',
      prospectStage: 'research' as const,
      researchStatus: 'in_progress' as const,
      outreachStatus: 'not_started' as const,
      dataFreshnessStatus: 'current' as const,
      existingRelationshipFlag: false,
    },
    {
      key: 'brightside',
      displayName: 'Brightside Capital Partners',
      normalizedName: 'brightside capital partners',
      domain: 'brightside-capital.example.com',
      normalizedDomain: 'brightside-capital.example.com',
      firmType: 'broker_dealer',
      prospectStage: 'qualified' as const,
      researchStatus: 'sufficient_for_purpose' as const,
      outreachStatus: 'ready' as const,
      dataFreshnessStatus: 'aging' as const,
      existingRelationshipFlag: false,
    },
    {
      key: 'cedar',
      displayName: 'Cedar Ridge Planning',
      normalizedName: 'cedar ridge planning',
      domain: 'cedar-ridge.example.com',
      normalizedDomain: 'cedar-ridge.example.com',
      firmType: 'wealth_manager',
      prospectStage: 'existing_relationship' as const,
      researchStatus: 'paused' as const,
      outreachStatus: 'blocked_restriction' as const,
      dataFreshnessStatus: 'mixed' as const,
      existingRelationshipFlag: true,
    },
  ];
  const organizationIds: Record<string, string> = {};

  for (const spec of specs) {
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.normalizedDomain, spec.normalizedDomain))
      .limit(1);
    const existingRow = existing[0];

    if (existingRow) {
      await db
        .update(organizations)
        .set({
          displayName: spec.displayName,
          normalizedName: spec.normalizedName,
          domain: spec.domain,
          firmType: spec.firmType,
          prospectStage: spec.prospectStage,
          researchStatus: spec.researchStatus,
          outreachStatus: spec.outreachStatus,
          dataFreshnessStatus: spec.dataFreshnessStatus,
          existingRelationshipFlag: spec.existingRelationshipFlag,
          recordStatus: 'active',
          updatedByUserId: required(ids.users, 'researcher'),
          updatedAt: sql`now()`,
        })
        .where(eq(organizations.id, existingRow.id));
      organizationIds[spec.key] = existingRow.id;
      continue;
    }

    const row = first(
      await db
        .insert(organizations)
        .values({
          displayName: spec.displayName,
          normalizedName: spec.normalizedName,
          domain: spec.domain,
          normalizedDomain: spec.normalizedDomain,
          firmType: spec.firmType,
          prospectStage: spec.prospectStage,
          researchStatus: spec.researchStatus,
          outreachStatus: spec.outreachStatus,
          dataFreshnessStatus: spec.dataFreshnessStatus,
          existingRelationshipFlag: spec.existingRelationshipFlag,
          createdByUserId: required(ids.users, 'researcher'),
          updatedByUserId: required(ids.users, 'researcher'),
        })
        .returning({ id: organizations.id }),
      `organization ${spec.key}`,
    );
    organizationIds[spec.key] = row.id;
  }

  return organizationIds;
}

async function seedLocations(
  db: RepositoryExecutor,
  ids: SeedIds,
): Promise<Record<string, string>> {
  const specs = [
    {
      key: 'atlas-hq',
      organizationKey: 'atlas',
      territoryKey: 'northeast',
      name: 'Atlas HQ',
      city: 'Boston',
      region: 'MA',
    },
    {
      key: 'brightside-hq',
      organizationKey: 'brightside',
      territoryKey: 'southeast',
      name: 'Brightside HQ',
      city: 'Atlanta',
      region: 'GA',
    },
    {
      key: 'cedar-hq',
      organizationKey: 'cedar',
      territoryKey: 'northeast',
      name: 'Cedar HQ',
      city: 'Portland',
      region: 'ME',
    },
  ];
  const locationIds: Record<string, string> = {};

  for (const spec of specs) {
    const organizationId = required(ids.organizations, spec.organizationKey);
    const existing = await db
      .select({ id: organizationLocations.id })
      .from(organizationLocations)
      .where(
        and(
          eq(organizationLocations.organizationId, organizationId),
          eq(organizationLocations.name, spec.name),
        ),
      )
      .limit(1);
    const existingRow = existing[0];
    const values = {
      organizationId,
      territoryId: required(ids.territories, spec.territoryKey),
      name: spec.name,
      locationStatus: 'active' as const,
      isPrimary: true,
      addressLine1: '100 Example Street',
      city: spec.city,
      region: spec.region,
      postalCode: '00000',
      countryCode: 'US',
      phone: '+1 555 0100',
      normalizedPhone: '+15550100',
      updatedByUserId: required(ids.users, 'researcher'),
      updatedAt: new Date(),
    };

    if (existingRow) {
      await db
        .update(organizationLocations)
        .set(values)
        .where(eq(organizationLocations.id, existingRow.id));
      locationIds[spec.key] = existingRow.id;
      continue;
    }

    const row = first(
      await db
        .insert(organizationLocations)
        .values({ ...values, createdByUserId: required(ids.users, 'researcher') })
        .returning({ id: organizationLocations.id }),
      `location ${spec.key}`,
    );
    locationIds[spec.key] = row.id;
  }

  return locationIds;
}

async function seedContacts(db: RepositoryExecutor, ids: SeedIds): Promise<Record<string, string>> {
  const specs = [
    {
      key: 'atlas-ceo',
      organizationKey: 'atlas',
      locationKey: 'atlas-hq',
      firstName: 'Morgan',
      lastName: 'Lee',
      displayName: 'Morgan Lee',
      title: 'Managing Partner',
      email: 'morgan.lee@atlas-advisory.example.com',
    },
    {
      key: 'atlas-ops',
      organizationKey: 'atlas',
      locationKey: 'atlas-hq',
      firstName: 'Taylor',
      lastName: 'Nguyen',
      displayName: 'Taylor Nguyen',
      title: 'Operations Lead',
      email: 'taylor.nguyen@atlas-advisory.example.com',
    },
    {
      key: 'brightside-cfo',
      organizationKey: 'brightside',
      locationKey: 'brightside-hq',
      firstName: 'Casey',
      lastName: 'Patel',
      displayName: 'Casey Patel',
      title: 'Chief Financial Officer',
      email: 'casey.patel@brightside-capital.example.com',
    },
    {
      key: 'cedar-founder',
      organizationKey: 'cedar',
      locationKey: 'cedar-hq',
      firstName: 'Jamie',
      lastName: 'Rivera',
      displayName: 'Jamie Rivera',
      title: 'Founder',
      email: 'jamie.rivera@cedar-ridge.example.com',
    },
  ];
  const contactIds: Record<string, string> = {};

  for (const spec of specs) {
    const organizationId = required(ids.organizations, spec.organizationKey);
    const normalizedEmail = spec.email.toLowerCase();
    const existing = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          eq(contacts.normalizedEmail, normalizedEmail),
        ),
      )
      .limit(1);
    const existingRow = existing[0];
    const values = {
      organizationId,
      primaryLocationId: required(ids.locations, spec.locationKey),
      firstName: spec.firstName,
      lastName: spec.lastName,
      displayName: spec.displayName,
      title: spec.title,
      email: spec.email,
      normalizedEmail,
      phone: '+1 555 0101',
      normalizedPhone: '+15550101',
      status: 'active' as const,
      updatedByUserId: required(ids.users, 'researcher'),
      updatedAt: new Date(),
    };

    if (existingRow) {
      await db.update(contacts).set(values).where(eq(contacts.id, existingRow.id));
      contactIds[spec.key] = existingRow.id;
      continue;
    }

    const row = first(
      await db
        .insert(contacts)
        .values({ ...values, createdByUserId: required(ids.users, 'researcher') })
        .returning({ id: contacts.id }),
      `contact ${spec.key}`,
    );
    contactIds[spec.key] = row.id;
  }

  return contactIds;
}

async function seedOrganizationRoles(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const specs = [
    ['atlas', 'target_account', 'Target Account'],
    ['brightside', 'priority_account', 'Priority Account'],
    ['cedar', 'restricted_account', 'Restricted Existing Relationship'],
  ] as const;

  for (const [organizationKey, roleKey, roleName] of specs) {
    const organizationId = required(ids.organizations, organizationKey);
    const existing = await db
      .select({ id: organizationRoles.id })
      .from(organizationRoles)
      .where(
        and(
          eq(organizationRoles.organizationId, organizationId),
          eq(organizationRoles.roleKey, roleKey),
          eq(organizationRoles.status, 'assigned'),
          isNull(organizationRoles.effectiveTo),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(organizationRoles)
        .set({ roleName, updatedAt: sql`now()` })
        .where(eq(organizationRoles.id, existing[0].id));
      continue;
    }

    await db.insert(organizationRoles).values({
      organizationId,
      roleKey,
      roleName,
      createdByUserId: required(ids.users, 'researcher'),
    });
  }
}

async function seedContactRoles(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const specs = [
    ['atlas-ceo', 'atlas', 'economic_buyer', 'Economic Buyer'],
    ['atlas-ops', 'atlas', 'operations_contact', 'Operations Contact'],
    ['brightside-cfo', 'brightside', 'finance_contact', 'Finance Contact'],
    ['cedar-founder', 'cedar', 'executive_sponsor', 'Executive Sponsor'],
  ] as const;

  for (const [contactKey, organizationKey, roleKey, roleName] of specs) {
    const contactId = required(ids.contacts, contactKey);
    const organizationId = required(ids.organizations, organizationKey);
    const existing = await db
      .select({ id: contactRoles.id })
      .from(contactRoles)
      .where(
        and(
          eq(contactRoles.contactId, contactId),
          eq(contactRoles.organizationId, organizationId),
          eq(contactRoles.roleKey, roleKey),
          eq(contactRoles.status, 'active'),
          isNull(contactRoles.effectiveTo),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(contactRoles)
        .set({ roleName, updatedAt: sql`now()` })
        .where(eq(contactRoles.id, existing[0].id));
      continue;
    }

    await db.insert(contactRoles).values({
      contactId,
      organizationId,
      roleKey,
      roleName,
      createdByUserId: required(ids.users, 'researcher'),
    });
  }
}

async function seedAccountAssignments(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const specs = [
    ['atlas', 'sales', 'northeast', 'owner'],
    ['brightside', 'sales', 'southeast', 'owner'],
    ['cedar', 'reviewer', 'northeast', 'review_owner'],
  ] as const;

  for (const [organizationKey, userKey, territoryKey, assignmentRole] of specs) {
    const organizationId = required(ids.organizations, organizationKey);
    const existing = await db
      .select({ id: accountAssignments.id })
      .from(accountAssignments)
      .where(
        and(
          eq(accountAssignments.organizationId, organizationId),
          eq(accountAssignments.assignmentRole, assignmentRole),
          isNull(accountAssignments.effectiveTo),
        ),
      )
      .limit(1);

    if (existing[0]) {
      continue;
    }

    await db.insert(accountAssignments).values({
      organizationId,
      userId: required(ids.users, userKey),
      territoryId: required(ids.territories, territoryKey),
      assignmentRole,
      assignedByUserId: required(ids.users, 'admin'),
      reasonCode: 'seed_data',
      reasonNote: 'Synthetic seed assignment',
    });
  }
}

async function seedConsent(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const contactPermissions = [
    ['atlas-ceo', 'email', 'allowed', 'user_asserted'],
    ['atlas-ops', 'email', 'unknown', 'import'],
    ['brightside-cfo', 'phone', 'restricted', 'policy'],
    ['cedar-founder', 'email', 'opted_out', 'response_unsubscribe'],
  ] as const;

  for (const [contactKey, channel, state, source] of contactPermissions) {
    const contactId = required(ids.contacts, contactKey);
    const existing = await db
      .select({ id: contactChannelPermissions.id })
      .from(contactChannelPermissions)
      .where(
        and(
          eq(contactChannelPermissions.contactId, contactId),
          eq(contactChannelPermissions.channel, channel),
          isNull(contactChannelPermissions.revokedAt),
          isNull(contactChannelPermissions.supersededById),
          isNull(contactChannelPermissions.expiresAt),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(contactChannelPermissions)
        .set({ state, source, capturedByUserId: required(ids.users, 'reviewer') })
        .where(eq(contactChannelPermissions.id, existing[0].id));
      continue;
    }

    await db.insert(contactChannelPermissions).values({
      contactId,
      channel,
      state,
      source,
      capturedByUserId: required(ids.users, 'reviewer'),
      reasonCode: 'seed_data',
      reasonNote: 'Synthetic contact channel permission',
    });
  }

  const cedarId = required(ids.organizations, 'cedar');
  const restriction = await db
    .select({ id: organizationCommunicationRestrictions.id })
    .from(organizationCommunicationRestrictions)
    .where(
      and(
        eq(organizationCommunicationRestrictions.organizationId, cedarId),
        isNull(organizationCommunicationRestrictions.channel),
        isNull(organizationCommunicationRestrictions.revokedAt),
        isNull(organizationCommunicationRestrictions.supersededById),
        isNull(organizationCommunicationRestrictions.expiresAt),
      ),
    )
    .limit(1);

  if (restriction[0]) {
    await db
      .update(organizationCommunicationRestrictions)
      .set({ state: 'restricted', source: 'policy' })
      .where(eq(organizationCommunicationRestrictions.id, restriction[0].id));
  } else {
    await db.insert(organizationCommunicationRestrictions).values({
      organizationId: cedarId,
      state: 'restricted',
      source: 'policy',
      capturedByUserId: required(ids.users, 'reviewer'),
      reasonCode: 'existing_relationship',
      reasonNote: 'Synthetic organization-level communication restriction',
    });
  }

  const suppression = await db
    .select({ id: suppressionEntries.id })
    .from(suppressionEntries)
    .where(
      and(
        eq(suppressionEntries.scope, 'global_channel'),
        eq(suppressionEntries.channel, 'email'),
        eq(suppressionEntries.identifierType, 'email_sha256'),
        eq(suppressionEntries.identifierHash, 'seed_suppression_hash_example'),
        isNull(suppressionEntries.revokedAt),
        isNull(suppressionEntries.supersededById),
        isNull(suppressionEntries.expiresAt),
      ),
    )
    .limit(1);

  if (suppression[0]) {
    await db
      .update(suppressionEntries)
      .set({ state: 'opted_out', source: 'admin' })
      .where(eq(suppressionEntries.id, suppression[0].id));
  } else {
    await db.insert(suppressionEntries).values({
      scope: 'global_channel',
      channel: 'email',
      identifierType: 'email_sha256',
      identifierHash: 'seed_suppression_hash_example',
      state: 'opted_out',
      source: 'admin',
      capturedByUserId: required(ids.users, 'admin'),
      reasonCode: 'seed_suppression',
      reasonNote: 'Synthetic suppression entry',
    });
  }
}

async function seedTags(db: RepositoryExecutor, ids: SeedIds): Promise<Record<string, string>> {
  const specs = [
    ['priority', 'Priority', 'High-priority seed account', '#d97706'],
    ['research-gap', 'Research Gap', 'Needs additional research', '#2563eb'],
    ['restricted', 'Restricted', 'Communication restriction present', '#dc2626'],
  ] as const;
  const tagIds: Record<string, string> = {};

  for (const [key, name, description, color] of specs) {
    const row = first(
      await db
        .insert(tags)
        .values({
          key,
          name,
          description,
          color,
          status: 'active',
          createdByUserId: required(ids.users, 'researcher'),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tags.key,
          set: { name, description, color, status: 'active', updatedAt: sql`now()` },
        })
        .returning({ id: tags.id }),
      `tag ${key}`,
    );
    tagIds[key] = row.id;
  }

  return tagIds;
}

async function seedTasksNotesAndTaggings(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const taskSpecs = [
    [
      'atlas',
      'Confirm custodian footprint',
      'Validate synthetic research gaps for Atlas.',
      'researcher',
      1,
    ],
    ['brightside', 'Prepare sales handoff', 'Create a synthetic sales handoff note.', 'sales', 2],
    [
      'cedar',
      'Review restriction rationale',
      'Confirm existing relationship restriction.',
      'reviewer',
      0,
    ],
  ] as const;

  for (const [organizationKey, title, description, assigneeKey, priority] of taskSpecs) {
    const organizationId = required(ids.organizations, organizationKey);
    const existing = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.title, title)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(tasks)
        .set({
          description,
          priority,
          assignedToUserId: required(ids.users, assigneeKey),
          updatedAt: sql`now()`,
        })
        .where(eq(tasks.id, existing[0].id));
    } else {
      await db.insert(tasks).values({
        subjectType: 'organization',
        subjectId: organizationId,
        organizationId,
        title,
        description,
        priority,
        assignedToUserId: required(ids.users, assigneeKey),
        createdByUserId: required(ids.users, 'researcher'),
        updatedByUserId: required(ids.users, 'researcher'),
        metadata: { seed: true },
      });
    }
  }

  const noteSpecs = [
    ['atlas', 'Synthetic note: Atlas has current data and open research workflow.'],
    ['brightside', 'Synthetic note: Brightside is qualified and ready for sales review.'],
    ['cedar', 'Synthetic note: Cedar has an organization communication restriction.'],
  ] as const;

  for (const [organizationKey, body] of noteSpecs) {
    const organizationId = required(ids.organizations, organizationKey);
    const existing = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.organizationId, organizationId), eq(notes.body, body)))
      .limit(1);

    if (!existing[0]) {
      await db.insert(notes).values({
        subjectType: 'organization',
        subjectId: organizationId,
        organizationId,
        body,
        createdByUserId: required(ids.users, 'researcher'),
        updatedByUserId: required(ids.users, 'researcher'),
        metadata: { seed: true },
      });
    }
  }

  const taggingsSpecs = [
    ['priority', 'brightside'],
    ['research-gap', 'atlas'],
    ['restricted', 'cedar'],
  ] as const;

  for (const [tagKey, organizationKey] of taggingsSpecs) {
    await db
      .insert(taggings)
      .values({
        tagId: required(ids.tags, tagKey),
        subjectType: 'organization',
        subjectId: required(ids.organizations, organizationKey),
        createdByUserId: required(ids.users, 'researcher'),
      })
      .onConflictDoNothing({ target: [taggings.tagId, taggings.subjectType, taggings.subjectId] });
  }
}

async function seedOperationalTransitions(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const atlasId = required(ids.organizations, 'atlas');
  const existing = await db
    .select({ id: operationalStateTransitions.id })
    .from(operationalStateTransitions)
    .where(
      and(
        eq(operationalStateTransitions.subjectType, 'organization'),
        eq(operationalStateTransitions.subjectId, atlasId),
        eq(operationalStateTransitions.dimension, 'research_status'),
        eq(operationalStateTransitions.toValue, 'in_progress'),
      ),
    )
    .limit(1);

  if (!existing[0]) {
    await db.insert(operationalStateTransitions).values({
      subjectType: 'organization',
      subjectId: atlasId,
      dimension: 'research_status',
      fromValue: 'not_started',
      toValue: 'in_progress',
      actorUserId: required(ids.users, 'researcher'),
      actorType: 'user',
      reasonCode: 'seed_data',
      reasonNote: 'Synthetic transition for seeded organization',
      validationResult: { seed: true },
    });
  }
}

async function seedAuditAndOutbox(db: RepositoryExecutor, ids: SeedIds): Promise<void> {
  const auditSpecs = [
    ['seed.organization.created', 'atlas'],
    ['seed.organization.reviewed', 'brightside'],
  ] as const;

  for (const [action, organizationKey] of auditSpecs) {
    const organizationId = required(ids.organizations, organizationKey);
    const existing = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, action), eq(auditEvents.organizationId, organizationId)))
      .limit(1);

    if (!existing[0]) {
      await db.insert(auditEvents).values({
        actorType: 'user',
        actorUserId: required(ids.users, 'admin'),
        action,
        subjectType: 'organization',
        subjectId: organizationId,
        organizationId,
        afterData: { seeded: true },
        metadata: { seed: true },
      });
    }
  }

  await db
    .insert(outboxEvents)
    .values({
      aggregateType: 'organization',
      aggregateId: required(ids.organizations, 'atlas'),
      eventType: 'organization.seeded',
      idempotencyKey: 'seed:organization:atlas',
      payload: { organizationKey: 'atlas', seeded: true },
      metadata: { seed: true },
      status: 'pending',
    })
    .onConflictDoUpdate({
      target: outboxEvents.idempotencyKey,
      set: {
        aggregateId: required(ids.organizations, 'atlas'),
        payload: { organizationKey: 'atlas', seeded: true },
        metadata: { seed: true },
        status: 'pending',
        updatedAt: sql`now()`,
      },
    });
}

function first<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Seed did not return expected row for ${label}.`);
  }
  return row;
}

function required(record: Record<string, string>, key: string): string {
  const value = record[key];
  if (value === undefined) {
    throw new Error(`Missing seed id for "${key}".`);
  }
  return value;
}

function assertSeedTargetIsSafe(databaseUrl: string): void {
  const env = seedEnvironmentSchema.parse(process.env);
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, '');
  const environmentName = env.APP_ENV ?? env.NODE_ENV ?? '';
  const looksProduction =
    /prod|production/i.test(environmentName) ||
    /prod|production/i.test(databaseName) ||
    /prod|production/i.test(url.hostname);

  if (looksProduction && env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      'Refusing to seed a production-looking database. Set ALLOW_PRODUCTION_SEED=true to override.',
    );
  }
}

const env = seedEnvironmentSchema.parse(process.env);

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const summary = await runSeed(env.DATABASE_URL);
    console.log(`Database seed completed: ${JSON.stringify(summary)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
