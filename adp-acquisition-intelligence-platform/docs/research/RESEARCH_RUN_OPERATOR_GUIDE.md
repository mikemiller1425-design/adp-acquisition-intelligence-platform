# Research Run Operator Guide (Phase 1.2)

**Audience:** Admins / sales operators running the fixture pilot  
**Live egress default:** **DISABLED**

## Quick start (fixture pilot)

1. Open `/research` → **Start Research Run** (`/research/runs/new`).
2. Keep **Mode = fixture** and **Source = organization_website_fixture**.
3. Set segment, territory, org type, and limits (max orgs / pages / requests).
4. Click **Preview** — confirm estimates, policy version, kill-switch **off**, live research **false**, and **No launch blockers**.
5. Click **Launch research run**.
6. On the detail page, use **Process next target** to advance the deferred execute queue (memory web runtime).
7. Use **Pause** / **Resume** / **Cancel** as needed (authorized roles: admin, sales).
8. When **completed**, open **Extraction review** — collectors never confirm variables.

## Screens

| Path | Purpose |
|---|---|
| `/research` | Hub + **Start Research Run** + research-runs metric |
| `/research/runs/new` | Configuration wizard (single page) |
| `/research/runs` | List runs / statuses / targets summary |
| `/research/runs/[id]` | Lifecycle, counters, events, actions |

## Modes and when to use them

| Mode | Use when |
|---|---|
| `fixture` | Default pilot / CI / demos |
| `dry_run` | Validate gates and estimates without writes |
| `archive_only` / `archive_first_live_fallback` / `live_official_site_only` | Only after RB-015 closes and flags are explicitly enabled |

## Safety reminders

- Launch stays disabled when `data-testid=launch-blockers` lists failures.
- Do not enable `ADP_LIVE_RESEARCH_ENABLED` in shared environments without owner approval.
- RB-014–017 remain **OPEN** — Phase 1.2 orchestration does not close them.
