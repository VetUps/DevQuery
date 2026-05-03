---
id: T02
parent: S03
milestone: M001
key_files:
  - src/backend/apps/qa/tests.py
key_decisions:
  - Treat omitted OpenAPI `required` on the optional `search` parameter as equivalent to false in schema regression tests.
duration: 
verification_result: passed
completed_at: 2026-05-03T22:43:24.717Z
blocker_discovered: false
---

# T02: Pinned tag autocomplete boundary and OpenAPI schema behavior with Django regression tests.

**Pinned tag autocomplete boundary and OpenAPI schema behavior with Django regression tests.**

## What Happened

Extended `TagAutocompleteApiTests` to explicitly cover missing `search`, empty-string and whitespace-only `search`, safe no-result/malformed-looking search text, the 10-result cap, and generated OpenAPI metadata for the `/tag/` search parameter and `Tag` response shape. The existing `TagViewSet` implementation already satisfied the hardened runtime contract from T01: blank/missing searches return an empty unpaginated list, matching searches are ordered by `-questions_count` then `name`, and results are sliced to 10. The only code change needed was adding the missing regression coverage and making the schema assertion tolerant of drf-spectacular omitting the optional `required: false` key.

## Verification

Ran the task-required project verifier commands with `src/backend/venv/Scripts/python.exe`: focused `TagAutocompleteApiTests` passed 8 tests, full `apps.qa` passed 35 tests, and `makemigrations qa --check --dry-run` reported no changes. The earlier auto-gate failure was from bare `pytest`, which is not installed/authoritative in this Windows worktree; the task plan explicitly requires Django `manage.py` verification instead.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests` | 0 | ✅ pass | 7937ms |
| 2 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 22765ms |
| 3 | `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` | 0 | ✅ pass | 948ms |

## Deviations

No functional deviations. Used `gsd_exec` with the Windows Python interpreter because prior slice memory and the worktree environment show shell/bare pytest verification is unavailable here.

## Known Issues

drf-spectacular emits pre-existing warnings for unrelated path parameters during schema generation; they do not affect the `/tag/` autocomplete contract or test outcomes.

## Files Created/Modified

- `src/backend/apps/qa/tests.py`
