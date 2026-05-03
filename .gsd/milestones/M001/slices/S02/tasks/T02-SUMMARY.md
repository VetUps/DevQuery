---
id: T02
parent: S02
milestone: M001
key_files:
  - src/backend/apps/qa/services/question_tag_service.py
  - src/backend/apps/qa/serializers.py
key_decisions:
  - Centralized question tag persistence/counter side effects in a focused service while keeping `QuestionUpdateCreateSerializer.update()` tag-agnostic for deferred edit semantics.
duration: 
verification_result: passed
completed_at: 2026-05-03T22:33:22.914Z
blocker_discovered: false
---

# T02: Persisted normalized question tags during authenticated question creation with atomic associations and counter updates

**Persisted normalized question tags during authenticated question creation with atomic associations and counter updates**

## What Happened

Added `QuestionTagService` to centralize create-flow tag side effects: it deduplicates normalized tag names defensively, creates or reuses `Tag` rows, attaches them to the saved `Question`, and increments `questions_count` with a race-safe `F()` expression. Updated `QuestionUpdateCreateSerializer.create()` to pop validated `tags`, create the question, persist tag associations and counters inside one `transaction.atomic()` block, and return the saved question for the existing nested create-response serializer. Update behavior remains out of scope and still ignores submitted tags. No migration was introduced.

## Verification

Ran the slice-required Django test suite and migration dry-run with the project virtualenv Python. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` ran 27 tests successfully, covering normalized tag persistence, existing/new tag reuse, duplicate submitted names, invalid-payload rollback, omitted tags, and existing Q&A behavior. `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` reported no model changes. LSP diagnostics were attempted for edited Python files but no Python language server is configured in this harness.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 21323ms |
| 2 | `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` | 0 | ✅ pass | 777ms |

## Deviations

The verification failure referenced `pytest`, which is not the task's planned verification command and is unavailable in this Windows harness. I verified with the authoritative task commands using `gsd_exec` Python subprocesses because `/bin/bash` is unavailable.

## Known Issues

None.

## Files Created/Modified

- `src/backend/apps/qa/services/question_tag_service.py`
- `src/backend/apps/qa/serializers.py`
