# Documentation Index

## Authority and reading order

1. [Product Vision](01-product/PRODUCT_VISION.md) — mission, outcomes, scope, and phase boundary.
2. [Phase 1 Functional Specification](02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md) — authoritative business behavior.
3. [Business Entity Catalog](03-business/BUSINESS_ENTITY_CATALOG.md) and [Workflow State Machine](07-workflows/WORKFLOW_STATE_MACHINE.md) — business nouns and lifecycle.
4. [Technical Architecture](04-architecture/PHASE_1_TECHNICAL_ARCHITECTURE.md), [Database Architecture](05-data/DATABASE_ARCHITECTURE.md), [Operational State and Consent Model](05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md), and [Repository Blueprint](06-repository/REPOSITORY_BLUEPRINT.md) — implementation structure and parallel-state/consent contracts.
5. [Variable Dictionary](05-data/VARIABLE_DICTIONARY.md) and [Scoring Engine Specification](08-scoring/SCORING_ENGINE_SPECIFICATION.md) — intelligence semantics.
6. [UI Screen Catalog](09-ui/UI_SCREEN_CATALOG.md) and [Dashboard Specification](10-dashboards/DASHBOARD_SPECIFICATION.md) — operator experience.
7. [Implementation Constitution](11-implementation/IMPLEMENTATION_CONSTITUTION.md), [Architecture Review Checklist](11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md), [Implementation Roadmap](11-implementation/IMPLEMENTATION_ROADMAP.md), and [Testing Master Plan](12-testing/TESTING_MASTER_PLAN.md) — delivery and review rules.
8. [Architecture Decision Records](adr/README.md) — Prompt 1 accepted decisions (DEC-001–012).
9. [Database setup](development/DATABASE_SETUP.md), [Migration Guide](development/MIGRATION_GUIDE.md), [Evidence and Provenance Guide](development/EVIDENCE_AND_PROVENANCE_GUIDE.md), [Variable Definition Guide](development/VARIABLE_DEFINITION_GUIDE.md), [Import Pipeline Guide](development/IMPORT_PIPELINE_GUIDE.md), [Normalization Policy](development/NORMALIZATION_POLICY.md), [Duplicate and Merge Guide](development/DUPLICATE_AND_MERGE_GUIDE.md), and [Import Recovery Runbook](operations/IMPORT_RECOVERY_RUNBOOK.md) — local database and Prompt 3/4 domain operations.
10. [Phase 1 Exit Contract](13-exit-contract/PHASE_1_EXIT_CONTRACT.md) and [machine-readable checklist](13-exit-contract/phase_1_exit_contract.yaml) — definition of done.
11. [Prompt 0 readiness](00-readiness/PROMPT_0_READINESS_REPORT.md), [Prompt 2 implementation](prompts/PROMPT_2_CANONICAL_DATA_MODEL.md), [Prompt 3 implementation](prompts/PROMPT_3_VARIABLES_EVIDENCE_PROVENANCE.md), [Prompt 4 implementation](prompts/PROMPT_4_COLLECTION_AND_IDENTITY_RESOLUTION.md), and [specification reviews](01-reviews/) — readiness and prompt reviews.

## Conflict policy

Requirements use RFC 2119-style words: **MUST**, **SHOULD**, and **MAY**. If documents conflict, the functional specification controls business behavior, the technical architecture controls dependency direction, the [Operational State and Consent Model](05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md) controls parallel operational dimensions and consent/permission enforcement, and the exit contract controls release acceptance. Do not silently resolve a conflict: record it in an architecture decision record and update every affected canonical document in the same change.

## Repository map

```text
docs/
├── README.md
├── 00-readiness/
├── adr/
├── 01-product/PRODUCT_VISION.md
├── 01-reviews/
├── 02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md
├── 03-business/BUSINESS_ENTITY_CATALOG.md
├── 04-architecture/PHASE_1_TECHNICAL_ARCHITECTURE.md
├── 05-data/
│   ├── DATABASE_ARCHITECTURE.md
│   ├── OPERATIONAL_STATE_AND_CONSENT_MODEL.md
│   └── VARIABLE_DICTIONARY.md
├── 06-repository/REPOSITORY_BLUEPRINT.md
├── 07-workflows/WORKFLOW_STATE_MACHINE.md
├── 08-scoring/SCORING_ENGINE_SPECIFICATION.md
├── 09-ui/UI_SCREEN_CATALOG.md
├── 10-dashboards/DASHBOARD_SPECIFICATION.md
├── 11-implementation/
│   ├── IMPLEMENTATION_CONSTITUTION.md
│   ├── IMPLEMENTATION_ROADMAP.md
│   └── 16_ARCHITECTURE_REVIEW_CHECKLIST.md
├── 12-testing/TESTING_MASTER_PLAN.md
├── 13-exit-contract/
│   ├── PHASE_1_EXIT_CONTRACT.md
│   └── phase_1_exit_contract.yaml
├── development/
│   ├── DATABASE_SETUP.md
│   ├── DUPLICATE_AND_MERGE_GUIDE.md
│   ├── EVIDENCE_AND_PROVENANCE_GUIDE.md
│   ├── IMPORT_PIPELINE_GUIDE.md
│   ├── MIGRATION_GUIDE.md
│   ├── NORMALIZATION_POLICY.md
│   └── VARIABLE_DEFINITION_GUIDE.md
├── operations/
│   └── IMPORT_RECOVERY_RUNBOOK.md
└── prompts/
    ├── PROMPT_1_ENGINEERING_FOUNDATION.md
    ├── PROMPT_2_CANONICAL_DATA_MODEL.md
    ├── PROMPT_3_VARIABLES_EVIDENCE_PROVENANCE.md
    └── PROMPT_4_COLLECTION_AND_IDENTITY_RESOLUTION.md
```

## Change control

Each document carries a version and status. Semantic changes require an ADR, test impact analysis, and version update. Score rule changes always create a new score version; they never rewrite historical results.
