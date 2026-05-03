---
id: T02
parent: S01
milestone: M001
key_files:
  - src/backend/apps/qa/serializers.py
  - src/backend/apps/qa/tests.py
key_decisions:
  - Used a strict DRF CharField subclass for tag list items so malformed non-string inputs are rejected instead of coerced.
  - Popped validated tags during serializer create/update to preserve S01's no-persistence boundary while keeping normalized data available for validation.
duration: 
verification_result: passed
completed_at: 2026-05-03T22:20:37.933Z
blocker_discovered: false
---

# T02: Added the question tag serializer normalization contract with strict validation and focused Q&A tests.

**Added the question tag serializer normalization contract with strict validation and focused Q&A tests.**

## What Happened

Implemented the T02 serializer contract in `src/backend/apps/qa/serializers.py`: added tag normalization constants, latin/digit/hyphen validation, duplicate collapse in first-seen normalized order, max-five enforcement, and an optional write-only `tags` field on `QuestionUpdateCreateSerializer`. Added a strict `QuestionTagNameField` because DRF `CharField` otherwise coerces integer inputs before `validate_tags`, which would violate the malformed-input contract. The serializer keeps normalized tags available in `validated_data` after validation, but `create()` and `update()` pop `tags` so S01 does not create Tag rows, attach many-to-many relationships, or update counters; that persistence work remains for downstream S02. Added focused tests in `src/backend/apps/qa/tests.py` for normalization, optional omission, exactly five tags, duplicate collapse, malformed payloads, invalid characters, non-Latin text, over-limit lists, and the no-persistence behavior on save.

## Verification

Verified the task with the planned Django Q&A test command using the local venv against a disposable MySQL 8 container on the `.env` port. The final run passed all 18 `apps.qa` tests. Also ran the S01 schema drift check; `makemigrations qa --check --dry-run` reported no changes. LSP diagnostics could not be used because no Python language server was available in this harness.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 17001ms |
| 2 | `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` | 0 | ✅ pass | 885ms |

## Deviations

The prior automated verification tried bare `pytest`, but this project task requires Django's `manage.py test apps.qa`; bare `pytest` is unavailable in the worktree. Shell-backed runners also failed because `/bin/bash` is missing, so verification was executed through `gsd_exec` with the same Windows Python command. I started a disposable MySQL container on port 3310 to satisfy the existing local `.env` database settings, matching the T01 verification approach.

## Known Issues

None.

## Files Created/Modified

- `src/backend/apps/qa/serializers.py`
- `src/backend/apps/qa/tests.py`
