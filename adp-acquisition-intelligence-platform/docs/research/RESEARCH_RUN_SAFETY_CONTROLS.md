# Research Run Safety Controls (Phase 1.2)

**Status:** Implemented for launch-time and pre-network gates  
**Live egress default:** `ADP_LIVE_RESEARCH_ENABLED=false`

## Control layers

1. **RBAC / capabilities** — `research_run:create|launch|pause|cancel|view`, `kill_switch:operate`
2. **Launch gates** — segment required, limits required, source selected, source executable, global kill switch, live flag for live/archive modes
3. **Dual gate before network** — `assertNetworkRetrievalPermitted` on archive/live adapters
4. **Budget circuit breaker** — `maxTotalRequests` stops further retrieval
5. **Checkpoints** — per-target idempotent resume
6. **Human review** — proposed claims only; no auto-accept

## Fixture exemption (narrow)

Fixture adapters may use `not_required_for_fixture` review statuses. This must **not** be treated as human legal/privacy/security approval for live or archived-web sources.

## Kill switches

| Switch | Effect |
|---|---|
| Global (`ADP_RESEARCH_GLOBAL_KILL_SWITCH`) | Blocks launch (and network paths) |
| Per-source `killSwitchActive` | Blocks that source |
| Per-run `killSwitchActive` | Blocks remaining targets |

## Release blockers (unchanged)

| ID | Relevance | Status |
|---|---|---|
| RB-014 | Licensed structured sources | **OPEN** |
| RB-015 | Live / archived-web approvals | **OPEN** |
| RB-016 | Snapshot object-storage backup | **OPEN** |
| RB-017 | AI / extraction provider | **OPEN** |

Phase 1.2 must not mark these CLOSED.
