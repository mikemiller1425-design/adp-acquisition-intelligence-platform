# Phase 1 — Test Matrix

**Date:** 2026-07-23  
**Runner:** `pnpm validate` → typecheck, lint, deps:check, unit, integration, migration, contract, smoke, quality-gates, architecture-freeze  

---

## Inventory by layer

| Layer | Location / mechanism | Status |
|-------|----------------------|--------|
| Unit | `packages/*/src/**/*.test.ts`, `apps/web` unit | Present |
| Integration | `packages/testing` + package integration suites | Present |
| Validation scripts | `scripts/validate.mjs`, quality-gates | Present |
| Migration tests | `pnpm test:migration` / drizzle migrate apply | Present |
| Reporting tests | `@adp/reporting` + API route tests | Present |
| Dashboard / UI | Playwright smoke + component tests | Partial (QAR-005 full E2E open) |
| API | Route handler tests under `apps/web` | Present |
| Architecture | Dependency-cruiser / freeze scripts | Present |
| Quality gates | QAR scripts under `scripts/` / `packages/testing` | Present |

---

## Prompt coverage (tests)

| Prompt | Unit | Integration | Notes |
|--------|------|-------------|-------|
| 0 | Architecture freeze | Freeze scripts | |
| 1–2 | DB / config tests | Migration apply | |
| 3 | Collection / normalize | Pipeline tests | |
| 4 | Enrichment | Job tests | |
| 5 | Scoring | Formula tests | |
| 6 | Fit | Fit tests | |
| 7 | Discovery | Adapter + run tests | |
| 8 | Outreach | Draft/approve/send path tests (sandbox) | Live send blocked |
| 9 | Opportunities | CRUD / stage tests | |
| 10 | Reporting | Snapshot/job tests | |
| 11 | UX | Smoke + UI markers | Full browser E2E open |
| 12 | Hardening | Security/privacy unit + gates | Owner review open |

---

## Coverage gaps

| Gap | Severity | Blocker? |
|-----|----------|----------|
| Full browser E2E across all 27 UI surfaces | High for UX sign-off | RB-006 (Phase 2 product OK with conditions) |
| 100k-org load test | High for scale claim | RB-005 |
| Encrypted backup restore automated test | Ops | RB-007 |
| Live provider contract tests in CI | Medium | Sandbox/mocks used |
| Visual regression | Low | Not required Phase 1 |
| Chaos / failure injection | Low | Manual |

---

## Flaky / skipped

| Check | Result |
|-------|--------|
| `.skip` / `it.skip` / `describe.skip` in apps/packages | **0 found** (2026-07-23 grep) |
| `test.todo` | **0 found** |
| Known flaky suite | None documented |

---

## Regression priorities (do not implement here)

1. Auth + CSRF mutation path  
2. Scoring determinism snapshot  
3. Outreach approve/send gate (must stay blocked without legal)  
4. Migration up from empty DB  
5. Report job happy path  

---

## Conclusion

Test system is **credible for Phase 1 engineering acceptance**. Remaining gaps are **explicitly tracked as release blockers**, not hidden.
