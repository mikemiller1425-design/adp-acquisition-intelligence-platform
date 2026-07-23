# Prompt 12 Security and Privacy Review

**Status:** Engineering checklist evidence — **independent security/privacy owner sign-off pending**  
**Baseline:** `86bcab1` (Prompt 11)  
**Reviewed surface:** Phase 1 modular monolith as implemented (Prompts 1–11)  
**Method:** Architecture Review Checklist §F against actual code, tests, and configuration

## Summary

| Area | Engineering assessment | Owner sign-off |
|---|---|---|
| Authentication | Demo env session only; OIDC ports defined, not production-wired | **Pending** — production IdP (ADR-004) |
| Authorization | Service-layer territory/role checks in domain packages; web uses role gates | **Pending** — independent review |
| Consent / opt-out | `ConsentPermissionService` enforced in outreach; DB immutability triggers | Engineering evidence complete |
| Export / PII | Redaction, expiry, scope revalidation on download | Engineering evidence complete |
| Injection / upload | CSV validation, formula escape, size limits, malware scan port | Engineering evidence complete |
| Autonomous send | Absent — no external delivery adapters | Verified |
| Logging / secrets | Redaction keys in logger; secrets in env only | **Pending** — production log review |
| Threat model document | Checklist below; no separate formal threat-model workshop artifact | **Pending** |

**QAR-002 conclusion:** Checklist evidence recorded; **not** equivalent to independent security/privacy release approval.

## Review checklist (actual surface)

### F-01 Authentication and session

| Control | Implementation | Evidence | Gap |
|---|---|---|---|
| Server-side auth port | `AuthenticationPort` in `@adp/platform` | `packages/platform/src/auth/index.ts` | Production OIDC adapter not configured |
| Web session | Env-based demo principal | `apps/web/src/lib/auth.ts` | Not Entra ID; acceptable for Phase 1 dev only |
| API auth | Health routes only in Prompt 1 scope | `apps/api/src/app.test.ts` | Full API auth composition deferred to production wiring |
| Session secret | `SESSION_SECRET` in config schema | `.env.example`, `packages/platform/src/config/index.ts` | Production secret management not validated |

### F-02 Authorization (object, field, territory)

| Control | Implementation | Evidence | Gap |
|---|---|---|---|
| Territory scoping | ADR-003; reporting `ReportingAuthorizationScope` | `@adp/reporting`, web `toReportingScope` | Independent pen-test not run |
| Role-based UI gates | `roleCanAccess` on routes | `apps/web/src/lib/auth.ts`, component tests | UI gate is not sole enforcement |
| Service authorization | Qualification, collection, outreach deny unauthorized actors | Integration tests per package | — |
| Cross-territory read block | Tested in qualification/collection suites | `qualification-workflow.integration.test.ts` | — |

### F-03 Input validation and injection

| Control | Implementation | Evidence | Gap |
|---|---|---|---|
| CSV binary/null/path traversal | `validateCsvArtifact` | `collection.security.test.ts` | — |
| Report formula injection | `sanitizeReportCell` | `collection.security.test.ts` | — |
| Upload size limits | Enforced before storage | `ImportUploadService` security test | Production object store policies not rehearsed |
| SQL access | Drizzle ORM parameterized queries | Repository implementations | ORM misuse review not formalized |
| XSS | React default escaping; no `dangerouslySetInnerHTML` in catalog screens | Web component review | No dedicated XSS fuzz suite |

### F-04 Consent, outreach, and privacy

| Control | Implementation | Evidence | Gap |
|---|---|---|---|
| Opt-out precedence | Global > org > channel > contact permission | `consent-permission-service.ts`, TESTING_MASTER_PLAN §14 | — |
| Outreach block on opt-out | `OutreachReadinessService` + consent adapters | `outreach-workflow.integration.test.ts` | — |
| No autonomous external send | No SMTP/LinkedIn/send adapters | Scope review Prompts 8–12 | **Legal/privacy policy for real-world send: NOT READY** |
| Consent immutability | DB triggers reject rewrites | `database.integration.test.ts` | — |
| Import cannot lift opt-out | Consent port on import commit | Collection integration tests | — |

### F-05 Export and data minimization

| Control | Implementation | Evidence | Gap |
|---|---|---|---|
| Export authorization | Scope match on request/download | `export-service.ts`, reporting integration tests | Web download route uses fixture path in default config |
| Channel redaction | `applyExportRedaction` | `reporting-workflow.integration.test.ts` | — |
| Export expiry | 7-day default; `expireDueExports` | Export runbook + integration test | Production cron not deployed |
| Classification notice | Default notice on export jobs | `DEFAULT_CLASSIFICATION_NOTICE` | Legal text approval pending |

### F-06 Audit and logging

| Control | Implementation | Evidence | Gap |
|---|---|---|---|
| Append-only audit | `audit_events` + rejection triggers | Database integration tests | Production retention job not deployed |
| Sensitive field redaction | Logger redaction list | `packages/platform/src/logging/index.ts` | Production log aggregation review pending |
| PII in fixtures | Test emails use `example` domains | Test support fakes | — |

### F-07 Dependencies and supply chain

| Control | Implementation | Evidence | Gap |
|---|---|---|---|
| Lockfile | `pnpm-lock.yaml` frozen in CI | `pnpm install --frozen-lockfile` | No automated CVE gate in `pnpm validate` |
| Dependency boundaries | dependency-cruiser | `tooling/dependency-cruiser.cjs` in validate | License audit not automated |

### F-08 Phase 1 non-goals verified absent

| Non-goal | Verified |
|---|---|
| Autonomous outbound sending | No send provider integrations |
| Referral partner ecosystem | No partner tables/workflows |
| Predictive ML weight learning | Scores deterministic from approved definitions |
| Production CRM sync | Not implemented |

## Open sign-offs (explicit)

1. **Security/privacy owner** — independent review of auth productionization, logging, export legal notice, and consent operations.
2. **Legal/privacy policy** — real-world outreach execution (carried from Prompt 8 handoff; **NOT READY**).
3. **Production configuration** — OIDC, secrets management, rate limits, CSRF for production web — not validated in this environment.

## Recommendation

Engineering checklist: **no critical or high unresolved defects identified** in reviewed surface. Release gate QAR-002 remains **pending** until named security/privacy owner approval.

## References

- [Architecture Review Checklist §F](../11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md)
- [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md)
- [Consent Opt-Out Incident Runbook](../14-runbooks/CONSENT_OPT_OUT_INCIDENT.md)
- [Prompt 8 Handoff — legal note](PROMPT_8_HANDOFF.md)
