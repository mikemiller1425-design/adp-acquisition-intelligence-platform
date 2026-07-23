# Public Source Collection Architecture

**Version:** 1.0.0  
**Status:** Implemented for fixture-backed targeted collection; live adapter draft+kill-switch  
**Service:** `TargetedCollectionService`  
**Ports:** `RetrievalPort`, `FixtureRetrievalPort`  
**Related:** [Approved Source Registry](APPROVED_SOURCE_REGISTRY.md), [Public Source Security Model](PUBLIC_SOURCE_SECURITY_MODEL.md), [Extraction Review Guide](EXTRACTION_REVIEW_GUIDE.md), [Source Adapter Development Guide](SOURCE_ADAPTER_DEVELOPMENT_GUIDE.md)

## Scope

Targeted collection retrieves a **bounded** set of public pages for priority organizations, persists snapshots, and proposes extracted claims. It is not a general-purpose crawler.

## Components

```text
ResearchPriorityAssessment (advisory)
        │
        ▼
collection_runs ──► collection_run_targets ──► collection_jobs
        │
        ▼
ApprovedSourceGate (lifecycle, reviews, kill switch)
        │
        ▼
URL validation → robots → rate limit → RetrievalPort
        │
        ▼
source_snapshots → extraction_runs → extracted_claims (proposed)
        │
        ▼
ExtractionReviewService → evidence + variable propose → score recalc request
```

## Retrieval port contract

```ts
type RetrievalPort = {
  retrieve(url: string, options: { timeoutMs: number; maxBytes: number }): Promise<RetrievalResponse>;
};
```

| Implementation | Use |
|---|---|
| `FixtureRetrievalPort` | **CI and controlled pilot default** — never opens sockets |
| Live org-website adapter | Draft config `organization_website_live`, kill switch **on** until **RB-015** |

## Per-target page budget

For enabled sources, the service attempts a small path allowlist (capped by `page_limit`):

- `/`
- `/about`
- `/services`

No link-following off-page; no arbitrary external crawl (`no_arbitrary_external_link_crawl`).

## Run lifecycle

`collection_run_status`: `draft` → `queued` → `running` → `completed` | `failed` | `cancelled` (via cancel or kill switch) | blocked when gate fails.

Target/job statuses include `queued`, `running`, `succeeded`, `failed`, `cancelled`, `blocked`, `skipped`.

## Gate order (fail closed)

1. Capability `collection_run:create`
2. `canExecuteApprovedSource` — kill switch, lifecycle=`enabled`, terms/privacy/legal/security all `approved`
3. Domain allowlist (`domains` includes host or `*`)
4. `validateRetrievalUrl` (SSRF defenses)
5. Robots policy (`respect` by default)
6. Rate limit window
7. Retrieve → redirect policy (`same_registrable_domain`)
8. MIME allowlist (`text/html` / `xhtml`)
9. Content-hash unchanged skip
10. Extract claims as proposals only

## Snapshot and reuse

`source_snapshots` record requested/final URL, domain, HTTP metadata, content hash, redirect chain, adapter/parser/policy versions, optional `storage_key`, retention expiry, and `unchanged_from_snapshot_id` linkage.

Unchanged content increments skip counters and avoids re-extraction noise.

## Coverage rollup

`collection_coverage` (one row per organization) tracks eligible/attempted/completed/blocked sources, pages retrieved, archive reuse, claims extracted/accepted/awaiting review, variables improved, and next eligible refresh.

## Events

Key outbox types: `research.collection_run_started`, `research.retrieval_completed` / `blocked` / `failed`, `research.claim_proposed`, `research.collection_run_completed` / `cancelled`, `research.kill_switch_activated`.

## Cancel and kill switch

- Soft cancel via `cancel()` mid-run
- `activateKillSwitch` requires `kill_switch:operate` (`admin`, `ops`)
- Kill switch observed on the run; subsequent retrievals stop

## Non-objectives (honored)

- No LinkedIn scraping
- No auth bypass
- No CAPTCHA circumvention
- No unrestricted crawl
- No auto claim confirmation
- Collectors never confirm variables or write scores

## Pilot posture recommendation

Use **fixture** adapter (`organization_website_fixture`, lifecycle `enabled`) for CI and engineering pilot. Keep live and archived-web sources draft until owner approvals close **RB-015**–**RB-017** as applicable.
