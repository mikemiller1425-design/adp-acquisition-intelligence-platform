# Product Vision

**Version:** 1.0.0  
**Status:** Canonical for Phase 1

## Mission

The ADP Acquisition Intelligence Platform turns fragmented prospect information into traceable commercial intelligence. It helps teams decide which organizations deserve attention, which commercial motion best fits each organization, what is still unknown, what to ask in discovery, what outreach to prepare, and whether outcomes validate the model.

It is an intelligence workspace, not a replacement CRM, bulk-email sender, autonomous web scraper, or machine-learning product.

## Users and jobs

- **Administrator:** configure users, territories, controlled vocabularies, feature flags, and score versions.
- **Researcher:** collect and normalize facts, attach evidence, resolve duplicates, and close high-impact information gaps.
- **Sales user:** review prioritized prospects, conduct discovery, prepare outreach, record activity, and manage opportunities.
- **Reviewer:** approve qualification decisions, score overrides, merges, and exceptions.

## Phase 1 outcomes

Phase 1 MUST let an authorized user:

1. Create prospects manually or import them from CSV.
2. Normalize and deduplicate organizations, locations, and contacts.
3. Store facts, estimates, inferences, unknowns, sources, and evidence without conflating them.
4. Measure overall and purpose-specific completeness.
5. Calculate deterministic, versioned, explainable scores for acquisition, wholesale, CAS maturity, direct payroll, influence, urgency, revenue potential, accessibility, and confidence.
6. Review, qualify, nurture, disqualify, or route prospects.
7. Prepare and record discovery; map confirmed answers into variables and re-score.
8. Prepare outreach drafts, track manual activity and response outcomes, and schedule next actions.
9. Track opportunities and stage movement.
10. Visualize and export the operational tables and model-performance measures.

## Commercial motions

- **Acquisition:** interest in acquiring or internalizing a payroll book or operation.
- **Wholesale:** enable a firm to offer payroll under an operating partnership.
- **CAS-led:** enter through recurring client advisory and operational influence.
- **Direct payroll:** pursue a direct payroll opportunity for an end employer.

An organization may be eligible for multiple motions. The platform MUST preserve all motion scores while recommending one primary and, when justified, one secondary motion.

## Product principles

- Evidence before assertion.
- Unknown is not zero.
- Confidence and fit are separate.
- Explanations accompany scores.
- Humans approve consequential decisions and outbound content.
- Historical calculations remain reproducible.
- One organization record may hold several commercial roles.
- Data collection is proportional, lawful, permissioned, and auditable.
- Outcomes feed model evaluation without automatically changing weights.

## Success measures

Operational success includes import success rate, duplicate-review rate, research turnaround, completeness gain, discovery completion, next-action timeliness, contact/response/meeting rates, opportunity creation, conversion by score tier, and time in stage. Quality guardrails include score reproducibility, evidence coverage, override rate, stale-data rate, false duplicate rate, and unauthorized-data incidents.

## Non-goals for Phase 1

- Autonomous mass sending or social automation.
- Production CRM replacement or bidirectional CRM synchronization.
- Continuous public-web monitoring.
- Predictive conversion models or self-adjusting weights.
- Proposal, contract, billing, renewal, or client-expansion systems.
- Referral agreements, introduction networks, partner influence graphs, partner health, referral economics, or partner portals.

## Phase boundary

Phase 1 ends when a target can be collected, researched, scored, reviewed, discovered, contacted, tracked, and visualized end to end. Phase 2 starts when an advisor or partner is modeled as a durable source of introductions to multiple end-client opportunities. Phase 1 MAY reserve organization-role extension points but MUST NOT implement referral workflows.

See [Functional Specification](../02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md) and [Exit Contract](../13-exit-contract/PHASE_1_EXIT_CONTRACT.md).

