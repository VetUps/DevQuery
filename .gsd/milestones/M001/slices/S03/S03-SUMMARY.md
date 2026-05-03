---
id: S03
parent: M001
milestone: M001
provides:
  - Public `GET /tag/?search=<partial>` backend autocomplete API for existing normalized tags.
  - Stable response shape for S05 frontend suggestions: `{name, questions_count}`.
  - Regression coverage for auth openness, query normalization, blank/no-result behavior, result limit, ordering, and schema documentation.
requires:
  - slice: S01
    provides: Tag model, Question.tags relationship, and TagSerializer public shape.
  - slice: S02
    provides: Persisted tag associations and questions_count updates consumed by autocomplete ordering/count display.
affects:
  - S05
  - S06
key_files:
  - src/backend/apps/qa/views.py
  - src/backend/apps/qa/urls.py
  - src/backend/apps/qa/tests.py
key_decisions:
  - Expose `/tag/` as a public list-only endpoint returning a plain unpaginated list hard-limited to 10 suggestions.
  - Blank or missing tag autocomplete searches return an empty list rather than the full tag table.
  - Treat omitted OpenAPI `required` on the optional `search` parameter as equivalent to false in schema regression tests.
patterns_established:
  - Autocomplete endpoints should use bounded deterministic list responses for client suggestions.
  - Public tag discovery responses should reuse `TagSerializer` and expose only `name` plus `questions_count`.
  - Schema tests for optional drf-spectacular query params should accept omitted `required` as false.
observability_surfaces:
  - Diagnostic commands: focused TagAutocompleteApiTests, full apps.qa Django test suite, and makemigrations dry-run.
  - Runtime inspection surface: public `GET /tag/?search=<partial>` HTTP status and response body.
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-03T22:45:37.134Z
blocker_discovered: false
---

# S03: Tag autocomplete API

**Public bounded `/tag/?search=` autocomplete now returns normalized tag suggestions with question counts for downstream clients.**

## What Happened

S03 added a list-only public `TagViewSet` registered in the QA router at `/tag/`, backed by the existing `Tag` model and `TagSerializer` from S01 and the `questions_count` data maintained by S02. The endpoint trims and lowercases the `search` query, avoids creating tags, returns an empty list for missing/blank/no-match input, filters existing normalized names case-insensitively, orders suggestions by highest `questions_count` then `name`, and caps responses to 10 autocomplete results. The response contract is intentionally narrow: each item exposes only `name` and `questions_count`, with no IDs, question data, or user data. T02 hardened the contract with regression coverage for boundary inputs, result limits, and OpenAPI schema metadata for the optional `search` parameter and Tag response shape. No frontend consumption was added in this slice; S05 should call this endpoint from the tag input while preserving manual entry fallback.

## Verification

Fresh slice-level verification was run after the auto-gate reported bare `pytest` was unavailable in this Windows worktree. Authoritative project checks passed using the Django test runner required by the slice plan: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests` exited 0 with 8 tests passing; `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` exited 0 with 35 tests passing; `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` exited 0 with no changes detected. The failing `pytest` command did not execute application tests because `pytest` is not installed/on PATH and is not the verifier named in the slice plan.

## Requirements Advanced

- R005 — Implemented and tested the backend tag autocomplete/search endpoint.
- R008 — Provides the backend suggestion API needed by the future interactive frontend tag input.
- R012 — Defines safe empty/no-result autocomplete behavior that allows frontend manual-entry fallback instead of blocking.

## Requirements Validated

- R005 — TagAutocompleteApiTests and full apps.qa regression prove the endpoint returns matching normalized tags with question counts and safe boundaries.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

- None — no requirements were invalidated or re-scoped.

## Operational Readiness

None.

## Deviations

No functional deviations from the slice plan. The only verification deviation is environmental: the external auto-gate attempted bare `pytest`, but this worktree does not have `pytest` installed/on PATH and the slice plan explicitly names Django `manage.py test` commands.

## Known Limitations

No frontend consumption exists yet. S04 still needs to add tag display/filtering on question list/detail responses, S05 still needs to wire the autocomplete into the ask-question form with manual fallback, and S06 still needs integrated backend/frontend regression proof.

## Follow-ups

S05 should consume `/tag/?search=<partial>` from the frontend tag input and handle `[]` or request failures without blocking manual tag entry. S04 should separately add repeated `tag` filtering and tag chips in question responses.

## Files Created/Modified

- `src/backend/apps/qa/views.py` — Added public list-only TagViewSet behavior for bounded autocomplete search.
- `src/backend/apps/qa/urls.py` — Registered the tag endpoint in the QA API router at `/tag/`.
- `src/backend/apps/qa/tests.py` — Added TagAutocompleteApiTests covering happy path, boundaries, ordering, limits, response shape, and schema metadata.
