# S03: Tag autocomplete API

**Goal:** Add a public backend tag autocomplete/search API so API clients can search existing normalized tags by partial input and receive deterministic `{name, questions_count}` suggestions without changing manual tag creation behavior.
**Demo:** API clients can call `GET /tag/?search=django` and receive existing normalized tag suggestions with stored question counts.

## Must-Haves

- Public `GET /tag/?search=<partial>` returns HTTP 200 without authentication.
- Responses use the existing `TagSerializer` public shape exactly: `name` and `questions_count`, with no raw IDs or question data.
- Search input is trimmed/lowercased and matched case-insensitively against existing normalized tag names.
- Missing or blank `search` returns a predictable empty list instead of exposing all tags.
- Results are bounded for autocomplete and ordered deterministically by highest `questions_count`, then `name`.
- Existing question creation/list/search/ordering tag tests continue passing.

## Threat Surface

- **Abuse**: User-controlled query text may be spammed from typeahead clients or tampered with to attempt unbounded reads; implementation must avoid raw SQL and bound results.
- **Data exposure**: Only public tag names and stored question counts should be exposed; no raw tag IDs, question IDs, user data, question bodies, tokens, or secrets.
- **Input trust**: The `search` query parameter is untrusted user input reaching a DB filter and must be treated as text only.

## Requirement Impact

- **Requirements touched**: R005 is owned and must be proven; R011 is advanced through backend API contract tests.
- **Re-verify**: Tag autocomplete route/auth/search/shape/empty/limit behavior plus existing `apps.qa` question create/list/search/ordering tests.
- **Decisions revisited**: D001 and D005 remain honored because autocomplete is helper-only and must not block/manual-create tags; D002 supplies stored `questions_count`; D006 defines the S03 endpoint contract.

## Proof Level

- This slice proves: contract and backend integration
- Real runtime required: no; Django API test client is sufficient
- Human/UAT required: no

## Verification

- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`

## Observability / Diagnostics

- Runtime signals: no new logs; endpoint failures are visible through DRF HTTP status/error responses and Django test failures.
- Inspection surfaces: `GET /tag/?search=...`, `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests`, and the `tags` DB table.
- Failure visibility: contract tests localize route, auth, response-shape, ordering, empty-query, and limit regressions.
- Redaction constraints: tag names and counts are public discovery data; no user PII, tokens, or question bodies should be exposed.

## Integration Closure

- Upstream surfaces consumed: `Tag` model and `TagSerializer` from S01, stored `questions_count` updates from S02, existing DRF router conventions in `src/backend/apps/qa/urls.py`.
- New wiring introduced in this slice: public list-only tag endpoint registered in the QA API router at `/tag/`.
- What remains before the milestone is truly usable end-to-end: S05 must consume this API from the frontend tag input, and S06 must prove full frontend/backend tag-flow regression.

## Tasks

- [ ] **T01: Implement the public tag autocomplete happy path** `est:1h`
  - Why: R005 is owned by S03, and frontend S05 needs a stable backend surface that returns existing normalized tags with question counts by partial input.
  - Files: `src/backend/apps/qa/views.py`, `src/backend/apps/qa/urls.py`, `src/backend/apps/qa/tests.py`
  - Do: Add focused API tests, implement a public list-only `TagViewSet` using `Tag` + `TagSerializer`, register `/tag/`, normalize the `search` query, filter existing tags without creating anything, and order by `-questions_count`, then `name`.
  - Verify: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests`
  - Done when: unauthenticated partial/case-insensitive tag autocomplete returns only matching `{name, questions_count}` objects through `/tag/`.
- [ ] **T02: Harden autocomplete boundaries and schema documentation** `est:45m`
  - Why: Autocomplete accepts user-controlled query text and will later be called frequently from the frontend; predictable empty/error behavior and a bounded result set prevent accidental tag dumps and unstable UI behavior.
  - Files: `src/backend/apps/qa/views.py`, `src/backend/apps/qa/tests.py`
  - Do: Add missing/blank/no-result/limit tests, ensure missing or blank `search` returns `[]`, cap suggestions at 10, document `search` and `TagSerializer(many=True)` with drf-spectacular, and run full regression verification.
  - Verify: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests && src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa && src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`
  - Done when: boundary behavior, suggestion limit, schema metadata, full QA tests, and migration drift check all pass.

## Files Likely Touched

- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/urls.py`
- `src/backend/apps/qa/tests.py`
