# Entity Resolution Policy

**Version:** 1.0.0 (`entity-resolution-v1`)  
**Status:** Implemented  
**Config:** `config/research/entity_resolution_policy.v1.yaml`  
**Code:** `packages/research/src/domain/entity-resolution.ts`  
**Matcher:** reuses `@adp/collection` `matchDuplicateCandidate`  
**Related:** [Duplicate and Merge Guide](../development/DUPLICATE_AND_MERGE_GUIDE.md), [Target Universe Ingestion](TARGET_UNIVERSE_INGESTION.md)

## Policy intent

Entity resolution for population candidates must be **explainable and conservative**. Domain match is strong but not universally conclusive. Name similarity alone must never auto-merge. Likely matches require human review. Merges that do occur must go through existing merge services and preserve provenance.

## Decision vocabulary

| Decision | Meaning | Auto-apply on commit? |
|---|---|---|
| `create_new` | No usable match | Yes (when not dry-run) |
| `link_existing` | Exact multi-signal / strong identity match | Yes |
| `create_location` | Exact org match; recommend location under org | Manual / specialized path |
| `possible_duplicate` | Likely tier — human review before merge | **No** |
| `ambiguous_review` | Possible tier or name-only similarity | **No** |
| `reject` | Explicit reject | N/A |
| `restricted` | Source/policy restricted | **No** create/link |
| `existing_relationship` | Already related / out of prospecting scope | **No** |
| `out_of_territory` | Outside permitted territory | **No** |

## Matching algorithm (implemented)

`resolveEntity(incoming, candidates, context)`:

1. Short-circuit on context flags: `restricted`, `outOfTerritory`, `existingRelationship`.
2. If no candidates → `create_new`.
3. Rank candidates with `matchDuplicateCandidate` tiers: `exact` > `likely` > `possible`.
4. **Name-only guard:** if contributing signals are only `legal_name` / `aliases` (and not an exact tier exception path), force `ambiguous_review`.
5. Map best tier:
   - `exact` → `link_existing` (or `create_location` when `preferLocationUnderOrgId` matches)
   - `likely` → `possible_duplicate`
   - `possible` / name-only → `ambiguous_review`
   - else → `create_new`

Confidence scores recorded on candidates: exact 95, likely 75, possible 45.

## Signals retained

Each resolution candidate stores:

- `match_confidence` (0–100)
- `contributing_signals` / `conflicting_signals` (JSON)
- `recommended_action` + `decision_version` (`entity-resolution-v1`)

Human decisions land in `entity_resolution_decisions` with actor and rationale.

## Rules (config)

From `entity_resolution_policy.v1.yaml`:

1. **domain_strong_not_conclusive** — domain match is strong but not conclusive when legal identity conflicts.
2. **name_only_no_auto_merge** — name similarity alone must not automatically merge.
3. **no_uncontrolled_auto_merge** — likely matches require human review; exact links only with strong multi-signal or domain+identity.
4. **preserve_provenance** — merges use existing merge services; provenance preserved.

## Authorization

| Capability | Roles |
|---|---|
| `entity_resolution:resolve` | `admin`, `ops` |
| `entity_resolution:review` | `admin`, `reviewer` |

## Persistence

- `entity_resolution_runs` — import-scoped run + policy version + summary
- `entity_resolution_candidates` — proposed matches
- `entity_resolution_decisions` — final decisions

`raw_candidates.status` transitions toward `resolved`, `ambiguous`, `rejected`, or `restricted` as decisions land.

## Explicit non-behavior

- No silent merge of organizations during population import.
- No override of Prompt 4 merge planning / merge event audit trails.
- Collectors and extractors do not call entity resolution to “fix” identity mid-crawl beyond linking claims to an already chosen `organization_id` target.
