# Approved Source Registry

**Version:** 1.0.0 (`approved-sources-v1`)  
**Status:** Implemented  
**Table:** `approved_sources`  
**Config:** `config/research/approved_sources.v1.yaml`  
**Code:** `packages/research/src/domain/approved-source.ts`  
**Related:** [Public Source Collection Architecture](PUBLIC_SOURCE_COLLECTION_ARCHITECTURE.md), [Public Source Security Model](PUBLIC_SOURCE_SECURITY_MODEL.md)

## Purpose

No retrieval executes unless the source is in the approved registry, lifecycle is `enabled`, required reviews are `approved`, and the kill switch is off. The registry is the **allowlist of adapters**, not a free-form URL permission list.

## Lifecycle

```text
draft → under_review → approved → enabled ⇄ suspended → retired
```

Only **`enabled`** sources may execute. `canExecuteApprovedSource` also requires:

- `killSwitchActive === false`
- `termsReviewStatus`, `privacyReviewStatus`, `legalReviewStatus`, `securityReviewStatus` all `approved`

Self-approval by automation is forbidden (`assertHumanOwnerApprovalRequired`).

## Adapter types

| Type | Intended use |
|---|---|
| `fixture` | Deterministic CI / pilot |
| `bulk_archive` | Licensed/bulk archive dumps |
| `archived_web` | Archived web seams (e.g. Common Crawl class) |
| `licensed_data` | Licensed APIs/files |
| `public_api` | Explicit public APIs |
| `structured_metadata` | Structured public metadata feeds |
| `organization_website` | Live org sites (strictest controls) |

## Registry fields (selected)

| Field | Role |
|---|---|
| `source_key` / `display_name` | Stable identity |
| `domains` | Host allowlist (`*` only for fixture/pilot) |
| `classification` | e.g. `live`, `archive`, `live_simulated` |
| `permitted_fields` / `prohibited_fields` | Field allow/deny |
| `robots_behavior` | Default `respect` |
| `rate_limit_per_minute`, `concurrency_limit`, `page_limit` | Courtesy bounds |
| `response_size_limit_bytes`, `timeout_ms` | Abuse/DoS bounds |
| `redirect_policy` | Default `same_registrable_domain` |
| `refresh_interval_hours`, `snapshot_retention_days` | Freshness / retention |
| `parser_version`, `owner` | Operability |
| `approval_evidence` | JSON pointers to review artifacts |
| `kill_switch_active` | Immediate stop |

## Configured sources (v1)

| Key | Adapter | Lifecycle | Kill switch | Notes |
|---|---|---|---|---|
| `organization_website_fixture` | `fixture` | **enabled** | off | CI/pilot; reviews use `not_required_for_fixture` (not human legal/privacy/security approval) |
| `archived_web_fixture` | `archived_web` | **draft** | off | Reviews pending — **RB-015** |
| `organization_website_live` | `organization_website` | **draft** | **on** | Must not execute until approvals + switch off |

## Administration capabilities

| Capability | Roles |
|---|---|
| `approved_source:administer` | `admin` |
| `approved_source:enable_suspend` | `admin`, `ops` |
| `kill_switch:operate` | `admin`, `ops` |
| `source_policy:view` | `admin`, `ops`, `reviewer`, `viewer` |

## Enabling a new source (checklist)

1. Add config entry + DB row with `lifecycle: draft`
2. Complete terms, privacy, legal, security reviews (human owners)
3. Record evidence in `approval_evidence`
4. Transition `approved` → `enabled` only after reviews approved
5. For live adapters: confirm kill switch off intentionally; announce to ops
6. Update [Source Adapter Development Guide](SOURCE_ADAPTER_DEVELOPMENT_GUIDE.md) if new adapter code ships

## Suspension

Ops may suspend or activate kill switch without deleting history. Suspended/retired sources remain for audit; snapshots and claims stay immutable.
