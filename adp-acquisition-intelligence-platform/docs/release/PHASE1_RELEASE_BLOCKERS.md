# Phase 1 — Release Blockers

**Authoritative blocker table for Phase 1 closeout.**  
**Date:** 2026-07-23  
**Rule:** Items remain **OPEN** unless evidence already exists in-repo.

---

## Blocker table

| ID | Severity | Category | Description | Owner | Required Evidence | Blocking Release | Blocking Phase 2 | Status |
|----|----------|----------|-------------|-------|-------------------|------------------|------------------|--------|
| RB-001 | Critical | Security | Independent security review sign-off of auth, CSRF, RBAC, secrets, injection posture | Security owner | Signed review memo or ticket linking to `PHASE1_SECURITY_PRIVACY_REVIEW.md` + Prompt 12 security review | YES | NO* | OPEN |
| RB-002 | Critical | Privacy | Privacy review of PII classification, retention, export, redaction, contact data handling | Privacy owner | Signed privacy review / DPIA excerpt | YES | NO* | OPEN |
| RB-003 | Critical | Legal | Legal approval for **real-world outreach send** (CAN-SPAM/CASL/etc., consent, suppression) | Legal | Written approval that live send may be enabled | YES (for live send) | NO* | OPEN — **NOT READY** for live send |
| RB-004 | High | Business | Production scoring model / threshold approval beyond engineering baseline | Product / Ops | Signed scoring config for production | YES (prod scoring claims) | NO* | OPEN |
| RB-005 | High | Performance | **100k organization** validation (load + query budgets) | Eng / Ops | Load test report meeting agreed SLOs | YES (scale claim) | NO* | OPEN |
| RB-006 | High | Testing | Full **browser E2E** (QAR-005) across critical UI flows | QA / Eng | Green Playwright (or equiv.) suite in CI or attached artifact | YES (UX production sign-off) | NO* | OPEN |
| RB-007 | High | Operations | **Encrypted backup restore** drill proven | Ops | Restore log + checksum verification from encrypted backup | YES | NO* | OPEN |
| RB-008 | High | Security | Production dependency vulnerability gate (`pnpm audit` / SCA) with accepted residual risk | Sec / Eng | Audit report + exception log | YES | NO* | OPEN |
| RB-009 | High | Deployment | Production deployment (IdP/SSO decision, TLS, secrets manager, monitored env) | Ops | Deploy checklist completed; env live | YES | NO* | OPEN |
| RB-010 | Medium | Documentation | Prompt packets 7–9 missing under `docs/prompts/` | Eng | Packets restored or explicitly waived | NO | NO | OPEN |
| RB-011 | Medium | Architecture | Drizzle meta snapshots missing for migrations `0001`, `0004`, `0005` | Eng | Snapshots added or waived with migrate-test proof | NO | NO | OPEN |
| RB-012 | Medium | Operations | Production observability (alerts, dashboards, on-call) beyond app logs | Ops | Runbook + alert hooks configured | YES (ops maturity) | NO* | OPEN |
| RB-013 | Low | Testing | Live external provider contract tests not in CI (mocks only) | Eng | Sandbox contract suite or waiver | NO | NO | OPEN |
| RB-014 | High | Legal / Data | Licensing approval for bulk population datasets before enablement beyond internal/fixture sources | Legal / Data steward | Written license approval + `population_sources.approval_status`/`license_status` evidence | YES (licensed bulk enablement) | NO* | OPEN |
| RB-015 | Critical | Legal / Privacy / Security | Live public-source and archived-web legal + privacy + security approval before network egress | Legal / Privacy / Security | Signed reviews on `approved_sources` terms/privacy/legal/security + kill-switch-off change control | YES (live/archive egress) | NO* | OPEN |
| RB-016 | High | Operations | Production object-storage backup and retention for `source_snapshots` bodies (`storage_key`) | Ops | Object-store config + backup/retention proof aligned with ADR backup/retention | YES (prod snapshot durability) | NO* | OPEN |
| RB-017 | High | Product / Security | Extraction provider / AI extraction approval (deterministic seam only today; auto-accept remains off) | Product / Security | Provider approval + mapping/version policy; no silent auto-confirm | YES (AI extraction enablement) | NO* | OPEN |

\* **Blocking Phase 2** column: Per acceptance-gate policy, Phase 2 **product development** may begin **YES WITH CONDITIONS** while these remain OPEN, provided owners **explicitly accept** residual risk and **do not** enable live outreach / production cutover until Release-blocking items for that capability are closed. Items marked Blocking Release = YES still block **production release** and capability claims.

### Phase 1.2 note (orchestration does not close blockers)

Phase 1.2 adds bounded **Start Research Run** orchestration (fixture pilot UI, launch gates, draft archive/live adapters). It does **NOT** close **RB-014**, **RB-015**, **RB-016**, or **RB-017**. `ADP_LIVE_RESEARCH_ENABLED` remains **false** by default. See `docs/release/PHASE_1_2_RESEARCH_RUN_COMPLETION.md`.

---

## Explicit must-remain-OPEN list (no evidence in-repo)

| Capability | Status |
|------------|--------|
| Independent security review | OPEN (RB-001) |
| Privacy review | OPEN (RB-002) |
| Legal approval for outreach | OPEN (RB-003) — live send **NOT READY** |
| Production scoring approval | OPEN (RB-004) |
| 100k organization validation | OPEN (RB-005) |
| Encrypted backup restore | OPEN (RB-007) |
| Browser E2E (QAR-005) | OPEN (RB-006) |
| Production deployment | OPEN (RB-009) |
| Bulk population licensing | OPEN (RB-014) |
| Live / archived-web public-source approvals | OPEN (RB-015) — live egress **NOT READY** |
| Snapshot object-storage backup/retention | OPEN (RB-016) |
| AI / extraction provider approval | OPEN (RB-017) |

---

## Non-blockers for Phase 2 start (engineering)

- Missing Prompt 7–9 packets (RB-010) — documentation chore  
- Missing drizzle snapshots (RB-011) — migrate tests currently pass  
- OpenAPI absence — Phase 1 N/A  
- MFA/SSO — deferred by design  

---

## Owner acceptance statement (template)

> We accept that Phase 2 engineering may begin while RB-001…RB-009 remain OPEN for **production release**. We will not enable live outreach send until RB-003 is CLOSED. We will not claim 100k-org or production readiness until RB-005/RB-007/RB-009 are CLOSED. We will not enable licensed bulk population datasets until RB-014 is CLOSED, live/archived public-source egress until RB-015 is CLOSED, production snapshot object-storage claims until RB-016 is CLOSED, or AI extraction until RB-017 is CLOSED.

*(Not signed in this repository — owners must record acceptance externally or by updating Status columns.)*
