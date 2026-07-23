# Phase 1 — Security & Privacy Review

**Status:** Design review only (no redesign)  
**Baseline:** `docs/01-reviews/PROMPT_12_SECURITY_PRIVACY_REVIEW.md`  
**Date:** 2026-07-23  
**Branch tip:** `cursor/phase1-acceptance-gate-dd2b` on Prompt 12 tip

---

## Summary

Phase 1 provides a **defensible engineering security baseline** for a private internal application: secrets via env, session cookies with httpOnly/sameSite, CSRF on cookie mutations, RBAC middleware, Zod validation on API bodies, PII classification enums, and audit event tables. **Independent security owner review** and **privacy/legal review for real-world outreach** remain **OPEN**.

---

## Secrets & environment

| Item | Finding | Severity |
|------|---------|----------|
| Secrets in git | No committed `.env`; `.env.example` placeholders only | OK |
| Runtime secrets | `DATABASE_URL`, `SESSION_SECRET`, `CSRF_SECRET`, API keys via env | OK |
| Docker compose | Dev credentials (`adp`/`adp`) — not production | Info |
| Secret rotation | Documented as operational procedure; not automated | Open ops |

---

## Authentication & session

| Item | Finding |
|------|---------|
| Auth | Session cookie auth (`@adp/auth`) |
| Cookie flags | httpOnly, sameSite=lax, secure in production |
| CSRF | Required for cookie-authenticated mutations |
| Password hashing | Present in auth package (bcrypt/scrypt per implementation) |
| MFA / SSO | Not Phase 1 — deferred |
| Session fixation | Relies on new session on login — verify in owner review |

---

## Authorization

| Item | Finding |
|------|---------|
| RBAC | Roles: viewer / analyst / admin / owner |
| Enforcement | Middleware on API routes; UI gates for privileged actions |
| IDOR | Handlers should scope by org/user; spot-check needed in owner review |
| Privilege escalation | Admin/owner gated; no public registration assumed |

---

## Input validation & injection

| Item | Finding |
|------|---------|
| Validation | Zod schemas on API request bodies |
| SQL | Drizzle parameterized queries — no string-concat SQL found in app packages |
| XSS | React escaping; CSP headers on Next app |
| Path traversal | File ingest paths should be constrained (ops) |
| Command injection | No shell exec of user input observed in core packages |

---

## Rate limiting

| Item | Finding |
|------|---------|
| API rate limit | Present on web API layer |
| Outreach rate limits | Configured in outreach settings / scheduler |
| Abuse of discovery | Provider rate limits + circuit breakers |

---

## Audit logging

| Item | Finding |
|------|---------|
| Tables | `audit_events`, `security_events`, `privacy_events` |
| Coverage | Auth, config, export, outreach-related events expected |
| Tamper resistance | Append-oriented application writes; no WORM store in Phase 1 |

---

## PII handling & retention

| Item | Finding |
|------|---------|
| Classification | Enums on contact/org fields (`pii_classification`) |
| Retention | Policy tables / retention jobs scaffolded |
| Export | Export jobs with audit |
| Redaction | UI/API should respect classification — owner privacy review needed |
| Right to erasure | Process documented as ops; not fully productized |

---

## Encryption

| Item | Finding |
|------|---------|
| Transit | TLS required in production deployment (ops) |
| At rest | Relies on Postgres / disk encryption (ops) |
| Backups | Encrypted backup **restore proof** still OPEN (RB-007) |
| Secrets at rest | Env / secret manager — not app-managed KMS |

---

## Dependency vulnerabilities

| Item | Finding |
|------|---------|
| Lockfile | `pnpm-lock.yaml` committed |
| Audit | `pnpm audit` not gated in CI as fail-closed — recommend periodic ops audit |
| Known critical | Not exhaustively scanned in this gate — **RB-008** open for production |

---

## Explicit open items (must stay OPEN without owner evidence)

1. Independent security review sign-off  
2. Privacy review sign-off  
3. Legal approval for live outreach send  
4. Production IdP / SSO decision  
5. Encrypted backup restore drill evidence  
6. Dependency vulnerability gate for production cutover  

---

## Recommendation

**Do not redesign.** Accept engineering baseline for Phase 1 closeout. **Do not enable live external outreach** until legal/privacy approve. Proceed to Phase 2 product work only with conditions listed in `PHASE2_READINESS.md`.
