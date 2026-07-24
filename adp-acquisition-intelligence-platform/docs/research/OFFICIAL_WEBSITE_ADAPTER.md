# Official Website Adapter (Phase 1.2)

**Status:** **Draft adapter implemented**; live egress **DISABLED** by default  
**Module:** `packages/research/src/infrastructure/adapters/archive-and-live.ts` (`OfficialWebsiteAdapter`)  
**Blocker:** RB-015 remains **OPEN**

## Maturity

| Aspect | State |
|---|---|
| URL validation / SSRF / robots / redirect policy hooks | **Implemented** (shared security helpers) |
| DNS/IP validation before transport (anti-rebinding) | **Implemented** (`validateResolvedDestination` on each hop) |
| Dual gate before any network call | **Implemented** |
| Request probe for unauthorized-zero-request tests | **Implemented** |
| Live HTTP retrieval in default deployments | **Disabled** (`ADP_LIVE_RESEARCH_ENABLED=false`) |
| Controlled external pilot | **Not ready** |
| Production-ready | **Not ready** |

## Behavior

- Used only for modes that require live official-site retrieval or live fallback.
- Checks global kill switch, run kill switch, source kill switch, approved-source gate, and deployment flag **again** immediately before network access.
- Terminology: “official website retrieval” / “live fallback” — never labeled as scrape/scraper in UI.

## Operator note

Live fallback toggles in the Start Research Run form will fail launch gates while RB-015 is open and `ADP_LIVE_RESEARCH_ENABLED` is false. That is intentional.
