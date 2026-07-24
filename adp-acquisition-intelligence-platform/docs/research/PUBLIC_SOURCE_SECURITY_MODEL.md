# Public Source Security Model

**Version:** 1.0.0  
**Status:** Implemented in `@adp/research` domain + collection service  
**Code:** `network-security.ts`, `robots.ts`, `rate-limit.ts`, `retry.ts`, `approved-source.ts`, `extraction.ts`  
**Related:** [Approved Source Registry](APPROVED_SOURCE_REGISTRY.md), [Public Source Collection Architecture](PUBLIC_SOURCE_COLLECTION_ARCHITECTURE.md), Phase 1 release blockers **RB-001**, **RB-015**

## Threat model (Phase 1.1 scope)

| Threat | Control |
|---|---|
| SSRF to cloud metadata / internal networks | URL validation + resolved-address checks |
| Credential-bearing URLs | Blocked |
| Redirect escape to other registrable domains | `same_registrable_domain` (default) |
| Oversized responses | `maxBytes` / `response_size_limit_bytes` |
| Hostile HTML / prompt injection into AI tools | Sanitize; injection marker detection; claims stay proposals |
| Ignoring robots.txt | Default `respect` behavior |
| Courtesy abuse | Per-source rate limits + concurrency + page limits |
| Unapproved live crawl | Lifecycle + review gates + kill switch |
| Collector privilege escalation into scores/variables | Ports: collectors propose only; review service proposes variables; never confirm |

## SSRF and network defenses

`validateRetrievalUrl`:

- Allow `http:` / `https:` only
- Reject credential-bearing URLs
- Block `localhost`, `*.localhost`, `metadata`, `metadata.google.internal`, `169.254.169.254`, `*.internal`
- Block literal private/reserved IPs (RFC1918, loopback, link-local, CGNAT, multicast, IPv6 ULA/link-local)

`validateResolvedDestination` rejects DNS answers that resolve to private/reserved addresses (DNS rebinding class).

`validateRedirectTarget` enforces redirect policy (`same_host`, `same_registrable_domain`, or https upgrade variants as configured).

`safeStorageObjectKey` prevents path traversal in object keys.

`FixtureRetrievalPort` still runs URL validation and never opens sockets—CI cannot “accidentally” hit the network through this port.

## Robots

`evaluateRobotsPolicy`:

- `respect` — parse Disallow for `*` / UA; missing robots → default allow (documented)
- `block_all` — deny everything
- `allow_public_paths` — only `/`, `/about`, `/services`, `/locations`, `/team`, `/leadership`, `/careers`, `/news`, `/blog`, `/contact`

Collection uses `respect` with configured path attempts.

## Rate limits and retries

`evaluateRateLimit` — fixed window per minute; excess returns `retryAfterMs`.

`shouldRetry` — exponential backoff helper; **terminal** (no retry): `lifecycle_not_enabled`, `kill_switch`, `private_network`, `ssrf`, `robots_disallow`, `unsupported_mime`, `credential_bearing_url`.

Pilot defaults: 10 req/domain/min (policy), source-specific overrides in registry (fixture 30, archive draft 60, live draft 10).

## Content handling

- MIME must be HTML/XHTML
- Scripts/styles/forms stripped before text extraction; JS never executed
- `detectPromptInjectionMarkers` flags instruction-override patterns; markers recorded on retrieval events
- Extracted claims remain `proposed` (`claimRequiresHumanReview` always true; auto-accept disabled in mapping config)

## Authorization surface

Research capabilities are allowlisted by role (`authz.ts`). Kill switch and source enable/suspend are ops/admin only. Claim accept/correct/reject are reviewer/admin.

## Secrets and credentials

No adapter may store end-user passwords or session cookies for third-party sites. Credential-bearing URLs are blocked. Auth bypass and CAPTCHA circumvention are explicit non-objectives.

## Residual risks / open approvals

| Item | Status |
|---|---|
| Independent security review (RB-001) | OPEN |
| Live/archive legal+privacy+security (RB-015) | OPEN |
| Production object storage for snapshots (RB-016) | OPEN |
| AI extraction provider (RB-017) | OPEN — deterministic extractor only |

Engineering assessment for controlled fixture pilot: **no blocking engineering defects** in the security control set above; owner approvals remain required before live egress.
