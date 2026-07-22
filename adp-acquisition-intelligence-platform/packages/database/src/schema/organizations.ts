import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  contactRoleStatusEnum,
  contactStatusEnum,
  dataFreshnessStatusEnum,
  locationStatusEnum,
  organizationRoleStatusEnum,
  outreachStatusEnum,
  prospectStageEnum,
  recordStatusEnum,
  researchStatusEnum,
} from './enums.js';
import { users } from './identity.js';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name'),
    displayName: text('display_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    domain: text('domain'),
    normalizedDomain: text('normalized_domain'),
    firmType: text('firm_type'),
    prospectStage: prospectStageEnum('prospect_stage').notNull().default('raw'),
    researchStatus: researchStatusEnum('research_status').notNull().default('not_started'),
    outreachStatus: outreachStatusEnum('outreach_status').notNull().default('not_started'),
    dataFreshnessStatus: dataFreshnessStatusEnum('data_freshness_status')
      .notNull()
      .default('unknown'),
    recordStatus: recordStatusEnum('record_status').notNull().default('active'),
    existingRelationshipFlag: boolean('existing_relationship_flag').notNull().default(false),
    recordVersion: integer('record_version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('organizations_active_normalized_domain_unique')
      .on(table.normalizedDomain)
      .where(sql`${table.normalizedDomain} is not null and ${table.recordStatus} = 'active'`),
    index('organizations_normalized_name_idx').on(table.normalizedName),
    index('organizations_prospect_stage_idx').on(table.prospectStage),
    index('organizations_research_status_idx').on(table.researchStatus),
    index('organizations_outreach_status_idx').on(table.outreachStatus),
    index('organizations_data_freshness_status_idx').on(table.dataFreshnessStatus),
    index('organizations_record_status_idx').on(table.recordStatus),
    check('organizations_record_version_positive', sql`${table.recordVersion} > 0`),
  ],
);

export const organizationAliases = pgTable(
  'organization_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    aliasName: text('alias_name').notNull(),
    normalizedAliasName: text('normalized_alias_name').notNull(),
    source: text('source'),
    recordStatus: recordStatusEnum('record_status').notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('organization_aliases_active_org_normalized_alias_unique')
      .on(table.organizationId, table.normalizedAliasName)
      .where(sql`${table.recordStatus} = 'active'`),
    index('organization_aliases_normalized_alias_name_idx').on(table.normalizedAliasName),
  ],
);

export const organizationLocations = pgTable(
  'organization_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    territoryId: uuid('territory_id'),
    name: text('name'),
    locationStatus: locationStatusEnum('location_status').notNull().default('active'),
    isPrimary: boolean('is_primary').notNull().default(false),
    addressLine1: text('address_line_1'),
    addressLine2: text('address_line_2'),
    city: text('city'),
    region: text('region'),
    postalCode: text('postal_code'),
    countryCode: text('country_code'),
    phone: text('phone'),
    normalizedPhone: text('normalized_phone'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    index('organization_locations_organization_id_idx').on(table.organizationId),
    index('organization_locations_territory_id_idx').on(table.territoryId),
    index('organization_locations_status_idx').on(table.locationStatus),
    uniqueIndex('organization_locations_one_active_primary_per_org_unique')
      .on(table.organizationId)
      .where(sql`${table.isPrimary} = true and ${table.locationStatus} = 'active'`),
  ],
);

export const organizationRoles = pgTable(
  'organization_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    roleKey: text('role_key').notNull(),
    roleName: text('role_name').notNull(),
    status: organizationRoleStatusEnum('status').notNull().default('assigned'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_roles_current_role_unique')
      .on(table.organizationId, table.roleKey)
      .where(sql`${table.effectiveTo} is null and ${table.status} = 'assigned'`),
    index('organization_roles_role_key_idx').on(table.roleKey),
    check(
      'organization_roles_effective_window_valid',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    primaryLocationId: uuid('primary_location_id').references(() => organizationLocations.id, {
      onDelete: 'set null',
    }),
    firstName: text('first_name'),
    lastName: text('last_name'),
    displayName: text('display_name').notNull(),
    title: text('title'),
    email: text('email'),
    normalizedEmail: text('normalized_email'),
    phone: text('phone'),
    normalizedPhone: text('normalized_phone'),
    linkedinUrl: text('linkedin_url'),
    status: contactStatusEnum('status').notNull().default('active'),
    recordVersion: integer('record_version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('contacts_active_org_normalized_email_unique')
      .on(table.organizationId, table.normalizedEmail)
      .where(sql`${table.normalizedEmail} is not null and ${table.status} = 'active'`),
    index('contacts_organization_id_idx').on(table.organizationId),
    index('contacts_primary_location_id_idx').on(table.primaryLocationId),
    index('contacts_status_idx').on(table.status),
    check('contacts_record_version_positive', sql`${table.recordVersion} > 0`),
  ],
);

export const contactRoles = pgTable(
  'contact_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => organizationLocations.id, {
      onDelete: 'set null',
    }),
    roleKey: text('role_key').notNull(),
    roleName: text('role_name').notNull(),
    seniority: text('seniority'),
    status: contactRoleStatusEnum('status').notNull().default('active'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('contact_roles_current_role_unique')
      .on(table.contactId, table.organizationId, table.roleKey)
      .where(sql`${table.effectiveTo} is null and ${table.status} = 'active'`),
    index('contact_roles_organization_id_idx').on(table.organizationId),
    index('contact_roles_location_id_idx').on(table.locationId),
    check(
      'contact_roles_effective_window_valid',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
  ],
);
