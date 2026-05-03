---
id: T01
parent: S04
milestone: M001
key_files:
  - src/backend/apps/qa/views.py
  - src/backend/apps/qa/tests.py
key_decisions:
  - Question discovery normalizes tag query parameters for filtering but does not validate them with create-time tag rules or create missing tags.
  - Repeated `tag` query parameters are implemented by chaining one ORM filter per normalized tag and applying `distinct()` to protect pagination from join multiplicity.
duration: 
verification_result: mixed
completed_at: 2026-05-03T22:52:36.401Z
blocker_discovered: false
---

# T01: Added repeated-tag AND filtering to the public question list API.

**Added repeated-tag AND filtering to the public question list API.**

## What Happened

Extended `QuestionDiscoveryTests` with overlapping persisted `Tag` fixtures and public `/question/` assertions for one-tag filtering, repeated-tag AND semantics, duplicate/case/whitespace normalization, unknown malformed-looking tag input, pagination/search/ordering coexistence, nested tag response shape, and OpenAPI parameter documentation. Updated `QuestionViewSet.get_queryset()` to read `request.query_params.getlist('tag')`, normalize by `strip().lower()`, dedupe non-empty values, chain one `tags__name` filter per value for AND semantics, and call `distinct()` only when tag filters are active. Documented the repeated `tag` query parameter on the list operation without changing create/update tag semantics or public permissions.

## Verification

Ran focused red/green tests for `QuestionDiscoveryTests`, then ran the slice verification commands. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` passed with 41 tests. `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` passed with no changes detected. LSP diagnostics could not run because no Python language server is configured in this worktree.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.QuestionDiscoveryTests` | 1 | ✅ pass (RED confirmed expected failures before implementation) | 12088ms |
| 2 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.QuestionDiscoveryTests` | 0 | ✅ pass | 11598ms |
| 3 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 26073ms |
| 4 | `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` | 0 | ✅ pass | 796ms |
| 5 | `lsp diagnostics src/backend/apps/qa/views.py && lsp diagnostics src/backend/apps/qa/tests.py` | 1 | ❌ fail (no language server found) | 0ms |

## Deviations

Used `gsd_exec` with a Python subprocess runner for verification because the shell runner cannot start `/bin/bash` in this Windows worktree; the underlying verification commands were unchanged.

## Known Issues

Existing drf-spectacular warnings remain for `CommentDetailSerializer.get_replies` type inference and the user path parameter type; they are unrelated to this task and did not fail tests.

## Files Created/Modified

- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/tests.py`
