# Consent and Opt-Out Incident Runbook

**Status:** Prompt 12 operational runbook  
**Authority:** [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md)  
**Enforcement:** `ConsentPermissionService` (`@adp/consent`) — UI disablement is not enforcement

## When to use

- Contact or organization requests opt-out, suppression, or channel restriction
- Outreach attempt blocked unexpectedly (`blocked_restriction`, `unknown` permission)
- Suspected consent evaluation bypass or incorrect channel exposure in export/report
- Import or merge attempted to weaken consent state

## Consent precedence (most restrictive wins)

1. Global suppression (`suppression_entries` scope = global)
2. Organization communication restriction
3. Channel-specific suppression
4. Contact channel permission (`unknown` blocks outreach in Phase 1 safe defaults)

Expired or revoked entries are inactive. Import cannot lift opt-out (tested in collection integration).

## First response

1. **Stop outreach activity** — do not attempt external send; Phase 1 has no autonomous send adapters.
2. **Identify subject** — organization ID, contact ID, channel, identifier hash if applicable.
3. **Query current state:**
   - `contact_channel_permissions` for the contact/channel
   - `organization_communication_restrictions` for org-level blocks
   - `suppression_entries` (global, org, contact, channel scopes)
4. **Check audit trail** — `audit_events` and consent evidence links (`permission_evidence_links`).
5. **Re-evaluate** via `ConsentPermissionService.evaluateOutreachPermission` with the same inputs the outreach service would use.

## Service-level verification

Outreach workflow integration tests (`packages/outreach/src/__tests__/outreach-workflow.integration.test.ts`) prove:

- Opt-out after enrollment blocks further activities
- Global suppression blocks all channels
- `unknown` permission blocks outreach readiness
- Denials are auditable; scores are not altered by consent checks alone

Re-run targeted suite after remediation:

```bash
export DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
pnpm --filter @adp/outreach test
pnpm --filter @adp/consent test
```

## Remediation actions

| Scenario | Action |
|---|---|
| Valid opt-out request | Create or supersede `suppression_entries` / update `contact_channel_permissions` with evidence link; document actor and source |
| Incorrect block | Review evidence chain; revoke erroneous suppression with `revokedAt`; never hard-delete consent rows (DB triggers reject) |
| Export exposed restricted channel | Verify `ExportService` / `applyExportRedaction`; regenerate export; confirm `redactions` metadata on job |
| Import tried to clear opt-out | Block commit — `InMemoryConsentPort` and PG integration preserve consent; fix source data |

## Escalation

Escalate to engineering when:

- Database triggers (`adp_reject_consent_record_rewrite`) fire unexpectedly
- Audit events disagree with permission tables
- Outreach service proceeds despite `evaluateOutreachPermission` denial (should not occur — treat as **critical**)

## Legal / privacy sign-off (open)

Phase 1 implements technical consent enforcement with safe defaults. **Real-world outreach execution** requires:

- Approved privacy policy and legal review for outbound communications
- Production identity, delivery adapters, and data-processing agreements

Until those sign-offs exist, treat all outreach as **human-approved, in-platform tracking only** — not production customer outreach.

## Evidence references

- `packages/consent/src/application/consent-permission-service.ts`
- `packages/outreach/src/infrastructure/consent-adapters.ts`
- `packages/reporting/src/application/export-service.ts` (`applyExportRedaction`)
- TESTING_MASTER_PLAN scenario 14 (consent precedence)
