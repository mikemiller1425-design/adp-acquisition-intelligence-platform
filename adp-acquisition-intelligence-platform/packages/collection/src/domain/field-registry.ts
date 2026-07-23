import { z } from 'zod';

export const FIELD_REGISTRY_VERSION = 'collection-field-registry-v1';

export const fieldValueKindSchema = z.enum([
  'string',
  'boolean',
  'date',
  'number',
  'percentage',
  'currency',
  'range',
  'enum',
  'email',
  'phone',
  'url',
  'domain',
  'address',
  'state',
  'country',
]);

export const fieldRegistryEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  subject: z.enum(['organization', 'location', 'contact', 'consent', 'variable']),
  valueKind: fieldValueKindSchema,
  requiredForCommit: z.boolean().default(false),
  aliases: z.array(z.string().min(1)).default([]),
  allowedValues: z.array(z.string().min(1)).default([]),
  blankSemantics: z.enum(['blank', 'unknown', 'not_applicable']).default('blank'),
});

export const fieldRegistrySchema = z.object({
  version: z.string().min(1),
  fields: z.array(fieldRegistryEntrySchema).min(1),
});

export type FieldValueKind = z.infer<typeof fieldValueKindSchema>;
export type FieldRegistryEntry = z.infer<typeof fieldRegistryEntrySchema>;
export type FieldRegistry = z.infer<typeof fieldRegistrySchema>;

export const embeddedFieldRegistry: FieldRegistry = fieldRegistrySchema.parse({
  version: FIELD_REGISTRY_VERSION,
  fields: [
    {
      key: 'organization.display_name',
      label: 'Organization display name',
      subject: 'organization',
      valueKind: 'string',
      requiredForCommit: true,
      aliases: ['company', 'company name', 'organization', 'org name', 'name'],
    },
    {
      key: 'organization.legal_name',
      label: 'Organization legal name',
      subject: 'organization',
      valueKind: 'string',
      aliases: ['legal name'],
    },
    {
      key: 'organization.domain',
      label: 'Organization domain',
      subject: 'organization',
      valueKind: 'domain',
      aliases: ['website domain', 'domain', 'url domain'],
    },
    {
      key: 'organization.website_url',
      label: 'Website URL',
      subject: 'organization',
      valueKind: 'url',
      aliases: ['website', 'url', 'web site'],
    },
    {
      key: 'organization.external_id',
      label: 'External ID',
      subject: 'organization',
      valueKind: 'string',
      aliases: ['external id', 'source id', 'crm id'],
    },
    {
      key: 'organization.firm_type',
      label: 'Firm type',
      subject: 'organization',
      valueKind: 'enum',
      aliases: ['firm type', 'type'],
      allowedValues: [
        'association',
        'amc',
        'management_company',
        'vendor',
        'developer',
        'law_firm',
      ],
    },
    {
      key: 'organization.acquisition_stage',
      label: 'Acquisition stage',
      subject: 'organization',
      valueKind: 'enum',
      aliases: ['acquisition status', 'pipeline stage'],
      allowedValues: ['new', 'researching', 'qualified', 'nurture', 'disqualified'],
    },
    {
      key: 'organization.lifecycle_stage',
      label: 'Organization lifecycle stage',
      subject: 'organization',
      valueKind: 'enum',
      aliases: ['org lifecycle', 'account lifecycle'],
      allowedValues: ['prospect', 'customer', 'partner', 'inactive'],
    },
    {
      key: 'organization.management_system',
      label: 'Management system',
      subject: 'organization',
      valueKind: 'string',
      aliases: ['software platform', 'ams system'],
    },
    {
      key: 'organization.portfolio_association_count',
      label: 'Portfolio association count',
      subject: 'organization',
      valueKind: 'number',
      aliases: ['association count', 'communities managed'],
    },
    {
      key: 'organization.portfolio_unit_count',
      label: 'Portfolio unit count',
      subject: 'organization',
      valueKind: 'number',
      aliases: ['unit count', 'doors managed'],
    },
    {
      key: 'organization.annual_revenue',
      label: 'Annual revenue',
      subject: 'organization',
      valueKind: 'currency',
      aliases: ['revenue', 'estimated revenue'],
    },
    {
      key: 'organization.employee_count',
      label: 'Employee count',
      subject: 'organization',
      valueKind: 'number',
      aliases: ['employees', 'staff count'],
    },
    {
      key: 'organization.headquarters_email',
      label: 'Headquarters email',
      subject: 'organization',
      valueKind: 'email',
      aliases: ['main email', 'office email'],
    },
    {
      key: 'organization.linkedin_url',
      label: 'Organization LinkedIn URL',
      subject: 'organization',
      valueKind: 'url',
      aliases: ['company linkedin', 'org linkedin'],
    },
    {
      key: 'organization.source_record_url',
      label: 'Source record URL',
      subject: 'organization',
      valueKind: 'url',
      aliases: ['source url', 'record url'],
    },
    {
      key: 'location.address_line_1',
      label: 'Address line 1',
      subject: 'location',
      valueKind: 'address',
      aliases: ['address', 'street', 'address 1'],
    },
    {
      key: 'location.address_line_2',
      label: 'Address line 2',
      subject: 'location',
      valueKind: 'string',
      aliases: ['address 2', 'suite'],
    },
    {
      key: 'location.city',
      label: 'City',
      subject: 'location',
      valueKind: 'string',
      aliases: ['city'],
    },
    {
      key: 'location.region',
      label: 'State/region',
      subject: 'location',
      valueKind: 'state',
      aliases: ['state', 'region', 'province'],
    },
    {
      key: 'location.postal_code',
      label: 'Postal code',
      subject: 'location',
      valueKind: 'string',
      aliases: ['zip', 'zip code', 'postal code'],
    },
    {
      key: 'location.country_code',
      label: 'Country',
      subject: 'location',
      valueKind: 'country',
      aliases: ['country'],
    },
    {
      key: 'location.county',
      label: 'County',
      subject: 'location',
      valueKind: 'string',
      aliases: ['county name'],
    },
    {
      key: 'location.latitude',
      label: 'Latitude',
      subject: 'location',
      valueKind: 'number',
      aliases: ['lat'],
    },
    {
      key: 'location.longitude',
      label: 'Longitude',
      subject: 'location',
      valueKind: 'number',
      aliases: ['lon', 'lng'],
    },
    {
      key: 'location.time_zone',
      label: 'Time zone',
      subject: 'location',
      valueKind: 'string',
      aliases: ['timezone'],
    },
    {
      key: 'location.phone',
      label: 'Location phone',
      subject: 'location',
      valueKind: 'phone',
      aliases: ['phone', 'main phone'],
    },
    {
      key: 'contact.display_name',
      label: 'Contact name',
      subject: 'contact',
      valueKind: 'string',
      aliases: ['contact', 'contact name', 'person'],
    },
    {
      key: 'contact.first_name',
      label: 'Contact first name',
      subject: 'contact',
      valueKind: 'string',
      aliases: ['first name', 'given name'],
    },
    {
      key: 'contact.last_name',
      label: 'Contact last name',
      subject: 'contact',
      valueKind: 'string',
      aliases: ['last name', 'surname'],
    },
    {
      key: 'contact.email',
      label: 'Contact email',
      subject: 'contact',
      valueKind: 'email',
      aliases: ['email', 'e-mail'],
    },
    {
      key: 'contact.title',
      label: 'Contact title',
      subject: 'contact',
      valueKind: 'string',
      aliases: ['job title', 'position'],
    },
    {
      key: 'contact.department',
      label: 'Contact department',
      subject: 'contact',
      valueKind: 'string',
      aliases: ['department', 'team'],
    },
    {
      key: 'contact.seniority',
      label: 'Contact seniority',
      subject: 'contact',
      valueKind: 'enum',
      aliases: ['seniority', 'level'],
      allowedValues: ['executive', 'director', 'manager', 'individual_contributor', 'unknown'],
    },
    {
      key: 'contact.linkedin_url',
      label: 'Contact LinkedIn URL',
      subject: 'contact',
      valueKind: 'url',
      aliases: ['person linkedin', 'profile url'],
    },
    {
      key: 'contact.is_primary',
      label: 'Primary contact flag',
      subject: 'contact',
      valueKind: 'boolean',
      aliases: ['primary contact', 'main contact'],
    },
    {
      key: 'contact.external_id',
      label: 'Contact external ID',
      subject: 'contact',
      valueKind: 'string',
      aliases: ['person source id', 'contact source id'],
    },
    {
      key: 'contact.phone',
      label: 'Contact phone',
      subject: 'contact',
      valueKind: 'phone',
      aliases: ['contact phone', 'mobile'],
    },
    {
      key: 'contact.role',
      label: 'Contact role',
      subject: 'contact',
      valueKind: 'enum',
      aliases: ['role', 'title role'],
      allowedValues: [
        'executive',
        'owner',
        'property_manager',
        'community_manager',
        'board_member',
        'director',
      ],
    },
    {
      key: 'consent.email_state',
      label: 'Email consent state',
      subject: 'consent',
      valueKind: 'enum',
      aliases: ['email consent', 'email permission'],
      allowedValues: ['allowed', 'unknown', 'restricted', 'opted_out'],
      blankSemantics: 'blank',
    },
    {
      key: 'consent.phone_state',
      label: 'Phone consent state',
      subject: 'consent',
      valueKind: 'enum',
      aliases: ['phone consent', 'call permission'],
      allowedValues: ['allowed', 'unknown', 'restricted', 'opted_out'],
      blankSemantics: 'blank',
    },
    {
      key: 'consent.linkedin_state',
      label: 'LinkedIn consent state',
      subject: 'consent',
      valueKind: 'enum',
      aliases: ['linkedin consent', 'social permission'],
      allowedValues: ['allowed', 'unknown', 'restricted', 'opted_out'],
      blankSemantics: 'blank',
    },
    {
      key: 'consent.source',
      label: 'Consent source',
      subject: 'consent',
      valueKind: 'string',
      aliases: ['permission source', 'consent basis'],
    },
    {
      key: 'consent.observed_at',
      label: 'Consent observed date',
      subject: 'consent',
      valueKind: 'date',
      aliases: ['consent date', 'permission date'],
    },
    {
      key: 'variable.import_note',
      label: 'Import note',
      subject: 'variable',
      valueKind: 'string',
      aliases: ['note', 'notes'],
    },
    {
      key: 'variable.confidence_score',
      label: 'Confidence score',
      subject: 'variable',
      valueKind: 'percentage',
      aliases: ['confidence', 'quality score'],
    },
    {
      key: 'variable.source_quality',
      label: 'Source quality',
      subject: 'variable',
      valueKind: 'enum',
      aliases: ['source grade', 'data quality'],
      allowedValues: ['high', 'medium', 'low', 'unknown'],
    },
    {
      key: 'variable.estimated_contract_value',
      label: 'Estimated contract value',
      subject: 'variable',
      valueKind: 'currency',
      aliases: ['contract value', 'deal value'],
    },
    {
      key: 'variable.renewal_date',
      label: 'Renewal date',
      subject: 'variable',
      valueKind: 'date',
      aliases: ['contract renewal', 'renewal'],
    },
    {
      key: 'variable.pain_points',
      label: 'Pain points',
      subject: 'variable',
      valueKind: 'string',
      aliases: ['needs', 'challenges'],
    },
    {
      key: 'variable.decision_timeline',
      label: 'Decision timeline',
      subject: 'variable',
      valueKind: 'range',
      aliases: ['buying timeline', 'decision window'],
    },
    {
      key: 'variable.service_mix',
      label: 'Service mix',
      subject: 'variable',
      valueKind: 'string',
      aliases: ['services', 'offerings'],
    },
  ],
});

export function loadFieldRegistry(input?: unknown): FieldRegistry {
  const registry = input === undefined ? embeddedFieldRegistry : fieldRegistrySchema.parse(input);
  assertUniqueKeysAndAliases(registry);
  return registry;
}

export function lookupRegistryField(
  registry: FieldRegistry,
  keyOrAlias: string,
): FieldRegistryEntry | null {
  const normalized = normalizeHeader(keyOrAlias);
  return (
    registry.fields.find(
      (field) =>
        normalizeHeader(field.key) === normalized ||
        normalizeHeader(field.label) === normalized ||
        field.aliases.some((alias) => normalizeHeader(alias) === normalized),
    ) ?? null
  );
}

export function normalizeHeader(header: string): string {
  return header
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

function assertUniqueKeysAndAliases(registry: FieldRegistry): void {
  const seen = new Map<string, string>();
  for (const field of registry.fields) {
    for (const token of [field.key, field.label, ...field.aliases]) {
      const normalized = normalizeHeader(token);
      const existing = seen.get(normalized);
      if (existing !== undefined && existing !== field.key) {
        throw new Error(`Duplicate field registry key or alias: ${token}`);
      }
      seen.set(normalized, field.key);
    }
  }
}
