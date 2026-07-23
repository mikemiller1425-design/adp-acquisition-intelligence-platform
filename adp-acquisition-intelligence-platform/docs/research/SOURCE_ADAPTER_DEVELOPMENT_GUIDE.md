# Source Adapter Development Guide

**Version:** 1.0.0  
**Status:** Implemented seams  
**Related:** [Approved Source Registry](APPROVED_SOURCE_REGISTRY.md), [Public Source Security Model](PUBLIC_SOURCE_SECURITY_MODEL.md), [Public Source Collection Architecture](PUBLIC_SOURCE_COLLECTION_ARCHITECTURE.md)

## Adapter contract

All retrieval adapters implement `RetrievalPort`:

```ts
retrieve(url: string, options: { timeoutMs: number; maxBytes: number }): Promise<{
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  etag: string | null;
  lastModified: string | null;
  redirectChain: string[];
}>;
```

Collection orchestration (**not** the adapter) owns:

- Approved-source gating
- Robots evaluation
- Rate limiting
- SSRF URL validation before retrieve
- Redirect policy checks on `redirectChain`
- Snapshot persistence and extraction

Adapters must not confirm variables, write scores, or mutate claim review status.

## Reference implementation: FixtureRetrievalPort

Location: `packages/research/src/infrastructure/fixture-retrieval.ts`

Requirements already met:

- No network sockets
- Validates URL before map lookup
- Enforces `maxBytes`
- Returns deterministic bodies for CI

**CI rule:** tests and pipelines must inject `FixtureRetrievalPort` (or equivalent in-memory double). Do not call live adapters in CI.

## Adding a new adapter

1. **Choose `adapter_type`** from the enum; prefer `archived_web` / `bulk_archive` / `licensed_data` before `organization_website`.
2. **Implement `RetrievalPort`** in `packages/research/src/infrastructure/`.
3. **Fail closed** on timeouts, oversized bodies, non-HTML (if HTML expected), and private IPs if the adapter resolves DNS itself — still rely on shared validators.
4. **Register** config in `config/research/approved_sources.v1.yaml` with `lifecycle: draft`, kill switch on for live types, pending review statuses.
5. **Wire** DI in API/worker only behind feature flags; default remains fixture.
6. **Tests:** unit tests for adapter error codes; collection service tests with fixtures proving gate failure when lifecycle ≠ enabled.
7. **Docs:** update registry table and this guide’s adapter list.
8. **Approvals:** do not enable until terms/privacy/legal/security approved (**RB-015** for live/archive).

## Live organization website adapter (draft)

Config key `organization_website_live`:

- `adapter_type: organization_website`
- `lifecycle: draft`
- `kill_switch_active: true`
- All review statuses `pending`

Do not implement auth bypass, CAPTCHA solving, LinkedIn access, or open-ended link crawls in this adapter. Stick to allowlisted paths and registry limits.

## Archived web adapter (seam)

Config key `archived_web_fixture` is a seam for archive-class sources. Until licensing/legal review completes, keep lifecycle `draft`. Prefer bulk object pulls over live site hammering ([Bulk Enrichment Architecture](BULK_ENRICHMENT_ARCHITECTURE.md)).

## Error codes adapters should surface

Align with retry policy terminals where applicable: `private_network`, `ssrf`, `unsupported_mime`, oversized responses, timeouts. Orchestration maps robots/lifecycle/kill-switch itself.

## Versioning

Bump `parser_version` / adapter version strings on behavior changes. Snapshots store adapter and parser versions for replay audit.

## Checklist before `lifecycle: enabled`

- [ ] Human owner reviews approved (not agent self-approval)
- [ ] Kill switch intentional state documented
- [ ] Rate/page/size/timeout limits set
- [ ] Domain allowlist non-empty for live sources (avoid `*` outside fixtures)
- [ ] Fixture tests still pass with live adapter **not** selected in CI
- [ ] Runbook updated for ops kill-switch drill
