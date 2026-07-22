# Normalization Policy

**Status:** Prompt 4 implemented

## Goals

Normalization creates deterministic comparison and proposal values without erasing the imported source value. Every mapped field preserves:

- `mapped[field]` — trimmed original value or `null` for blank.
- `normalized[field]` — normalized typed value or `null`.
- `normalized[field.__original]` — original raw value.
- `normalized[field.__blank]` — `true` only when the CSV cell was blank.

Blank is not the same as `unknown`. A blank consent cell remains `null` with `.__blank = true`; a literal `unknown` consent cell normalizes to `unknown`.

## Covered normalizers

- Organization names remove common legal suffixes for matching.
- Domains and URLs lower-case hostnames and strip `www.` for domains.
- Email values lower-case and must satisfy basic address syntax.
- Phone values normalize to E.164-style strings when possible.
- Address values normalize common street/suite words and punctuation.
- State/country values map known names to codes.
- Booleans, dates, numbers, percentages, currency, and ranges produce typed values.
- Enums are matched case-insensitively after space/hyphen normalization.

## Field registry

The embedded registry is versioned as `collection-field-registry-v1` and contains 52 fields across:

- Organization identity and acquisition metadata.
- Location address and geo fields.
- Contact identity/channel fields.
- Consent state/source/date fields.
- Variable proposal fields.

Aliases must be unique after header normalization. Duplicate aliases are rejected at registry load time.

## Invalid values

If a non-blank source cell cannot normalize to the target field kind, validation records `Invalid <field label>`. Required fields also produce missing/blank errors before commit.

