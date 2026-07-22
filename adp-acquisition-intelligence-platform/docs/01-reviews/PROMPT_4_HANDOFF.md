# Prompt 4 Handoff

**Status:** READY FOR PROMPT 5  
**Architecture verdict:** [PASS_WITH_NON_BLOCKING](PROMPT_4_ARCHITECTURE_REVIEW.md)  
**PostgreSQL gate:** [PASSED on PG17](PROMPT_4_POSTGRESQL_17_GATE.md)

## What Prompt 5 can rely on

- Collection package public exports are versioned service/domain contracts.
- Import commit creates organizations/locations/contacts or links reviewed duplicates and records evidence, observation, variable, consent, audit, and outbox side effects through ports.
- Variable proposal fields from imports are normalized and carried with evidence provenance IDs.
- Duplicate review is mandatory before duplicate batches can commit.
- Import reversal is compensating and refuses unsafe reversal through eligibility checks.
- Merge planning is explainable and preserves child reassignment intent without auto-merging.

## Validation status

- `@adp/collection`: 28 tests passing across unit, PG17 integration, security, e2e service, and performance suites.
- Full-repo validation is required before final merge and is tracked in the agent final response for this branch.

## Open non-blocking findings

1. API routes and UI screens for imports are deferred to later composition prompts.
2. DB-backed merge reversal requires persisted before/after restoration snapshots before implementing a concrete child move-back writer.
3. Dedicated import entity-link writer/reporting adapter remains deferred; row-level created refs and the table are present.

## Recommendation

Proceed to Prompt 5 scoring/completeness only after full validation remains green on this branch. Do not modify Prompt 4 import behavior from Prompt 5 except through public collection service contracts.

