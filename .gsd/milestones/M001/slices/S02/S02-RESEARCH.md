# S02 — Research

**Date:** 2026-05-03

## BLOCKER

Parallel slice research could not be dispatched because the current `research-slice` unit is running under the GSD tools-policy `planning`, and the harness mechanically blocks `subagent` dispatch in this unit (`HARD BLOCK: unit "research-slice" runs under tools-policy "planning" — subagent dispatch is not permitted in planning units`, manifest.tools #4934).

A required retry was not performed because the hard-block message explicitly instructed not to retry the same call or rationalize past the block. No source-code research was performed for this slice in this unit.

## Summary

Research for S02 remains incomplete. The intended scope is question creation with tags and counters: authenticated create accepts `tags: string[]`, missing tags are safely created, question/tag associations are saved atomically, and `Tag.questions_count` increments for associated tags.

## Recommendation

Re-run this research from a unit where `subagent` and read-only code exploration are permitted, or start an execute/planning workflow that allows the intended research agent dispatch. The next researcher should inspect `src/backend/apps/qa/models.py`, `src/backend/apps/qa/serializers.py`, `src/backend/apps/qa/views.py`, `src/backend/apps/qa/urls.py`, and `src/backend/apps/qa/tests.py`, using S01's established tag model/serializer contract as the dependency boundary.

## Implementation Landscape

### Key Files

- `src/backend/apps/qa/models.py` — Expected to contain `Tag` and `Question.tags` from S01; S02 likely consumes these for M2M association and counter updates.
- `src/backend/apps/qa/serializers.py` — Expected to contain `QuestionUpdateCreateSerializer` with validated normalized `tags`; S02 likely implements create persistence here or delegates to a service.
- `src/backend/apps/qa/views.py` — Expected to contain `QuestionViewSet` create flow and queryset prefetching from S01.
- `src/backend/apps/qa/tests.py` — Expected verification home for create-with-tags, missing tag creation, duplicate collapse persistence, atomicity expectations, and `questions_count` updates.

### Build Order

Blocked before code exploration. The likely first proof should be backend tests for create payload normalization-to-persistence, association, and counter increments, then implementation in serializer/service transaction logic.

### Verification Approach

Use the project-specific Django verifier rather than bare `pytest`: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`. Also run migration drift checks if model changes are introduced.