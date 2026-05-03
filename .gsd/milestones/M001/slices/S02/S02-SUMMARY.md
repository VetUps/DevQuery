---
id: S02
parent: M001
milestone: M001
provides:
  - Create-question API accepts `tags: string[]`, persists normalized associations, creates/reuses Tag rows, updates counters, and returns nested tag data.
  - Concrete backend test coverage for create-with-tags behavior and rollback/counter edge cases.
requires:
  - slice: S01
    provides: Consumed `Tag`, optional `Question.tags`, nested `TagSerializer`, and S01 tag normalization/validation contract.
affects:
  - S03
  - S04
  - S05
  - S06
key_files:
  - src/backend/apps/qa/tests.py
  - src/backend/apps/qa/services/question_tag_service.py
  - src/backend/apps/qa/serializers.py
key_decisions:
  - Centralized create-flow tag persistence and counter side effects in `QuestionTagService` while keeping update/edit tag semantics out of scope.
  - Honored existing S01 normalization/validation and D001/D002 behavior instead of adding a competing tag contract.
patterns_established:
  - Use a focused service for transactional tag association and counter side effects from question creation.
  - Verify backend tag-flow changes with Django API/ORM tests plus migration dry-run rather than generic pytest in this Windows harness.
observability_surfaces:
  - DRF `tags` validation errors for malformed input.
  - Persisted DB state in `Tag.questions_count` and the question/tag many-to-many join relation.
  - Regression tests in `src/backend/apps/qa/tests.py`.
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-03T22:35:28.665Z
blocker_discovered: false
---

# S02: Question creation with tags and counters

**Authenticated question creation now persists normalized tags, creates missing Tag rows, reuses existing tags, returns nested tag data, and updates stored tag question counters.**

## What Happened

S02 turned the S01 tag model and serializer contract into the real authenticated create-question runtime path. T01 first replaced the previous create-flow expectation that tags were discarded with RED API/serializer tests for `POST /question/`: normalized nested tag responses, persisted Tag rows, question/tag M2M associations, counter increments, existing tag reuse, duplicate submitted names counting once, invalid payload rollback, and omitted-tags backward compatibility. T02 then introduced `QuestionTagService` and wired `QuestionUpdateCreateSerializer.create()` so validated tags are popped from serializer data, the Question is created, missing tags are created or existing rows reused, associations are attached, and `Tag.questions_count` increments once per unique associated tag inside a transaction. Update/edit tag semantics remain intentionally out of scope for this slice.

## Verification

Fresh slice-level verification was run through `gsd_exec` because this complete-slice unit's shell policy blocks executing non-read-only commands directly. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` exited 0, ran 27 tests in 13.841s, and reported OK. `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` exited 0 and reported no changes detected in app `qa`. These checks cover the authenticated create path, serializer validation/normalization, invalid rollback, counter updates, duplicate collapse, omitted tags compatibility, and no schema drift. A generic `pytest` command is not the authoritative project verifier here and is unavailable in this Windows harness; the slice plan's Django commands passed.

## Requirements Advanced

- R003 — Backend authenticated API portion now supports creating questions with tags; frontend create flow remains pending.
- R011 — Added backend regression coverage for tag create contracts, rollback behavior, counters, and compatibility.

## Requirements Validated

- R004 — apps.qa tests prove `Tag.questions_count` updates once per unique question/tag association during question creation.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

The external post-attempt verification gate invoked plain `pytest`, which is unavailable in this Windows harness and is not the slice-plan verifier. Fresh authoritative Django verification was run through `gsd_exec` because direct command execution is blocked by the complete-slice planning policy.

## Known Limitations

Frontend question authoring does not yet send tag payloads; autocomplete is not implemented; list/detail display contracts and repeated tag filtering remain downstream. Question update/edit semantics for tags remain intentionally deferred.

## Follow-ups

S03 should build autocomplete on the now-persisted Tag rows and counters. S04 should consume created question/tag associations for list/detail display and repeated tag filtering. S05 should send the established `tags: string[]` create payload from the frontend ask-question flow.

## Files Created/Modified

- `src/backend/apps/qa/tests.py` — Added focused S02 API/serializer regression tests for tagged question creation, counter updates, duplicate collapse, invalid rollback, and omitted-tags compatibility.
- `src/backend/apps/qa/services/question_tag_service.py` — Added service for creating/reusing Tag rows, associating them to questions, and incrementing stored counters.
- `src/backend/apps/qa/serializers.py` — Wired `QuestionUpdateCreateSerializer.create()` to persist validated tags atomically during question creation.
