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
      allowedValues: ['association', 'amc', 'management_company', 'vendor', 'developer', 'law_firm'],
    },
    {
      key: 'location.address_line_1',
      label: 'Address line 1',
      subject: 'location',
      valueKind: 'address',
      aliases: ['address', 'street', 'address 1'],
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
      key: 'contact.email',
      label: 'Contact email',
      subject: 'contact',
      valueKind: 'email',
      aliases: ['email', 'e-mail'],
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
      allowedValues: ['executive', 'owner', 'property_manager', 'community_manager', 'board_member', 'director'],
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
      key: 'variable.import_note',
      label: 'Import note',
      subject: 'variable',
      valueKind: 'string',
      aliases: ['note', 'notes'],
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
