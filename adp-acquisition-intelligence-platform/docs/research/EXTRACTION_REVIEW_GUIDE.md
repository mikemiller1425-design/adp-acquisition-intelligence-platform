# Extraction Review Guide

**Version:** 1.0.0  
**Status:** Implemented  
**Services:** deterministic extractor + `ExtractionReviewService`  
**Config:** `config/research/extractor_variable_mapping.v1.yaml`  
**Related:** [Public Source Collection Architecture](PUBLIC_SOURCE_COLLECTION_ARCHITECTURE.md), [Evidence and Provenance Guide](../development/EVIDENCE_AND_PROVENANCE_GUIDE.md)

## Principle

**Every extracted claim is a proposal.** Collectors never confirm variables and never write scores. Human review (or an explicitly approved future auto-accept policy — currently **disabled**) is mandatory.

## Extractor (current)

- Version: `structured-extractor-v1`
- Mapping version: `claim-variable-mapping-v1`
- Behavior: sanitize HTML → text; parse JSON-LD Organization names; apply deterministic service keyword patterns (payroll, bookkeeping, CAS, fractional CFO, HR/benefits advisory)
- Output: `ExtractedClaimProposal` with excerpt, proposed value, confidence components, explanation, affected completeness purposes / score hints

AI / LLM extraction is a **seam only** until **RB-017** closes. Do not wire production LLM confirmation paths.

## Review statuses

| Status | Meaning |
|---|---|
| `proposed` | Awaiting review |
| `accepted` | Accepted as proposed |
| `accepted_corrected` | Accepted with corrected value |
| `rejected` | Not used |
| `duplicate` | Duplicate of another claim/value |
| `contradictory` | Conflicts with existing intelligence |
| `deferred` | Parked |
| `needs_research` | More research required |
| `source_problem` | Source quality / policy issue |

Reviewable current states for transitions: `proposed`, `deferred`, `needs_research`.

## Review actions

| Action | Next status | Capability |
|---|---|---|
| `accept` | `accepted` | `claim:accept` |
| `accept_with_correction` | `accepted_corrected` | `claim:correct` (corrected value required) |
| `reject` | `rejected` | `claim:reject` |
| `mark_duplicate` | `duplicate` | `claim:view` |
| `mark_contradictory` | `contradictory` | `claim:view` |
| `request_additional_research` | `needs_research` | `claim:view` |
| `defer` | `deferred` | `claim:view` |
| `report_source_problem` | `source_problem` | `claim:view` |

Roles: `admin` and `reviewer` hold accept/correct/reject; others are view-oriented.

## Accept path (integration ports)

On accept / accept-with-correction:

1. `EvidenceIntegrationPort.createEvidenceFromAcceptedClaim`
2. `VariableIntegrationPort.proposeFromAcceptedClaim` (**propose**, not confirm)
3. `ScoreRecalcPort.requestRecalculation`
4. Outbox: `research.claim_accepted` or `research.claim_corrected`, plus `intelligence.recalculation_requested`

`VariableIntegrationPort` documents that collectors must never call confirm.

## Operator checklist

1. Open claim with snapshot URL / excerpt
2. Verify source domain is approved and excerpt supports the variable
3. Compare to existing variable value (`existing_value_comparison` when populated)
4. Accept, correct, reject, or mark contradictory/duplicate
5. If source is systematically bad → `report_source_problem` and consider source suspend / kill switch
6. Watch review backlog warn threshold (500) in collection policy

## Mapping policy

```yaml
review_policy:
  initial: require_human_review_for_all
  auto_accept_enabled: false
```

Changing auto-accept requires owner approval, mapping version bump, and security/privacy review — not an in-chat toggle.

## Prompt injection awareness

If retrieval logged injection markers, treat excerpts as hostile: do not paste into privileged tools as instructions; judge only the factual business claim.
