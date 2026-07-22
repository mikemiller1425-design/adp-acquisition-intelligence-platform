import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  confidenceAssessments,
  contactChannelPermissions,
  evidenceRecords,
  permissionEvidenceLinks,
  researchObservations,
  sources,
  variableDefinitions,
  variableDefinitionVersions,
  variableValueEvidence,
  variableValues,
  type RepositoryExecutor,
} from '../src/index.js';

export const VARIABLE_DICTIONARY_DEFINITION_COUNT = 56;

interface VariableSeedIds {
  users: Record<string, string>;
  organizations: Record<string, string>;
  contacts: Record<string, string>;
}

export interface VariableSeedSummary {
  confidenceAssessments: number;
  sources: number;
  evidenceRecords: number;
  researchObservations: number;
  variableDefinitions: number;
  variableValues: number;
  permissionEvidenceLinks: number;
}

type VariableDefinitionInsert = typeof variableDefinitions.$inferInsert;
type VariableDefinitionVersionInsert = typeof variableDefinitionVersions.$inferInsert;
type VariableValueInsert = typeof variableValues.$inferInsert;

type VariableDataType = VariableDefinitionInsert['dataType'];
type Sensitivity = VariableDefinitionVersionInsert['sensitivity'];

interface VariableDefinitionSpec {
  key: string;
  label: string;
  description: string;
  dataType: VariableDataType;
  unit?: string;
  allowedValues?: unknown;
  rangeConstraints?: unknown;
  collectionMethods: string[];
  evidenceRequirements: unknown;
  confidenceRequirements?: unknown;
  freshnessPolicy?: unknown;
  sensitivity?: Sensitivity;
  applicableWorkflows: string[];
  helpText: string;
}

interface DefinitionVersionRef {
  definitionId: string;
  versionId: string;
}

const NULL_STATUS_SEMANTICS = {
  known: 'Typed value is present and usable for the definition purpose.',
  unknown: 'No reliable evidence is available; do not coerce to zero or false.',
  not_applicable: 'The definition does not apply to this organization.',
  withheld: 'The value is known by an actor but intentionally not disclosed.',
  contradicted: 'Multiple evidence records conflict and require review.',
  stale: 'The value is past an approved freshness policy or explicitly stale.',
};

const DEFAULT_CONFIDENCE_REQUIREMENTS = {
  components: [
    'source_reliability',
    'specificity',
    'recency',
    'cross_source_agreement',
    'extraction_certainty',
  ],
  aggregate_policy: null,
};

const BOOLEAN_ALLOWED_VALUES = {
  values: [true, false],
  note: 'Unknown is represented by value_status=unknown, not by false.',
};

const ZERO_TO_FOUR_RUBRIC = {
  min: 0,
  max: 4,
  rubric_required: true,
};

const PERCENTAGE_RANGE = {
  min: 0,
  max: 100,
  inclusive: true,
};

const VARIABLE_DEFINITIONS: VariableDefinitionSpec[] = [
  {
    key: 'firm_type',
    label: 'Firm Type',
    description: 'Primary firm category for acquisition intelligence segmentation.',
    dataType: 'enum',
    allowedValues: {
      values: [
        'CPA',
        'CAS',
        'bookkeeping',
        'payroll_bureau',
        'fractional_CFO',
        'employer',
        'other',
      ],
    },
    collectionMethods: ['company_website', 'direct_entry', 'import'],
    evidenceRequirements: { required: 'current source or direct entry' },
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText:
      'Select the best-supported primary category; use unknown status when evidence is absent.',
  },
  {
    key: 'employee_count',
    label: 'Employee Count',
    description: 'Best-supported count of employees at the organization.',
    dataType: 'integer',
    rangeConstraints: { min: 0, inclusive: true },
    collectionMethods: ['public_directory', 'company_website', 'direct_entry'],
    evidenceRequirements: { required: 'reliable directory, website, or direct evidence' },
    freshnessPolicy: { window: { months: 12 }, basis: 'observed_at' },
    applicableWorkflows: ['research', 'qualification'],
    helpText: 'Zero is a known value; use unknown when employee count has not been established.',
  },
  {
    key: 'estimated_revenue',
    label: 'Estimated Revenue',
    description: 'Estimated annual revenue range.',
    dataType: 'currency_range',
    unit: 'minor_units_with_iso_currency',
    rangeConstraints: { min_minor_units: 0, inclusive: true },
    collectionMethods: ['source_estimate', 'direct_entry'],
    evidenceRequirements: { required: 'sourced estimate or direct evidence; ranges are allowed' },
    sensitivity: 'confidential',
    applicableWorkflows: ['research', 'qualification'],
    helpText: 'Store lower and upper bounds with currency; do not force a point estimate.',
  },
  {
    key: 'office_count',
    label: 'Office Count',
    description: 'Number of active offices or staffed locations.',
    dataType: 'integer',
    rangeConstraints: { min: 1, inclusive: true },
    collectionMethods: ['organization_locations', 'direct_entry'],
    evidenceRequirements: { required: 'location record or direct confirmation' },
    applicableWorkflows: ['research', 'territory'],
    helpText: 'Use not_applicable only where the organization has no office concept.',
  },
  {
    key: 'geographic_coverage',
    label: 'Geographic Coverage',
    description: 'Regions or states served by the organization.',
    dataType: 'categorized_list',
    allowedValues: { category: 'region_or_state', controlled: true },
    collectionMethods: ['organization_locations', 'direct_entry'],
    evidenceRequirements: { required: 'locations, service area page, or direct evidence' },
    applicableWorkflows: ['research', 'territory'],
    helpText: 'Record supported regions/states as a categorized list.',
  },
  {
    key: 'years_in_business',
    label: 'Years in Business',
    description: 'Approximate number of years since formation or launch.',
    dataType: 'integer',
    rangeConstraints: { min: 0, inclusive: true },
    collectionMethods: ['regulatory_record', 'company_website', 'direct_entry'],
    evidenceRequirements: { required: 'formation record, website history, or direct evidence' },
    applicableWorkflows: ['research', 'qualification'],
    helpText: 'Zero is valid for a newly formed organization; unknown means no reliable evidence.',
  },
  {
    key: 'ownership_type',
    label: 'Ownership Type',
    description: 'Observed ownership model for acquisition-fit context.',
    dataType: 'enum',
    allowedValues: {
      values: [
        'founder_owned',
        'partner_owned',
        'employee_owned',
        'private_equity',
        'public',
        'nonprofit',
        'other',
        'unknown',
      ],
    },
    collectionMethods: ['verified_record', 'company_website', 'direct_entry'],
    evidenceRequirements: { required: 'verified, source-derived, or direct evidence' },
    sensitivity: 'confidential',
    applicableWorkflows: ['research', 'qualification'],
    helpText: 'Use unknown status when ownership cannot be established from approved evidence.',
  },
  {
    key: 'growth_stage',
    label: 'Growth Stage',
    description: 'Current growth posture inferred from evidence or direct input.',
    dataType: 'enum',
    allowedValues: { values: ['contracting', 'stable', 'growing', 'rapid_growth', 'unknown'] },
    collectionMethods: ['multi_source_research', 'direct_entry'],
    evidenceRequirements: { required: 'multi-source or direct evidence preferred' },
    applicableWorkflows: ['research', 'qualification'],
    helpText: 'Use the explicit unknown value only when a known enum value is not supported.',
  },
  {
    key: 'estimated_client_count',
    label: 'Estimated Client Count',
    description: 'Estimated client-count range.',
    dataType: 'integer_range',
    rangeConstraints: { min: 0, inclusive: true },
    collectionMethods: ['source_estimate', 'discovery', 'direct_entry'],
    evidenceRequirements: { required: 'range estimate; never force a point estimate' },
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText: 'Store lower and upper bounds; use unknown when no range is defensible.',
  },
  {
    key: 'typical_client_employee_count',
    label: 'Typical Client Employee Count',
    description: 'Typical employee-count range for client organizations served.',
    dataType: 'integer_range',
    rangeConstraints: { min: 0, inclusive: true },
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'discovery or direct evidence preferred' },
    applicableWorkflows: ['discovery', 'qualification'],
    helpText: 'Use a range for target population size.',
  },
  {
    key: 'industry_concentration',
    label: 'Industry Concentration',
    description: 'Categorized client-base percentage concentrations by industry.',
    dataType: 'categorized_list',
    unit: 'percentage',
    rangeConstraints: { total_max: 100 },
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'source or direct category percentages' },
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText: 'Category percentages must not total more than 100 percent.',
  },
  {
    key: 'payroll_client_count',
    label: 'Payroll Client Count',
    description: 'Estimated count range of clients using payroll-related services.',
    dataType: 'integer_range',
    rangeConstraints: { min: 0, inclusive: true },
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'discovery preferred' },
    applicableWorkflows: ['discovery', 'qualification'],
    helpText: 'Use a range; do not infer unknown as zero.',
  },
  {
    key: 'average_payroll_size',
    label: 'Average Payroll Size',
    description: 'Typical employee count per payroll for served clients.',
    dataType: 'integer_range',
    rangeConstraints: { min: 0, inclusive: true },
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'discovery or direct evidence' },
    applicableWorkflows: ['discovery', 'qualification'],
    helpText: 'Store the typical range of employees per payroll.',
  },
  {
    key: 'multi_state_client_share',
    label: 'Multi-State Client Share',
    description: 'Share of clients operating in multiple states.',
    dataType: 'percentage',
    unit: 'percent',
    rangeConstraints: PERCENTAGE_RANGE,
    collectionMethods: ['source_research', 'direct_entry'],
    evidenceRequirements: { required: 'source or direct evidence' },
    applicableWorkflows: ['research', 'qualification'],
    helpText: 'Record as a percentage from 0 to 100.',
  },
  {
    key: 'client_concentration_risk',
    label: 'Client Concentration Risk',
    description: 'Ordinal risk from concentration in a small number of clients.',
    dataType: 'ordinal_rubric',
    allowedValues: { min: 1, max: 5, rubric_required: true },
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'rubric-based assessment' },
    applicableWorkflows: ['discovery', 'qualification'],
    helpText: 'Use the attached 1-5 rubric; absence of evidence is unknown, not 1.',
  },
  ...(
    [
      [
        'payroll_offered',
        'Payroll Offered',
        'Whether payroll services are offered.',
        ['service_page', 'direct_entry'],
      ],
      [
        'bookkeeping_offered',
        'Bookkeeping Offered',
        'Whether bookkeeping services are offered.',
        ['company_website', 'direct_entry'],
      ],
      [
        'cas_offered',
        'CAS Offered',
        'Whether client accounting/advisory services are offered.',
        ['company_website', 'direct_entry'],
      ],
      [
        'fractional_cfo_offered',
        'Fractional CFO Offered',
        'Whether fractional CFO services are offered.',
        ['company_website', 'direct_entry'],
      ],
      [
        'hr_advisory_offered',
        'HR Advisory Offered',
        'Whether HR advisory services are offered.',
        ['company_website', 'direct_entry'],
      ],
      [
        'benefits_advisory_offered',
        'Benefits Advisory Offered',
        'Whether benefits advisory services are offered.',
        ['company_website', 'direct_entry'],
      ],
      [
        'technology_consulting_offered',
        'Technology Consulting Offered',
        'Whether technology consulting services are offered.',
        ['company_website', 'direct_entry'],
      ],
    ] as const
  ).map(([key, label, description, methods]) => ({
    key,
    label,
    description,
    dataType: 'boolean' as const,
    allowedValues: BOOLEAN_ALLOWED_VALUES,
    collectionMethods: [...methods],
    evidenceRequirements: { required: 'service page or direct evidence' },
    applicableWorkflows: ['research', 'qualification'],
    helpText: 'False is a known value only when supported; use unknown when evidence is absent.',
  })),
  {
    key: 'payroll_delivery_model',
    label: 'Payroll Delivery Model',
    description: 'How payroll services are delivered.',
    dataType: 'enum',
    allowedValues: { values: ['internal', 'reseller', 'referral', 'outsourced', 'none', 'mixed'] },
    collectionMethods: ['company_website', 'discovery', 'direct_entry'],
    evidenceRequirements: { required: 'source or direct evidence' },
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText:
      'Select the supported delivery model; contradictions should remain contradicted until reviewed.',
  },
  {
    key: 'cas_revenue_share',
    label: 'CAS Revenue Share',
    description: 'Share or range of revenue from CAS services.',
    dataType: 'decimal_range',
    unit: 'percent',
    rangeConstraints: PERCENTAGE_RANGE,
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'discovery or direct evidence' },
    sensitivity: 'confidential',
    applicableWorkflows: ['discovery', 'qualification'],
    helpText: 'Store a percentage range when only bounds are known.',
  },
  {
    key: 'recurring_service_model',
    label: 'Recurring Service Model',
    description: 'Ordinal maturity of recurring service delivery.',
    dataType: 'ordinal_rubric',
    allowedValues: ZERO_TO_FOUR_RUBRIC,
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'documented rubric assessment' },
    applicableWorkflows: ['discovery', 'qualification'],
    helpText: 'Use the attached 0-4 rubric; unknown is not zero.',
  },
  ...(
    [
      ['staffing_pressure', 'Staffing Pressure', 'Hiring, retention, or capacity strain.'],
      ['technology_maturity', 'Technology Maturity', 'Integration, workflow, and data maturity.'],
      [
        'process_standardization',
        'Process Standardization',
        'Repeatability and documentation maturity.',
      ],
      ['margin_pressure', 'Margin Pressure', 'Margin compression and cost concern.'],
      ['service_capacity', 'Service Capacity', 'Ability to absorb or support growth.'],
      ['succession_risk', 'Succession Risk', 'Leadership continuity or retirement signal.'],
      ['acquisition_interest', 'Acquisition Interest', 'Expressed openness to a transaction.'],
      ['growth_intent', 'Growth Intent', 'Stated appetite for expansion.'],
      ['operational_burden', 'Operational Burden', 'Pain of the current payroll operation.'],
      [
        'client_decision_influence',
        'Client Decision Influence',
        'Ability to shape client vendor choice.',
      ],
      ['trusted_advisor_status', 'Trusted Advisor Status', 'Depth of client reliance.'],
      [
        'workforce_data_access',
        'Workforce Data Access',
        'Legitimate access or visibility into workforce data.',
      ],
      [
        'recommendation_authority',
        'Recommendation Authority',
        'Advisory authority over payroll or HR selection.',
      ],
      ['executive_access', 'Executive Access', 'Access to decision-makers.'],
      [
        'provider_satisfaction',
        'Provider Satisfaction',
        'Satisfaction with current payroll provider.',
      ],
      ['switching_friction', 'Switching Friction', 'Expected difficulty of switching providers.'],
      [
        'competitive_openness',
        'Competitive Openness',
        'Openness to evaluating alternative providers.',
      ],
    ] as const
  ).map(([key, label, description]) => ({
    key,
    label,
    description,
    dataType: 'ordinal_rubric' as const,
    allowedValues: ZERO_TO_FOUR_RUBRIC,
    collectionMethods: ['discovery', 'direct_entry', 'source_research'],
    evidenceRequirements: { required: 'rubric assessment with supporting evidence' },
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText: 'Use the attached 0-4 rubric; absence of evidence is unknown, not zero.',
  })),
  {
    key: 'client_interaction_frequency',
    label: 'Client Interaction Frequency',
    description: 'Typical frequency of client interaction.',
    dataType: 'enum',
    allowedValues: { values: ['annual', 'quarterly', 'monthly', 'weekly', 'embedded'] },
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'direct or discovery evidence preferred' },
    applicableWorkflows: ['discovery', 'qualification'],
    helpText: 'Record the best-supported frequency of client interaction.',
  },
  ...(
    [
      ['rapid_hiring', 'Rapid Hiring'],
      ['new_office', 'New Office'],
      ['acquisition_event', 'Acquisition Event'],
      ['compliance_event', 'Compliance Event'],
      ['leadership_transition', 'Leadership Transition'],
      ['technology_dissatisfaction', 'Technology Dissatisfaction'],
      ['service_expansion', 'Service Expansion'],
      ['succession_event', 'Succession Event'],
      ['margin_compression', 'Margin Compression'],
      ['multi_state_growth', 'Multi-State Growth'],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    description: `${label} buying trigger event date or dated signal.`,
    dataType: 'date' as const,
    collectionMethods: ['news', 'company_website', 'discovery', 'direct_entry'],
    evidenceRequirements: { required: 'event date or dated source with confidence and severity' },
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText:
      'Record the event date when the trigger is present; stale triggers should not remain permanently current.',
  })),
  {
    key: 'current_payroll_provider',
    label: 'Current Payroll Provider',
    description: 'Known current payroll provider or controlled entity name.',
    dataType: 'string',
    allowedValues: { controlled_entity: 'payroll_provider', unknown_allowed: true },
    collectionMethods: ['discovery', 'direct_entry', 'source_research'],
    evidenceRequirements: { required: 'source or direct evidence; unknown allowed' },
    sensitivity: 'confidential',
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText: 'Use unknown when the provider is not known; do not infer from absence of evidence.',
  },
  {
    key: 'contract_renewal_date',
    label: 'Contract Renewal Date',
    description: 'Known or estimated renewal date for the current provider contract.',
    dataType: 'date',
    collectionMethods: ['discovery', 'direct_entry'],
    evidenceRequirements: { required: 'direct evidence preferred' },
    sensitivity: 'restricted',
    applicableWorkflows: ['discovery', 'qualification'],
    helpText:
      'Store the renewal date when known; use not_applicable where there is no relevant contract.',
  },
  {
    key: 'known_provider_issue',
    label: 'Known Provider Issue',
    description: 'Controlled issue categories and notes for provider dissatisfaction.',
    dataType: 'controlled_multiselect',
    allowedValues: {
      values: [
        'service_quality',
        'pricing',
        'integration',
        'support',
        'compliance',
        'reporting',
        'other',
      ],
      note: 'A note and dated source are required when selected.',
    },
    collectionMethods: ['discovery', 'direct_entry', 'source_research'],
    evidenceRequirements: { required: 'source and date required' },
    sensitivity: 'confidential',
    applicableWorkflows: ['research', 'discovery', 'qualification'],
    helpText: 'Select supported issue categories and include a note in the typed value.',
  },
];

if (VARIABLE_DEFINITIONS.length !== VARIABLE_DICTIONARY_DEFINITION_COUNT) {
  throw new Error(
    `Variable dictionary seed count mismatch: expected ${VARIABLE_DICTIONARY_DEFINITION_COUNT}, got ${VARIABLE_DEFINITIONS.length}.`,
  );
}

export async function seedVariables(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
): Promise<VariableSeedSummary> {
  const definitionRefs = await seedVariableDefinitions(db, ids);
  const sourceIds = await seedSources(db, ids);
  const evidenceIds = await seedEvidenceRecords(db, ids, sourceIds);
  await seedConfidenceAssessments(db, {
    'payroll-multi-evidence': '30000000-0000-4000-8000-000000000012',
  });
  const valueIds = await seedVariableValues(db, ids, definitionRefs);
  await seedVariableEvidenceLinks(db, ids, valueIds, evidenceIds);
  await seedResearchObservations(db, ids, definitionRefs, evidenceIds, valueIds);
  const permissionLinkCount = await seedPermissionEvidenceLink(db, ids, evidenceIds);

  return {
    confidenceAssessments: 1,
    sources: Object.keys(sourceIds).length,
    evidenceRecords: Object.keys(evidenceIds).length,
    researchObservations: 3,
    variableDefinitions: Object.keys(definitionRefs).length,
    variableValues: Object.keys(valueIds).length,
    permissionEvidenceLinks: permissionLinkCount,
  };
}

async function seedVariableDefinitions(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
): Promise<Record<string, DefinitionVersionRef>> {
  const refs: Record<string, DefinitionVersionRef> = {};

  for (const spec of VARIABLE_DEFINITIONS) {
    const definition = first(
      await db
        .insert(variableDefinitions)
        .values({
          key: spec.key,
          displayLabel: spec.label,
          description: spec.description,
          subjectType: 'organization',
          dataType: spec.dataType,
          status: 'active',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: variableDefinitions.key,
          set: {
            displayLabel: spec.label,
            description: spec.description,
            subjectType: 'organization',
            dataType: spec.dataType,
            status: 'active',
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: variableDefinitions.id }),
      `variable definition ${spec.key}`,
    );

    await db
      .insert(variableDefinitionVersions)
      .values({
        definitionId: definition.id,
        version: 1,
        unit: spec.unit,
        allowedValues: spec.allowedValues ?? null,
        rangeConstraints: spec.rangeConstraints ?? null,
        nullStatusSemantics: NULL_STATUS_SEMANTICS,
        collectionMethods: spec.collectionMethods,
        evidenceRequirements: spec.evidenceRequirements,
        confidenceRequirements: spec.confidenceRequirements ?? DEFAULT_CONFIDENCE_REQUIREMENTS,
        freshnessPolicy: spec.freshnessPolicy ?? null,
        sensitivity: spec.sensitivity ?? 'internal',
        applicableWorkflows: spec.applicableWorkflows,
        scoreConsumerMetadata: null,
        helpText: spec.helpText,
        lifecycleStatus: 'active',
        publishedAt: new Date(),
        publishedBy: required(ids.users, 'admin'),
      })
      .onConflictDoNothing({
        target: [variableDefinitionVersions.definitionId, variableDefinitionVersions.version],
      });

    const version = first(
      await db
        .select({ id: variableDefinitionVersions.id })
        .from(variableDefinitionVersions)
        .where(
          and(
            eq(variableDefinitionVersions.definitionId, definition.id),
            eq(variableDefinitionVersions.version, 1),
          ),
        )
        .limit(1),
      `variable definition version ${spec.key}`,
    );

    await db
      .update(variableDefinitions)
      .set({ currentVersionId: version.id, updatedAt: sql`now()` })
      .where(eq(variableDefinitions.id, definition.id));

    refs[spec.key] = { definitionId: definition.id, versionId: version.id };
  }

  return refs;
}

async function seedSources(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
): Promise<Record<string, string>> {
  const specs = [
    {
      key: 'atlas-website',
      sourceType: 'company_website' as const,
      title: 'Atlas Advisory Website',
      locator: 'https://atlas-advisory.example.com/services',
      publisher: 'Atlas Advisory Group',
      defaultReliability: '0.8500',
      accessClassification: 'public' as const,
    },
    {
      key: 'public-directory',
      sourceType: 'public_directory' as const,
      title: 'Synthetic Public Firm Directory',
      locator: 'https://directory.example.com/firms',
      publisher: 'Example Directory',
      defaultReliability: '0.7000',
      accessClassification: 'public' as const,
    },
    {
      key: 'research-note',
      sourceType: 'user_entry' as const,
      title: 'Synthetic Researcher Note',
      locator: 'seed://researcher-note/prompt-3',
      publisher: 'ADP Research',
      defaultReliability: '0.6500',
      accessClassification: 'internal' as const,
    },
    {
      key: 'calculation',
      sourceType: 'calculated' as const,
      title: 'Synthetic Calculation Source',
      locator: 'seed://calculation/prompt-3',
      publisher: 'ADP System',
      defaultReliability: '0.6000',
      accessClassification: 'internal' as const,
    },
    {
      key: 'ai-extraction',
      sourceType: 'ai_assisted_extraction' as const,
      title: 'Synthetic AI Extraction',
      locator: 'seed://ai-extraction/prompt-3',
      publisher: 'ADP Research Assistant',
      defaultReliability: '0.5000',
      accessClassification: 'internal' as const,
    },
    {
      key: 'internal-record',
      sourceType: 'internal_record' as const,
      title: 'Synthetic Internal Permission Record',
      locator: 'seed://internal-record/permission',
      publisher: 'ADP Operations',
      defaultReliability: '0.9000',
      accessClassification: 'restricted' as const,
    },
  ];
  const sourceIds: Record<string, string> = {};

  for (const spec of specs) {
    const existing = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.locator, spec.locator))
      .limit(1);

    if (existing[0]) {
      await db
        .update(sources)
        .set({
          sourceType: spec.sourceType,
          title: spec.title,
          publisher: spec.publisher,
          defaultReliability: spec.defaultReliability,
          accessClassification: spec.accessClassification,
          retrievalRestrictions: { seed: true },
          status: 'active',
          updatedByUserId: required(ids.users, 'researcher'),
          updatedAt: sql`now()`,
        })
        .where(eq(sources.id, existing[0].id));
      sourceIds[spec.key] = existing[0].id;
      continue;
    }

    const row = first(
      await db
        .insert(sources)
        .values({
          sourceType: spec.sourceType,
          title: spec.title,
          locator: spec.locator,
          publisher: spec.publisher,
          defaultReliability: spec.defaultReliability,
          accessClassification: spec.accessClassification,
          retrievalRestrictions: { seed: true },
          status: 'active',
          createdByUserId: required(ids.users, 'researcher'),
          updatedByUserId: required(ids.users, 'researcher'),
        })
        .returning({ id: sources.id }),
      `source ${spec.key}`,
    );
    sourceIds[spec.key] = row.id;
  }

  return sourceIds;
}

async function seedEvidenceRecords(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
  sourceIds: Record<string, string>,
): Promise<Record<string, string>> {
  const observedAt = new Date('2026-01-15T12:00:00.000Z');
  const specs = [
    {
      key: 'verified-payroll',
      sourceKey: 'atlas-website',
      evidenceType: 'verified_fact' as const,
      organizationKey: 'atlas',
      claim: 'Atlas Advisory states that it offers payroll advisory services.',
      payload: { service: 'payroll', offered: true },
      contentHash: 'seed:evidence:verified-payroll',
      reviewerStatus: 'approved' as const,
    },
    {
      key: 'source-employee-count',
      sourceKey: 'public-directory',
      evidenceType: 'source_derived_fact' as const,
      organizationKey: 'atlas',
      claim: 'Public directory lists Atlas Advisory with 42 employees.',
      payload: { employee_count: 42 },
      contentHash: 'seed:evidence:source-employee-count',
      reviewerStatus: 'pending' as const,
    },
    {
      key: 'user-provider',
      sourceKey: 'research-note',
      evidenceType: 'user_entered_fact' as const,
      organizationKey: 'brightside',
      claim: 'Researcher entered that Brightside uses ProviderOne for payroll.',
      payload: { current_payroll_provider: 'ProviderOne' },
      contentHash: 'seed:evidence:user-provider',
      reviewerStatus: 'approved' as const,
    },
    {
      key: 'calculated-revenue',
      sourceKey: 'calculation',
      evidenceType: 'calculated' as const,
      organizationKey: 'atlas',
      claim: 'Synthetic calculation estimates Atlas annual revenue as a bounded range.',
      payload: {
        estimated_revenue: {
          currency: 'USD',
          min_minor_units: 250000000,
          max_minor_units: 400000000,
        },
      },
      contentHash: 'seed:evidence:calculated-revenue',
      reviewerStatus: 'pending' as const,
    },
    {
      key: 'ai-staffing-pressure',
      sourceKey: 'ai-extraction',
      evidenceType: 'ai_inference' as const,
      organizationKey: 'cedar',
      claim: 'AI-assisted extraction suggests Cedar has staffing pressure.',
      payload: { staffing_pressure: 3 },
      contentHash: 'seed:evidence:ai-staffing-pressure',
      reviewerStatus: 'needs_review' as const,
    },
    {
      key: 'unknown-opt-out',
      sourceKey: 'internal-record',
      evidenceType: 'unknown' as const,
      contactKey: 'cedar-founder',
      claim: 'Synthetic internal record captures an email opt-out with unknown evidence type.',
      payload: { channel: 'email', state: 'opted_out' },
      contentHash: 'seed:evidence:unknown-opt-out',
      reviewerStatus: 'approved' as const,
    },
  ];
  const evidenceIds: Record<string, string> = {};

  for (const spec of specs) {
    const existing = await db
      .select({ id: evidenceRecords.id })
      .from(evidenceRecords)
      .where(eq(evidenceRecords.contentHash, spec.contentHash))
      .limit(1);

    if (existing[0]) {
      evidenceIds[spec.key] = existing[0].id;
      continue;
    }

    const organizationId =
      'organizationKey' in spec ? required(ids.organizations, spec.organizationKey) : null;
    const contactId = 'contactKey' in spec ? required(ids.contacts, spec.contactKey) : null;
    const reviewedAt = spec.reviewerStatus === 'approved' ? observedAt : null;
    const row = first(
      await db
        .insert(evidenceRecords)
        .values({
          subjectType: contactId ? 'contact' : 'organization',
          organizationId,
          contactId,
          sourceId: required(sourceIds, spec.sourceKey),
          claim: spec.claim,
          structuredPayload: spec.payload,
          evidenceType: spec.evidenceType,
          observedAt,
          retrievedAt: observedAt,
          effectiveAt: observedAt,
          sourceReliability: '0.8000',
          specificity: '0.7500',
          recency: '0.7000',
          crossSourceAgreement: '0.6000',
          extractionCertainty: '0.6500',
          reviewerStatus: spec.reviewerStatus,
          reviewedBy: reviewedAt ? required(ids.users, 'reviewer') : null,
          reviewedAt,
          contentHash: spec.contentHash,
          actorUserId: required(ids.users, 'researcher'),
        })
        .returning({ id: evidenceRecords.id }),
      `evidence ${spec.key}`,
    );
    evidenceIds[spec.key] = row.id;
  }

  return evidenceIds;
}

async function seedVariableValues(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
  definitionRefs: Record<string, DefinitionVersionRef>,
): Promise<Record<string, string>> {
  const observedAt = new Date('2026-01-15T12:00:00.000Z');
  const valuesToInsert: Array<{ key: string; definitionKey: string; values: VariableValueInsert }> =
    [
      valueSpec(
        'employee-count-known',
        'employee_count',
        '30000000-0000-4000-8000-000000000001',
        ids,
        definitionRefs,
        {
          organizationKey: 'atlas',
          typedValue: { value: 42 },
          normalizedValue: { value: 42 },
          valueStatus: 'known',
          evidenceType: 'source_derived_fact',
          confidenceStatus: 'provisional',
          lifecycle: 'current',
          freshnessResult: 'fresh',
          observedAt,
          verifiedAt: observedAt,
        },
      ),
      valueSpec(
        'years-zero',
        'years_in_business',
        '30000000-0000-4000-8000-000000000002',
        ids,
        definitionRefs,
        {
          organizationKey: 'brightside',
          typedValue: { value: 0 },
          normalizedValue: { value: 0 },
          valueStatus: 'known',
          evidenceType: 'user_entered_fact',
          lifecycle: 'current',
          freshnessResult: 'fresh',
          observedAt,
        },
      ),
      valueSpec(
        'payroll-false',
        'payroll_offered',
        '30000000-0000-4000-8000-000000000003',
        ids,
        definitionRefs,
        {
          organizationKey: 'cedar',
          typedValue: { value: false },
          normalizedValue: { value: false },
          valueStatus: 'known',
          evidenceType: 'verified_fact',
          lifecycle: 'current',
          freshnessResult: 'fresh',
          observedAt,
        },
      ),
      valueSpec(
        'growth-unknown',
        'growth_stage',
        '30000000-0000-4000-8000-000000000004',
        ids,
        definitionRefs,
        {
          organizationKey: 'cedar',
          typedValue: { status: 'unknown' },
          normalizedValue: { status: 'unknown' },
          valueStatus: 'unknown',
          evidenceType: 'unknown',
          lifecycle: 'current',
          freshnessResult: 'unknown',
          observedAt,
        },
      ),
      valueSpec(
        'contract-na',
        'contract_renewal_date',
        '30000000-0000-4000-8000-000000000005',
        ids,
        definitionRefs,
        {
          organizationKey: 'cedar',
          typedValue: { status: 'not_applicable' },
          normalizedValue: { status: 'not_applicable' },
          valueStatus: 'not_applicable',
          evidenceType: 'user_entered_fact',
          lifecycle: 'current',
          freshnessResult: 'no_policy',
          observedAt,
        },
      ),
      valueSpec(
        'ownership-withheld',
        'ownership_type',
        '30000000-0000-4000-8000-000000000006',
        ids,
        definitionRefs,
        {
          organizationKey: 'brightside',
          typedValue: { status: 'withheld' },
          normalizedValue: { status: 'withheld' },
          valueStatus: 'withheld',
          evidenceType: 'user_entered_fact',
          lifecycle: 'current',
          freshnessResult: 'unknown',
          observedAt,
        },
      ),
      valueSpec(
        'delivery-contradicted',
        'payroll_delivery_model',
        '30000000-0000-4000-8000-000000000007',
        ids,
        definitionRefs,
        {
          organizationKey: 'atlas',
          typedValue: { values: ['reseller', 'internal'] },
          normalizedValue: { conflict: ['reseller', 'internal'] },
          valueStatus: 'contradicted',
          evidenceType: 'verified_fact',
          lifecycle: 'contradicted',
          freshnessResult: 'fresh',
          observedAt,
        },
      ),
      valueSpec(
        'staffing-stale',
        'staffing_pressure',
        '30000000-0000-4000-8000-000000000008',
        ids,
        definitionRefs,
        {
          organizationKey: 'cedar',
          typedValue: { value: 3 },
          normalizedValue: { value: 3 },
          valueStatus: 'stale',
          evidenceType: 'ai_inference',
          lifecycle: 'stale',
          freshnessResult: 'stale',
          observedAt: new Date('2024-01-15T12:00:00.000Z'),
          expiresAt: new Date('2025-01-15T12:00:00.000Z'),
        },
      ),
      valueSpec(
        'client-count-range',
        'estimated_client_count',
        '30000000-0000-4000-8000-000000000009',
        ids,
        definitionRefs,
        {
          organizationKey: 'atlas',
          typedValue: { min: 150, max: 225 },
          normalizedValue: { min: 150, max: 225 },
          valueStatus: 'known',
          evidenceType: 'source_derived_fact',
          lifecycle: 'current',
          freshnessResult: 'fresh',
          observedAt,
        },
      ),
      valueSpec(
        'bookkeeping-original',
        'bookkeeping_offered',
        '30000000-0000-4000-8000-000000000010',
        ids,
        definitionRefs,
        {
          organizationKey: 'atlas',
          typedValue: { value: false },
          normalizedValue: { value: false },
          valueStatus: 'known',
          evidenceType: 'source_derived_fact',
          lifecycle: 'superseded',
          freshnessResult: 'fresh',
          observedAt,
        },
      ),
      valueSpec(
        'bookkeeping-override',
        'bookkeeping_offered',
        '30000000-0000-4000-8000-000000000011',
        ids,
        definitionRefs,
        {
          organizationKey: 'atlas',
          typedValue: { value: true },
          normalizedValue: { value: true },
          valueStatus: 'known',
          evidenceType: 'user_entered_fact',
          lifecycle: 'current',
          freshnessResult: 'fresh',
          observedAt,
          manualOverrideFlag: true,
          overrideActor: required(ids.users, 'reviewer'),
          overrideReasonCode: 'seed_correction',
          overrideReasonNote: 'Synthetic manual override fixture.',
          overrideAt: observedAt,
          originalValueId: '30000000-0000-4000-8000-000000000010',
        },
      ),
      valueSpec(
        'payroll-multi-evidence',
        'payroll_offered',
        '30000000-0000-4000-8000-000000000012',
        ids,
        definitionRefs,
        {
          organizationKey: 'atlas',
          typedValue: { value: true },
          normalizedValue: { value: true },
          valueStatus: 'known',
          evidenceType: 'verified_fact',
          confidenceStatus: 'assessed',
          confidenceAssessmentId: '40000000-0000-4000-8000-000000000001',
          lifecycle: 'current',
          freshnessResult: 'fresh',
          observedAt,
          verifiedAt: observedAt,
        },
      ),
      valueSpec(
        'revenue-range',
        'estimated_revenue',
        '30000000-0000-4000-8000-000000000013',
        ids,
        definitionRefs,
        {
          organizationKey: 'atlas',
          typedValue: { currency: 'USD', min_minor_units: 250000000, max_minor_units: 400000000 },
          normalizedValue: {
            currency: 'USD',
            min_minor_units: 250000000,
            max_minor_units: 400000000,
          },
          valueStatus: 'known',
          evidenceType: 'calculated',
          lifecycle: 'current',
          freshnessResult: 'fresh',
          observedAt,
          calculationActor: 'seed:synthetic-revenue-range',
        },
      ),
    ];
  const valueIds: Record<string, string> = {};

  for (const spec of valuesToInsert) {
    const existing = await db
      .select({ id: variableValues.id })
      .from(variableValues)
      .where(eq(variableValues.id, spec.values.id ?? ''))
      .limit(1);

    if (!existing[0]) {
      await db.insert(variableValues).values(spec.values);
    }
    valueIds[spec.key] = spec.values.id ?? first(existing, `variable value ${spec.key}`).id;
  }

  return valueIds;
}

function valueSpec(
  key: string,
  definitionKey: string,
  id: string,
  ids: VariableSeedIds,
  definitionRefs: Record<string, DefinitionVersionRef>,
  input: {
    organizationKey: string;
    typedValue: unknown;
    normalizedValue: unknown;
    valueStatus: VariableValueInsert['valueStatus'];
    evidenceType: VariableValueInsert['evidenceType'];
    lifecycle: VariableValueInsert['lifecycle'];
    freshnessResult: VariableValueInsert['freshnessResult'];
    observedAt: Date;
    verifiedAt?: Date;
    expiresAt?: Date;
    confidenceStatus?: VariableValueInsert['confidenceStatus'];
    confidenceAssessmentId?: string;
    manualOverrideFlag?: boolean;
    overrideActor?: string;
    overrideReasonCode?: string;
    overrideReasonNote?: string;
    overrideAt?: Date;
    originalValueId?: string;
    calculationActor?: string;
  },
): { key: string; definitionKey: string; values: VariableValueInsert } {
  const definition = requiredDefinition(definitionRefs, definitionKey);

  return {
    key,
    definitionKey,
    values: {
      id,
      subjectType: 'organization',
      organizationId: required(ids.organizations, input.organizationKey),
      contactId: null,
      variableDefinitionId: definition.definitionId,
      definitionVersionId: definition.versionId,
      typedValue: input.typedValue,
      normalizedValue: input.normalizedValue,
      valueStatus: input.valueStatus,
      evidenceType: input.evidenceType,
      confidenceStatus: input.confidenceStatus ?? 'provisional',
      confidenceAssessmentId: input.confidenceAssessmentId,
      lifecycle: input.lifecycle,
      freshnessResult: input.freshnessResult,
      effectiveAt: input.observedAt,
      observedAt: input.observedAt,
      verifiedAt: input.verifiedAt,
      expiresAt: input.expiresAt,
      sourceActorUserId: required(ids.users, 'researcher'),
      calculationActor: input.calculationActor,
      manualOverrideFlag: input.manualOverrideFlag ?? false,
      overrideActor: input.overrideActor,
      overrideReasonCode: input.overrideReasonCode,
      overrideReasonNote: input.overrideReasonNote,
      overrideAt: input.overrideAt,
      originalValueId: input.originalValueId,
      updatedAt: new Date(),
    },
  };
}

async function seedConfidenceAssessments(
  db: RepositoryExecutor,
  valueIds: Record<string, string>,
): Promise<void> {
  const assessedAt = '2026-01-15T12:00:00.000Z';

  await db
    .insert(confidenceAssessments)
    .values({
      id: '40000000-0000-4000-8000-000000000001',
      subjectType: 'variable_value',
      subjectId: required(valueIds, 'payroll-multi-evidence'),
      components: {
        source_reliability: {
          value: 0.85,
          range: null,
          source: 'seed:evidence:verified-payroll',
          method_version: 'seed-v1',
          assessed_at: assessedAt,
          actor: 'seed',
          explanation: 'Synthetic source reliability component.',
        },
        specificity: {
          value: 0.8,
          range: null,
          source: 'seed:evidence:verified-payroll',
          method_version: 'seed-v1',
          assessed_at: assessedAt,
          actor: 'seed',
          explanation: 'Synthetic specificity component.',
        },
        recency: {
          value: 0.7,
          range: null,
          source: 'seed:evidence:verified-payroll',
          method_version: 'seed-v1',
          assessed_at: assessedAt,
          actor: 'seed',
          explanation: 'Synthetic recency component.',
        },
        cross_source_agreement: {
          value: 0.6,
          range: null,
          source: 'seed:evidence:source-employee-count',
          method_version: 'seed-v1',
          assessed_at: assessedAt,
          actor: 'seed',
          explanation: 'Synthetic cross-source agreement component.',
        },
        extraction_certainty: {
          value: 0.75,
          range: null,
          source: 'seed:evidence:verified-payroll',
          method_version: 'seed-v1',
          assessed_at: assessedAt,
          actor: 'seed',
          explanation: 'Synthetic extraction certainty component.',
        },
      },
      aggregateScore: null,
      status: 'assessed',
      policyVersion: null,
    })
    .onConflictDoNothing({ target: confidenceAssessments.id });
}

async function seedVariableEvidenceLinks(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
  valueIds: Record<string, string>,
  evidenceIds: Record<string, string>,
): Promise<void> {
  const links = [
    ['employee-count-known', 'source-employee-count', 'supports', 'primary'],
    ['payroll-multi-evidence', 'verified-payroll', 'verifies', 'primary'],
    ['payroll-multi-evidence', 'source-employee-count', 'contextualizes', 'context'],
    ['delivery-contradicted', 'verified-payroll', 'contradicts', 'conflicting-source'],
    ['staffing-stale', 'ai-staffing-pressure', 'supports', 'stale-source'],
    ['revenue-range', 'calculated-revenue', 'supports', 'calculation-input'],
  ] as const;

  for (const [valueKey, evidenceKey, relationshipType, contributionRole] of links) {
    await db
      .insert(variableValueEvidence)
      .values({
        valueId: required(valueIds, valueKey),
        evidenceId: required(evidenceIds, evidenceKey),
        relationshipType,
        contributionRole,
        actorUserId: required(ids.users, 'researcher'),
      })
      .onConflictDoNothing({
        target: [
          variableValueEvidence.valueId,
          variableValueEvidence.evidenceId,
          variableValueEvidence.relationshipType,
        ],
      });
  }
}

async function seedResearchObservations(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
  definitionRefs: Record<string, DefinitionVersionRef>,
  evidenceIds: Record<string, string>,
  valueIds: Record<string, string>,
): Promise<void> {
  const decidedAt = new Date('2026-01-15T12:00:00.000Z');
  const specs = [
    {
      correlationId: '50000000-0000-4000-8000-000000000001',
      organizationKey: 'atlas',
      claim: 'Atlas appears to offer payroll services.',
      evidenceKey: 'verified-payroll',
      definitionKey: 'payroll_offered',
      proposedTypedValue: { value: true },
      normalizedInterpretation: 'payroll_offered=true',
      lifecycleStatus: 'accepted' as const,
      resultingValueKey: 'payroll-multi-evidence',
      decisionReason: 'seed_acceptance',
    },
    {
      correlationId: '50000000-0000-4000-8000-000000000002',
      organizationKey: 'cedar',
      claim: 'Cedar staffing-pressure signal is stale and requires review.',
      evidenceKey: 'ai-staffing-pressure',
      definitionKey: 'staffing_pressure',
      proposedTypedValue: { value: 3 },
      normalizedInterpretation: 'staffing_pressure=3 stale',
      lifecycleStatus: 'superseded' as const,
      resultingValueKey: 'staffing-stale',
      decisionReason: 'seed_stale_signal',
    },
    {
      correlationId: '50000000-0000-4000-8000-000000000003',
      organizationKey: 'atlas',
      claim: 'Conflicting delivery-model claims need reviewer resolution.',
      evidenceKey: 'verified-payroll',
      definitionKey: 'payroll_delivery_model',
      proposedTypedValue: { values: ['reseller', 'internal'] },
      normalizedInterpretation: 'payroll_delivery_model conflict',
      lifecycleStatus: 'contradicted' as const,
      resultingValueKey: 'delivery-contradicted',
      decisionReason: 'seed_conflict',
    },
  ];

  for (const spec of specs) {
    const existing = await db
      .select({ id: researchObservations.id })
      .from(researchObservations)
      .where(eq(researchObservations.correlationId, spec.correlationId))
      .limit(1);

    if (existing[0]) {
      continue;
    }

    await db.insert(researchObservations).values({
      subjectType: 'organization',
      organizationId: required(ids.organizations, spec.organizationKey),
      claim: spec.claim,
      evidenceId: required(evidenceIds, spec.evidenceKey),
      proposedDefinitionVersionId: requiredDefinition(definitionRefs, spec.definitionKey).versionId,
      proposedTypedValue: spec.proposedTypedValue,
      normalizedInterpretation: spec.normalizedInterpretation,
      proposingUserId: required(ids.users, 'researcher'),
      reviewUserId: required(ids.users, 'reviewer'),
      lifecycleStatus: spec.lifecycleStatus,
      decisionReason: spec.decisionReason,
      decidedAt,
      resultingVariableValueId: required(valueIds, spec.resultingValueKey),
      correlationId: spec.correlationId,
      updatedAt: new Date(),
    });
  }
}

async function seedPermissionEvidenceLink(
  db: RepositoryExecutor,
  ids: VariableSeedIds,
  evidenceIds: Record<string, string>,
): Promise<number> {
  const permission = first(
    await db
      .select({ id: contactChannelPermissions.id })
      .from(contactChannelPermissions)
      .where(
        and(
          eq(contactChannelPermissions.contactId, required(ids.contacts, 'cedar-founder')),
          eq(contactChannelPermissions.channel, 'email'),
          isNull(contactChannelPermissions.revokedAt),
          isNull(contactChannelPermissions.supersededById),
          isNull(contactChannelPermissions.expiresAt),
        ),
      )
      .limit(1),
    'cedar-founder email permission',
  );

  await db
    .insert(permissionEvidenceLinks)
    .values({
      subjectType: 'contact_channel_permission',
      subjectId: permission.id,
      evidenceRecordId: required(evidenceIds, 'unknown-opt-out'),
      createdBy: required(ids.users, 'reviewer'),
    })
    .onConflictDoNothing({
      target: [
        permissionEvidenceLinks.subjectType,
        permissionEvidenceLinks.subjectId,
        permissionEvidenceLinks.evidenceRecordId,
      ],
    });

  return 1;
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

function requiredDefinition(
  record: Record<string, DefinitionVersionRef>,
  key: string,
): DefinitionVersionRef {
  const value = record[key];
  if (value === undefined) {
    throw new Error(`Missing variable definition for "${key}".`);
  }
  return value;
}
