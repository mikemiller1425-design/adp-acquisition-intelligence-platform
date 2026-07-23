# Bulk Enrichment Architecture

**Version:** 1.0.0  
**Status:** Seams implemented; live archive providers gated  
**Related:** [Public Source Collection Architecture](PUBLIC_SOURCE_COLLECTION_ARCHITECTURE.md), [Approved Source Registry](APPROVED_SOURCE_REGISTRY.md), [Research Priority Policy](RESEARCH_PRIORITY_POLICY.md)

## Intent

**Bulk first, archive before live.** Before any live organization-website retrieval, the platform prefers:

1. Licensed / internal bulk population datasets
2. Archived or structured bulk enrichment adapters (`bulk_archive`, `archived_web`, `licensed_data`, `structured_metadata`)
3. Only then targeted live collection (`organization_website`) under kill-switch and owner approvals

## Architectural seams

Phase 1.1 delivers seams, not unrestricted live archive crawling:

| Seam | Implementation today |
|---|---|
| Job types | `enrichment.bulk.requested`, `enrichment.archive.requested` in `RESEARCH_JOB_TYPES` |
| Adapter types | Enum on `approved_sources.adapter_type` |
| Fixture / CI | `FixtureRetrievalPort` — no network sockets |
| Archived web config | `archived_web_fixture` source — **lifecycle `draft`**, reviews pending |
| Live website | `organization_website_live` — **draft + `kill_switch_active: true`** |

Bulk enrichment does **not** write confirmed variables. It may produce snapshots and extracted claims that enter the same review queue as targeted collection.

## Flow (target state)

```text
priority tier C (or A/B archive preference)
  → select approved archive/bulk source (lifecycle=enabled, reviews approved)
  → enqueue enrichment.bulk / enrichment.archive jobs
  → retrieve via RetrievalPort (fixture in CI; archive adapter when approved)
  → persist source_snapshots
  → extraction_runs → extracted_claims (proposed)
  → human review → evidence + variable propose → score recalc request
```

## Policy gates (`collection_policy.v1.yaml`)

```yaml
rules:
  bulk_before_live: true
  archive_before_live: true
  claims_require_human_review: true
  collectors_cannot_confirm_variables: true
  collectors_cannot_write_scores: true
  no_arbitrary_external_link_crawl: true
```

Pilot limits: 100 orgs/run, 8 pages/org, 1 MiB response, 50 extraction batch size.

## Why archive-before-live

| Concern | Archive / bulk | Live site |
|---|---|---|
| Legal/ToS exposure | Bounded by licensed/archive terms | Per-site ToS + robots |
| Rate / courtesy | Controllable batch windows | Strict per-domain limits |
| Reproducibility | Stable snapshots | Content churn |
| SSRF surface | Narrower allowlists | Broader host resolution risk |

Live collection remains available for tier A/B gaps after archive miss, still subject to [Public Source Security Model](PUBLIC_SOURCE_SECURITY_MODEL.md).

## Provider activation blockers

| Blocker | Topic |
|---|---|
| **RB-014** | Licensing for bulk population datasets |
| **RB-015** | Live public-source / archived-web legal+privacy+security approval |
| **RB-016** | Production object-storage backup/retention for snapshots |
| **RB-017** | Extraction provider / AI extraction approval (deterministic extractor only today) |

## CI posture

Continuous integration **must** use `FixtureRetrievalPort` only. Enabling live or archive network adapters in CI is forbidden.

## Non-objectives

- No LinkedIn scraping
- No auth bypass or CAPTCHA circumvention
- No unrestricted crawl frontiers from bulk HTML
- No auto claim confirmation from bulk enrichment jobs
