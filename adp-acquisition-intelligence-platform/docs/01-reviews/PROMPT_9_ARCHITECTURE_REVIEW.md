# Prompt 9 Architecture Review

**Status:** PASS  
**Scope reviewed:** opportunity schema/migration `0008`, `@adp/opportunities` services, seeds/config, operational-state integration, tests, and documentation.

## Findings

No critical or high findings.

## Review checklist

| Area | Result | Evidence |
|---|---|---|
| Scope control | PASS | No proposals, contracts, billing, dashboards UI, referrals, CRM, or ML forecasts. |
| Data model | PASS | Migration `0008_bizarre_tarantula.sql` creates 13 opportunity tables; model documented in `OPPORTUNITY_MODEL.md`. |
| Stage guards | PASS | Matrix enforced in `StageTransitionService`; terminal/reopen rules implemented. |
| Uniqueness | PASS | Partial unique index on `organization_id + primary_motion` for active stages. |
| Motion immutability | PASS | `primary_motion` set at create only (Phase 1). |
| Value/probability | PASS | Nullable value with currency check; manual/stage_default probability with history. |
| Operational state | PASS | Prospect `opportunity` transition on create; `opportunity_stage` in `operational_state_transitions`. |
| Human confirmation | PASS | Create requires `humanConfirmation` flag and DB check on confirmation columns. |
| Events | PASS | Audit/outbox `opportunity.*` events with `aggregateType=opportunity`. |
| Tests | PASS | Unit policy tests + integration create → contacts → value/probability → advance → close → reopen; negative paths. |

## Non-blocking notes

- Thin Fastify/Next routes deferred (same as Prompts 6–8).
- Pipeline query service implemented without dashboard UI (Prompt 10).
- Secondary commercial motions deferred; `primary_motion` text column only.

## Recommendation

**READY FOR PROMPT 10**
