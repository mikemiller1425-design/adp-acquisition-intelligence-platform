# Dashboard Specification

**Version:** 1.0.0

## Metric rules

Every metric defines subject, numerator, denominator, time basis, excluded states, timezone, refresh schedule, and drill-down query. Counts use canonical organizations unless labeled otherwise. Rates show numerator/denominator and suppress misleading percentages for tiny cohorts. Cached data displays `as of` time.

## D1 — Executive Overview

Purpose: operational health and funnel snapshot. Widgets: total/new organizations, normalization/research/scored/qualified counts, discovery scheduled/completed, outreach active, opportunities, nurture/disqualified, average purpose completeness, average score confidence, overdue next actions, stage aging. Filters: date range, owner, territory, firm type, motion. All widgets drill to a filtered table.

## D2 — Prospect Master

Columns: organization, firm type, location, owner, territory, prospect stage, primary motion, acquisition/wholesale/CAS/direct scores, influence, urgency, revenue band, overall and motion completeness, confidence, last activity, next action/due date, flags. Filters additionally include industry, score range/tier, trigger, provider, freshness, existing relationship, and tag.

## D3 — Collection and Research

One row per organization by default with expandable variable view. Columns: overall/purpose completeness, unknown high-impact count, contradicted/stale count, latest source/verification, research priority, assignee, task status. Variable-level view shows definition, value/status, evidence type, confidence, source, observed/expiry date, reviewer state, and impact. Actions: assign research, add evidence, resolve conflict, export gaps.

## D4 — Scoring

Columns: all score outputs, status/tier, definition version, calculation time, per-score completeness/confidence, top factors, missing high-impact inputs, primary/secondary recommendation, next action. Drilldown exposes input snapshot and factor contributions. Filters include definition version and provisional/insufficient status.

## D5 — Discovery

Columns: prospect, contact(s), owner, session status/date, motion, prepared/answered counts, high-impact gaps, pre/post score, movement, unresolved mappings, next step. Widgets: scheduled this week, overdue follow-up, completion rate, average completeness gain, recommendation changes.

## D6 — Outreach

Columns: prospect, contact, motion, campaign/sequence/version, current step, channel, message angle, last activity, response class, next follow-up, owner, outcome, restriction flag. Metrics: eligible recipients, attempted, contacted, responded, positive, meeting booked, opt-out, overdue follow-up. Phase 1 actions record activity; they do not send autonomously.

## D7 — Opportunities and Stage

Columns: organization, opportunity, motion, stage, value band, probability policy, owner, next action, last movement, days in stage, risk, outcome/loss reason. Metrics: open pipeline by stage/motion, opportunity creation, stage aging, won/lost when data exists.

## D8 — Model Performance

Measures: population by score tier; contact, response, meeting-booking, discovery-completion, qualification, opportunity-creation, and win rates; conversion by motion, score tier/version, firm type, confidence/completeness band, and message angle; median days between stages; override and disqualification rates. This dashboard informs later calibration but does not auto-update weights.

## Shared behavior

Filters are permission-scoped, composable, reflected in URL, and saveable. Exports reproduce active filters, selected columns, generated time, requesting user, and data classification notice. Large exports are asynchronous and expire. Empty states explain how data enters the view. Errors never show fabricated zeros. Suppressed/restricted cells display a reason, not blank ambiguity.

## Acceptance tests

For each dashboard: verify metric against a known SQL/service fixture; filter combinations; role/territory scoping; saved-view restore; stable pagination/sort; drill-down parity; CSV headers/types; timezone boundaries; empty/stale/error states; and performance at target volume.

