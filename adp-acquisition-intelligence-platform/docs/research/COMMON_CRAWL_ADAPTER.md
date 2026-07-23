# Common Crawl Adapter (Phase 1.2)

**Status:** **Draft adapter implemented**; **not enabled** for controlled external or production use  
**Module:** `packages/research/src/infrastructure/adapters/archive-and-live.ts` (`CommonCrawlArchiveAdapter`)  
**Blocker:** RB-015 remains **OPEN**

## Maturity

| Aspect | State |
|---|---|
| Production-shaped API (index select → WARC retrieve seam) | **Implemented** (recorded/fixture bodies in tests) |
| Dual gate (`ADP_LIVE_RESEARCH_ENABLED` + source enabled + kill switches) | **Implemented** |
| Fixture / recorded archive hits | **Fixture-tested** |
| Live Common Crawl HTTP egress | **Disabled by default** — **not production-ready** |
| Legal / privacy / security owner approval | **OPEN** (RB-015) |

## Behavior

- Prefer archive before live when mode is `archive_only` or `archive_first_live_fallback`.
- Fail closed when source lifecycle ≠ `enabled`, kill switch active, or live research flag false.
- Persist provenance fields (crawl id, WARC location, content hash) when a recorded hit is used.
- Does **not** self-approve licensing or robots exemptions.

## Operator note

Do not enable archived-web sources in the approved registry without RB-015 evidence. Fixture pilot should keep mode=`fixture` and source=`organization_website_fixture`.
