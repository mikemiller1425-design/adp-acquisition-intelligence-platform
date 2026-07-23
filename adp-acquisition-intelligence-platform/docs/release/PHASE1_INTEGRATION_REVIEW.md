# Phase 1 Integration Review

**Baseline:** `61c6348`

## Data flow (happy path)

```text
CSV/manual collection → normalization/identity
  → evidence/variables → completeness/scoring
  → qualification (OperationalStateService)
  → discovery mapping → variable confirm → score deltas
  → outreach (consent gate) → activities/responses
  → opportunity eligibility/create/stages
  → reporting queries/exports → web dashboards
```

Parallel dimensions (`prospect_stage`, `research_status`, `outreach_status`, `data_freshness_status`, `opportunity_stage`) remain independent; UI filters must not collapse them.

## Interfaces and dependencies

| From | To | Contract |
|---|---|---|
| Web | `@adp/reporting` | Dashboard/table/saved-view/export DTOs via `reporting-client` |
| Outreach | `@adp/consent` | `evaluateOutreachPermission`; unknown ≠ allowed |
| Discovery | `@adp/qualification` | Blocking conditions + prospect stage transitions |
| Discovery | variables/evidence/scoring ports | Confirm mapping → deltas |
| Opportunities | OperationalStateService | `prospect_stage=opportunity` + opportunity_stage history |
| Reporting | orgs/scores/discovery/outreach/opportunities tables | Read-only queries + territory scope |
| Worker | platform jobs | Heartbeat; score recalc registration seam |
| API | database/platform | Health/readiness; domain routes largely deferred |

## Failure points

| Point | Mitigation | Residual risk |
|---|---|---|
| Consent unknown at enroll/approve/send-record | Server block + audit | Legal policy for real send still open |
| Open blocking qualification conditions | Discovery agenda/schedule blocked | Operator must waive/resolve |
| Export without matching auth scope | Denied | Fixture reporting mode in web default |
| Drizzle generate with missing intermediate snapshots | Hand-reviewed SQL policy | Operator error if regenerate blindly |
| Demo web auth | Documented non-prod | Must not deploy as-is |

## Hidden coupling / debt

- Long auto-generated FK names truncated by Postgres (cosmetic/ops noise).
- Web default `ADP_REPORTING_PROVIDER=fixture` can mask postgres wiring mistakes in demos.
- Prompt packets 7–9 not checked into `docs/prompts/`.
- API surface remains thin relative to service packages (intentional Phase 1 deferral).

## Circular dependencies

None found by dependency-cruiser.

## Conclusion

Integration seams are explicit and tested at package boundaries. Coupling is acceptable for Phase 1. Primary residual risks are **operational/deployment** (IdP, postgres reporting mode, legal send) rather than unknown cross-module cycles.
