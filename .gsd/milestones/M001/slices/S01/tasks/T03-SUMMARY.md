---
id: T03
parent: S01
milestone: M001
key_files:
  - src/backend/apps/qa/serializers.py
  - src/backend/apps/qa/views.py
  - src/backend/apps/qa/tests.py
key_decisions:
  - Kept T03 scoped to response shape only: create accepts normalized tags from T02 but still emits an empty tag list until downstream create-flow persistence work wires tags to newly created questions.
duration: 
verification_result: passed
completed_at: 2026-05-03T22:22:50.627Z
blocker_discovered: false
---

# T03: Exposed nested public tag objects on question responses and pinned the contract with Django regression tests.

**Exposed nested public tag objects on question responses and pinned the contract with Django regression tests.**

## What Happened

Added a read-only `TagSerializer` that exposes only `name` and `questions_count`, then wired it into question detail, list, and create response serializers so question responses now emit nested tag objects instead of raw many-to-many IDs. Updated `QuestionViewSet.get_queryset()` to prefetch `tags` alongside the existing `select_related('user')` path, preserving existing list search, ordering, pagination, auth, and retrieve vote annotation behavior. Added serializer and API regression tests proving the public tag contract, empty-tag compatibility for old questions, tagged detail/list responses, create-response behavior for the current S01 no-persistence create flow, and continued search/ordering behavior. The earlier verification gate tried unavailable `pytest`; this task was verified with the planned Django management commands instead.

## Verification

`src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` reported no migration drift. `src/backend/venv/Scripts/python.exe src/backend/manage.py migrate --plan` succeeded and showed additive `qa.0003_tag_question_tags` creating `Tag` and adding `Question.tags`. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` ran 24 tests successfully with no system check issues.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` | 0 | ✅ pass | 784ms |
| 2 | `src/backend/venv/Scripts/python.exe src/backend/manage.py migrate --plan` | 0 | ✅ pass | 807ms |
| 3 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 21315ms |

## Deviations

Verification was executed through `gsd_exec` with Python subprocesses because the shell wrapper failed before command execution with `/bin/bash` unavailable in this Windows worktree. The planned Django commands themselves were unchanged.

## Known Issues

None.

## Files Created/Modified

- `src/backend/apps/qa/serializers.py`
- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/tests.py`
