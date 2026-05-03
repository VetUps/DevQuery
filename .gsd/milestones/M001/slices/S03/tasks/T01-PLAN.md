---
estimated_steps: 5
estimated_files: 5
skills_used:
  - api-design
  - tdd
  - verify-before-complete
---

# T01: Implement the public tag autocomplete happy path

**Slice:** S03 — Tag autocomplete API
**Milestone:** M001

## Description

Add the list-only `/tag/` API route and prove the main autocomplete contract with Django API tests.

This task closes the core of R005: frontend clients need a stable backend surface that returns existing normalized tags with stored question counts by partial input. Autocomplete must be a helper only; it must never create missing tags or block the manual create-question tag flow established by D001 and D005.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `tags` database table | Let DRF/Django surface standard test/development failure diagnostics; do not swallow DB errors silently. | Keep query bounded so normal test/runtime requests do not hang on large tables. | Serializer must return only `name` and `questions_count`; tests should fail if extra/private fields appear. |
| Anonymous API caller | Must receive HTTP 200 for reads, not 401/403. | N/A for local API test client. | N/A. |

## Load Profile

- **Shared resources**: `tags` table and DB read connections.
- **Per-operation cost**: one bounded tag read query with serializer output for matching rows.
- **10x breakpoint**: repeated typeahead calls may create DB read pressure; avoid unbounded result sets and raw SQL.

## Negative Tests

- **Malformed inputs**: mixed-case and non-matching text should be treated as plain search text, not raw SQL or tag creation input.
- **Error paths**: unauthenticated caller must not be rejected.
- **Boundary conditions**: no matched tags should not create new tag rows.

## Steps

1. Add `TagAutocompleteApiTests` or equivalent tests in `src/backend/apps/qa/tests.py` covering unauthenticated `GET /tag/?search=dj`, partial/case-insensitive matching, and response objects shaped only as `{name, questions_count}`.
2. Implement a list-only tag viewset in `src/backend/apps/qa/views.py` using the existing `Tag` model and `TagSerializer`; keep permissions public with `AllowAny`.
3. Register the viewset in `src/backend/apps/qa/urls.py` as `router.register('tag', ..., basename='tag')` so the route is `/tag/` and follows current QA router conventions.
4. Search should trim and lowercase the `search` query param and filter existing tag names case-insensitively; do not create tags from autocomplete.
5. Order happy-path matches deterministically by `-questions_count`, then `name` so useful tags appear first and test results are stable.

## Must-Haves

- [ ] `GET /tag/?search=Dj` works without authentication.
- [ ] The response contains only existing matching tags and never creates missing tags.
- [ ] Response objects are serialized through `TagSerializer` and expose only `name` and `questions_count`.
- [ ] Existing question endpoints remain compatible.

## Verification

- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests`

## Observability Impact

- Signals added/changed: real public HTTP inspection surface at `GET /tag/?search=...`.
- How a future agent inspects this: call the endpoint or run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests`.
- Failure state exposed: focused test failures identify route, auth, response-shape, and search regressions.

## Inputs

- `src/backend/apps/qa/models.py` — Existing `Tag` model with normalized unique `name` and stored `questions_count`.
- `src/backend/apps/qa/serializers.py` — Existing `TagSerializer` response contract.
- `src/backend/apps/qa/views.py` — Existing DRF viewset conventions and permission patterns.
- `src/backend/apps/qa/urls.py` — Existing QA router registrations.
- `src/backend/apps/qa/tests.py` — Existing backend API test patterns.

## Expected Output

- `src/backend/apps/qa/views.py` — Adds public list-only tag autocomplete viewset.
- `src/backend/apps/qa/urls.py` — Registers the `/tag/` route.
- `src/backend/apps/qa/tests.py` — Adds focused API tests for happy-path autocomplete behavior.
