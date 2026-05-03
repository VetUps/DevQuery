---
id: T01
parent: S03
milestone: M001
key_files:
  - src/backend/apps/qa/views.py
  - src/backend/apps/qa/urls.py
  - src/backend/apps/qa/tests.py
key_decisions:
  - Expose `/tag/` as a public list-only endpoint returning a plain unpaginated list hard-limited to 10 suggestions.
  - Blank tag autocomplete searches return an empty list rather than the full tag table.
duration: 
verification_result: passed
completed_at: 2026-05-03T22:41:19.358Z
blocker_discovered: false
---

# T01: Added a public bounded tag autocomplete API returning existing tag names with question counts.

**Added a public bounded tag autocomplete API returning existing tag names with question counts.**

## What Happened

Implemented `TagViewSet` as a list-only public DRF viewset backed by the existing `Tag` model and `TagSerializer`. Registered it at `/tag/` through the QA router. The endpoint trims and lowercases `search`, returns no results for blank input, filters existing tags case-insensitively without creating missing tags, orders by `-questions_count` then `name`, and hard-limits suggestions to 10. Added `TagAutocompleteApiTests` covering unauthenticated access, partial/case-insensitive matches, public-only response shape, nonmatching input, blank input, malformed-looking search text, deterministic ordering, and bounded results.

## Verification

Fresh verification passed for the required scoped command and the broader QA app suite. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests` ran 6 tests successfully. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` ran 33 tests successfully, confirming existing QA endpoints remain compatible. The default bash runners were unavailable in this Windows worktree due to missing `/bin/bash`, so both successful commands were executed through `gsd_exec` with the same Windows Python interpreter path.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests` | 0 | ✅ pass | 7923ms |
| 2 | `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` | 0 | ✅ pass | 21709ms |

## Deviations

Added empty-search, malformed-search, and bounded-limit tests beyond the narrow happy-path wording because the task plan's failure-mode, load-profile, and negative-test sections explicitly called for those behaviors. Used `gsd_exec` instead of `bash`/`async_bash` because both shell tools failed before command execution with missing `/bin/bash` in this environment.

## Known Issues

No application issues discovered. Shell-based verification tools are unavailable in this worktree because `/bin/bash` is missing; `gsd_exec` successfully ran the same Python test commands.

## Files Created/Modified

- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/urls.py`
- `src/backend/apps/qa/tests.py`
