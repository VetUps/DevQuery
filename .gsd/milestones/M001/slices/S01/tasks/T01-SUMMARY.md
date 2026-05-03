---
id: T01
parent: S01
milestone: M001
key_files:
  - src/backend/apps/qa/models.py
  - src/backend/apps/qa/migrations/0003_tag_question_tags.py
  - src/backend/apps/qa/tests.py
key_decisions:
  - Limited this task to schema and model-level tests only; tag counter update behavior remains deferred to downstream create-flow work as planned.
duration: 
verification_result: passed
completed_at: 2026-05-03T22:16:01.467Z
blocker_discovered: false
---

# T01: Added Tag persistence with optional Question.tags relation and model tests for untagged questions and unique tag names.

**Added Tag persistence with optional Question.tags relation and model tests for untagged questions and unique tag names.**

## What Happened

Implemented a new `Tag` model in the Q&A domain with unique indexed `name`, stored `questions_count`, `db_table = 'tags'`, and string representation by name. Added an optional `Question.tags` many-to-many relationship with `blank=True`, preserving existing question creation flows that do not provide tags. Created additive migration `0003_tag_question_tags.py` depending on `qa.0002_initial`; it creates the `tags` table and adds the many-to-many relation without adding required columns to existing `questions` rows. Added focused model tests proving zero-tag questions remain valid and duplicate tag names raise `IntegrityError`. Verification required bootstrapping the ignored local venv and `.env` in this isolated worktree, then running the final checks against a throwaway MySQL container because the compose `db` hostname only resolves inside Docker networks.

## Verification

`src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` passed with no migration drift. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` passed all 8 Q&A tests, including the new tag model tests, against a MySQL test database.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` | 0 | ✅ pass | 772ms |
| 2 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 16236ms |

## Deviations

The worktree did not include the ignored `src/backend/venv` or `.env` expected by the task plan, and `/bin/bash` was unavailable. I created ignored local verification infrastructure and used a throwaway MySQL container on localhost for the mandated Django commands; no tracked runtime configuration was changed.

## Known Issues

None.

## Files Created/Modified

- `src/backend/apps/qa/models.py`
- `src/backend/apps/qa/migrations/0003_tag_question_tags.py`
- `src/backend/apps/qa/tests.py`
