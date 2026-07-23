# ADP Acquisition Intelligence Platform
## Phase 1 — Prompt 11: Web UX and All Dashboards

**Canonical packet path:** `docs/prompts/PROMPT_11_WEB_UX_AND_DASHBOARDS.md`  
**Depends on:** Prompts 4–10 (Prompt 10 READY FOR PROMPT 11 required)  
**Next:** Prompt 12

Prompt 11 begins only after Prompt 10 is complete and its architecture review recommends READY FOR PROMPT 11.

Implement the authenticated web UX for the UI Screen Catalog and bind dashboards D1–D8 to Prompt 10 reporting contracts. Business logic remains in services; UI does not bypass authorization or invent metrics.

### Authoritative documents

UI_SCREEN_CATALOG.md, DASHBOARD_SPECIFICATION.md, REPORTING_MODEL.md (from Prompt 10), OPERATIONAL_STATE_AND_CONSENT_MODEL.md, FUNCTIONAL SPEC, IMPLEMENTATION_CONSTITUTION, ROADMAP, TESTING_MASTER_PLAN, EXIT_CONTRACT (DSH/UI items), Architecture Review Checklist, Prompt 10 handoff.

### Scope

In scope:

- App shell (nav, search, tasks indicator, env badge, timezone)
- Screens UI-01…UI-27 at contract-complete depth for Phase 1 operability (tables, filters, saved views, drilldowns, empty/loading/denied/error states)
- Dashboards D1–D8 consuming `@adp/reporting` only
- Accessible table/keyboard patterns; URL-addressable filters including parallel dimensions
- Consent/channel action disablement with server remaining authoritative
- Component and accessibility tests; e2e smoke for login→dashboard→prospect table→export job status

Out of scope:

- Prompt 12 hardening/acceptance package
- Autonomous send integrations
- New metric formulas (freeze was Prompt 10)
- Phase 2 referral UX

### Exit

Architecture review PASS, READY FOR PROMPT 12, DSH UI evidence updated, `pnpm validate` green.
