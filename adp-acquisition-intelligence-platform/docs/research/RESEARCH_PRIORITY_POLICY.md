# Research Priority Policy

**Version:** `research-priority-draft-v1`  
**Status:** Draft — **production activation gated**  
**Config:** `config/research/research_priority.v1.yaml`  
**Code:** `packages/research/src/domain/research-priority.ts`, `ResearchPriorityService`  
**Related:** [Bulk Enrichment Architecture](BULK_ENRICHMENT_ARCHITECTURE.md), [Public Source Collection Architecture](PUBLIC_SOURCE_COLLECTION_ARCHITECTURE.md)

## Purpose

Rank organizations for research effort so operators spend live/targeted collection on high-value gaps and default everyone else to bulk/archive enrichment or deferral.

## Conceptual formula (not production-activated)

```text
Research priority ≈ expected commercial value
                  × expected information gain
                  × source availability
                  ÷ expected collection cost
```

`production_activation_gated: true` and `formula_status: draft_not_approved` in config. Numeric weights are **not** approved for production. The implemented function is an **explainable rules draft** that always returns `productionActivationGated: true`.

## Tiers

| Tier | Meaning | Typical sources recommended |
|---|---|---|
| **A** | Deep research now | Fixture/org website + archive (when enabled) |
| **B** | Standard enrichment | Same as A with delayed eligibility |
| **C** | Bulk enrichment only | Archive/bulk seams |
| **D** | Do not research / defer | None |

## Blocking → tier D

Any of:

- `out_of_territory`
- `existing_relationship`
- `organization_inaccessible`
- `no_approved_source` (`sourceAvailability === 'none'`)

## Draft promotion rules (implemented)

| Condition | Tier |
|---|---|
| High commercial + high gain + high-impact gaps/contradictions + low cost | **A** |
| Medium/high commercial + (high gain or ≥3 completeness gaps) + source availability not low | **B** |
| Low gain and zero completeness gaps | **D** |
| Default otherwise | **C** |

Recommended sources in draft code:

- A/B → `organization_website_fixture`, `archived_web_fixture`
- C → `archived_web_fixture`
- D → none

Next-eligible research dates (draft): A immediate, B +1 day, C +7 days.

## High-impact variables (config)

- `services.payroll_offered`
- `services.bookkeeping_offered`
- `services.cas_offered`
- `services.fractional_cfo_offered`
- `organization.locations_count`

## Persistence and events

Assessments persist to `research_priority_assessments` with policy version, tier, explanation, factors JSON, blocking reasons, and recommended sources.

Outbox: `research.priority_calculated` (includes `productionActivationGated`).

## Authorization

Capability `research_priority:view` — `admin`, `ops`, `reviewer`, `sales`, `viewer`.

## Activation requirements

Before treating tiers as production routing truth:

1. Product/ops approve numeric weights and thresholds
2. Document ADR or policy version bump beyond `research-priority-draft-v1`
3. Confirm recommended source keys match **enabled** approved sources (not fixtures alone)
4. Ensure priority never bypasses kill switch, robots, or claim-review gates

Until then, treat assessments as **advisory for controlled pilot** only.
