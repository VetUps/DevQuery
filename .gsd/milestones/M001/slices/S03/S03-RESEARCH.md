# S03 — Research

**Date:** 2026-05-03

## BLOCKER

Parallel slice research could not be dispatched because the current `research-slice` unit is running under the GSD tools-policy `planning`, and the harness mechanically blocks `subagent` dispatch in this unit (`HARD BLOCK: unit "research-slice" runs under tools-policy "planning" — subagent dispatch is not permitted in planning units`, manifest.tools #4934).

A required retry was not performed because the hard-block message explicitly instructed not to retry the same call or rationalize past the block. No source-code research was performed for this slice in this unit.

## Summary

Research for S03 remains incomplete. The intended scope is a tag autocomplete/search API: clients can search existing normalized tags by partial input and receive `{name, questions_count}` results; empty/no-result behavior should be predictable and non-error.

## Recommendation

Re-run this research from a unit where `subagent` and read-only code exploration are permitted, or start an execute/planning workflow that allows the intended research agent dispatch. The next researcher should inspect backend router/viewset conventions and reuse S01's `Tag` model plus `TagSerializer` response shape.

## Implementation Landscape

### Key Files

- `src/backend/apps/qa/models.py` — Expected to contain the `Tag` model with normalized unique `name` and stored `questions_count`.
- `src/backend/apps/qa/serializers.py` — Expected to contain `TagSerializer` shaped `{name, questions_count}` from S01; likely reusable for autocomplete responses.
- `src/backend/apps/qa/views.py` — Likely home for a new `TagViewSet` or list-only/search action following existing DRF viewset patterns.
- `src/backend/apps/qa/urls.py` — Likely route registration point for the new tag endpoint.
- `src/backend/apps/qa/tests.py` — Expected verification home for partial/case-insensitive search, result ordering/limits if chosen, empty query/no-result behavior, and response shape.

### Build Order

Blocked before code exploration. The likely first proof should be API tests for endpoint route, partial case-insensitive matching, normalized response shape, and empty/no-result behavior; then implement a list-only DRF endpoint using existing serializers and router conventions.

### Verification Approach

Use the project-specific Django verifier rather than bare `pytest`: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`. Also run URL/schema-focused tests if the endpoint is documented with drf-spectacular.