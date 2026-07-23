# Phase 1 Implementation Matrix

**Baseline:** `61c6348`  
**Authority:** IMPLEMENTATION_ROADMAP.md + Prompt handoffs 0–12

| Prompt | Required deliverables | Implemented | Validated | Tested | Outstanding | Evidence |
|---:|---|---|---|---|---|---|
| 0 | Spec freeze, conflict log, readiness | Yes | Yes | Doc validation | — | `PROMPT_0_READINESS_REPORT.md` |
| 1 | Monorepo, apps, config, auth/audit scaffolds, CI | Yes | Yes | api/web/worker/platform | Production OIDC wiring | `PROMPT_1_HANDOFF.md`, CI |
| 1.5 | CONF-005/009 operational state + consent model | Yes | Yes | consent + ops-state tests | — | `PROMPT_1_5_*`, consent package |
| 2 | Canonical schema, migrations, orgs/contacts/consent | Yes | Yes | database + organizations | — | migrations `0000`–`0001`, handoff |
| 3 | Variables, evidence, provenance, confidence | Yes | Yes | variables + evidence | — | migration `0002`, handoff |
| 4 | Collection, CSV import, identity/duplicates | Yes | Yes | collection (28) | Browser import UX polish | migration `0003`, handoff |
| 5 | Completeness + 9 score families, golden replay | Yes | Yes | scoring (16) | Live score ops beyond baseline | migration `0004`, golden fixtures |
| 6 | Qualification, conditions, re-entry, prospect matrix | Yes | Yes | qualification (21/42) | Thin API routes deferred | migration `0005`, handoff |
| 7 | Discovery agenda/session/mapping/rescore | Yes | Yes | discovery | Prompt packet missing in docs/prompts | migration `0006`, `DISCOVERY_MODEL.md` |
| 8 | Outreach readiness, drafts, consent rechecks | Yes | Yes | outreach | Real-world send **NOT READY** (legal) | migration `0007`, `OUTREACH_MODEL.md` |
| 9 | Opportunities lifecycle, pipeline queries | Yes | Yes | opportunities | Secondary motions deferred | migration `0008`, `OPPORTUNITY_MODEL.md` |
| 10 | Reporting metrics D1–D8, saved views, exports | Yes | Yes | reporting (11) | Web export download E2E | migration `0009`, `REPORTING_MODEL.md` |
| 11 | UI catalog + dashboards bound to reporting | Yes | Yes | web (14) | Chart depth; export UI partial | UI-01…27 routes, handoff |
| 12 | Hardening, runbooks, acceptance package | Yes | Yes | `pnpm validate` | Owner sign-offs open | `PROMPT_12_*`, runbooks |

**Nothing omitted:** every roadmap prompt has an architecture review and handoff. Executable Markdown packets exist for Prompts 1–6 and 10–12; Prompts 7–9 were implemented from accepted handoff chain without checked-in prompt packets (documentation debt, not missing software).
