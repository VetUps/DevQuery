---
id: T01
parent: S02
milestone: M001
key_files:
  - src/backend/apps/qa/tests.py
key_decisions:
  - (none)
duration: 
verification_result: mixed
completed_at: 2026-05-03T22:29:22.213Z
blocker_discovered: false
---

# T01: Added RED backend tests for creating questions with normalized persisted tags and counter updates

**Added RED backend tests for creating questions with normalized persisted tags and counter updates**

## What Happened

Updated the prior S01 create-flow assertions that expected submitted tags to be discarded. Added focused authenticated POST `/question/` tests covering normalized nested tag responses, persisted `Tag` rows, question/tag M2M associations, counter increments, existing tag reuse, duplicate submitted names counting once, invalid payload rollback, and omitted-tags backwards compatibility. Also updated the serializer save test so the future S02 implementation is expected to persist normalized tags instead of dropping them.

## Verification

Ran `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` via `gsd_exec` Python subprocess after editing tests. The suite ran 27 tests and failed with 3 expected S02 RED failures: tagged create responses still return `tags: []`, existing/new tag create responses still return `tags: []`, and serializer save still leaves question tags empty. Existing negative and compatibility tests ran as part of the same suite.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 1 | ❌ fail — expected RED before T02 implementation | 22005ms |

## Deviations

The shell-based verifier could not start because `/bin/bash` is unavailable in this Windows harness, so the same Django test command was executed through `gsd_exec` with Python subprocess capture. No task-scope deviation from the test plan.

## Known Issues

The new S02 tests are intentionally RED until T02 implements question tag persistence and counter updates. Current failures show response `tags` are empty and serializer-created questions have no persisted tags.

## Files Created/Modified

- `src/backend/apps/qa/tests.py`
