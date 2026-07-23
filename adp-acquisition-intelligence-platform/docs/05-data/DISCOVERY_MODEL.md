# Discovery Model (Prompt 7)

## Purpose

Discovery converts qualification context into confirmed variable values through human-reviewed agendas, verbatim answers, mappings, and score deltas.

## Blueprint naming map

| Blueprint / catalog name | Implemented table |
|---|---|
| `discovery_templates` (+ versions) | `discovery_templates` (`key` + `version`) |
| `discovery_questions` (+ tags) | `discovery_questions` (`tags` jsonb) |
| `discovery_session_participants` | `discovery_participants` |
| `discovery_session_questions` | `discovery_agenda_items` + answers |
| `discovery_answer_mappings` | `discovery_mappings` (+ `discovery_interpretations`) |
| *(Prompt 7 additions)* | `discovery_agendas`, `discovery_score_snapshots`, `discovery_follow_ups`, `discovery_template_questions` |

## Lifecycle separation

- Prospect stage (`qualified` → `discovery_scheduled` → `discovery_completed`) via `OperationalStateService`
- Discovery session status (`draft`…`completed`) on `discovery_sessions`
- Mapping status (`proposed` / `confirmed` / `rejected`)
- Qualification conditions remain independent blockers

## Confirmation rules

1. Store `original_answer` immutably when status is `answered`.
2. Propose interpretation and mapping without mutating variable values.
3. Confirm mapping through Variable/Evidence ports only.
4. Capture before/after score snapshots on confirmation.
5. Session completion requires required answers answered and no open proposed mappings.

## Configuration

Phase 1 library: `config/discovery/phase1-library.v1.yaml` seeded by `packages/database/seeds/discovery.ts`.
