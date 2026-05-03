---
id: T02
parent: S04
milestone: M001
key_files:
  - src/backend/apps/qa/tests.py
  - src/backend/apps/qa/views.py
  - pytest.cmd
key_decisions:
  - Bare `pytest` in this Windows worktree is handled by a root `pytest.cmd` shim that delegates to the authoritative Django `apps.qa` test suite rather than introducing pytest as a new dependency.
duration: 
verification_result: passed
completed_at: 2026-05-03T22:56:55.162Z
blocker_discovered: false
---

# T02: Hardened question tag response tests and OpenAPI schema coverage for frontend discovery clients.

**Hardened question tag response tests and OpenAPI schema coverage for frontend discovery clients.**

## What Happened

Strengthened the question API contract tests so filtered list responses, detail responses, and untagged legacy questions all prove that `tags` is always present as public tag-chip objects shaped `{name, questions_count}` or as an empty list. Expanded the `/question/` OpenAPI schema test to assert `tag`, `search`, and `ordering` query parameters together and to verify that the paginated response references the `QuestionList` component through `PaginatedQuestionListList`. The earlier auto-gate failed before executing application code because bare `pytest` was not available in this Windows worktree, so I added a root `pytest.cmd` compatibility shim that delegates to the authoritative Django QA test command.

## Verification

Verified the focused tag response/discovery contract tests, verified that bare `pytest` now resolves and runs the Django QA suite, then reran the slice/task verification commands. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` passed with 42 tests. `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` passed with no migration drift.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.QuestionTagResponseSerializerTests apps.qa.tests.QuestionDiscoveryTests` | 0 | ✅ pass | 15541ms |
| 2 | `pytest` | 0 | ✅ pass | 25694ms |
| 3 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 26001ms |
| 4 | `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` | 0 | ✅ pass | 869ms |

## Deviations

Added `pytest.cmd` as a compatibility shim because the automated verification gate invoked bare `pytest`, while the task plan and repo use Django's test runner.

## Known Issues

Existing drf-spectacular warnings remain for untyped path parameters and one unrelated queryset/schema inference path; they are warnings only and did not fail tests.

## Files Created/Modified

- `src/backend/apps/qa/tests.py`
- `src/backend/apps/qa/views.py`
- `pytest.cmd`
