# S03: Tag autocomplete API — UAT

**Milestone:** M001
**Written:** 2026-05-03T22:45:37.134Z

# S03: Tag autocomplete API — UAT

**Milestone:** M001
**Written:** 2026-05-03

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice is a backend API contract with no human-facing UI. Django API tests directly exercise the route, auth behavior, filtering, response shape, ordering, empty states, OpenAPI metadata, and regression compatibility.

## Preconditions

- Backend dependencies are installed in `src/backend/venv`.
- The database can be created for Django tests.
- S01 tag persistence and S02 question-create tag counter behavior are present.

## Smoke Test

Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests`. Expected: the command exits 0 and reports 8 passing tests.

## Test Cases

### 1. Public partial tag search returns normalized suggestions

1. Seed existing tags such as `django`, `django-rest-framework`, and unrelated tags with different `questions_count` values.
2. Issue unauthenticated `GET /tag/?search=djan`.
3. **Expected:** HTTP 200 with a JSON list of matching tags only, each object containing `name` and `questions_count`.

### 2. Search is normalized and case-insensitive

1. Seed an existing normalized tag named `serializer`.
2. Issue `GET /tag/?search=  SER  `.
3. **Expected:** HTTP 200 and the response includes `serializer`; whitespace/case in the query does not prevent the match.

### 3. Blank or missing search does not expose all tags

1. Seed several existing tags.
2. Issue `GET /tag/`, `GET /tag/?search=`, and `GET /tag/?search=   `.
3. **Expected:** each request returns HTTP 200 with `[]` rather than the full tag table.

### 4. Autocomplete ordering and limit are deterministic

1. Seed more than 10 matching tags with varied `questions_count` and names.
2. Issue `GET /tag/?search=<shared-prefix>`.
3. **Expected:** the response contains at most 10 items ordered by descending `questions_count`, then ascending `name` for ties.

### 5. Public response shape stays narrow

1. Issue a matching `GET /tag/?search=<partial>`.
2. Inspect the response object keys.
3. **Expected:** each item exposes exactly the public `TagSerializer` shape: `name` and `questions_count`; no tag IDs, question objects, user data, or raw internals appear.

### 6. Existing QA behavior still regresses cleanly

1. Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`.
2. Run `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`.
3. **Expected:** QA tests pass and no new QA migrations are detected.

## Edge Cases

### Malformed-looking or nonmatching search text

1. Issue `GET /tag/?search=<script>` or another nonmatching value.
2. **Expected:** HTTP 200 with `[]`; the endpoint does not error and does not create a tag.

### Autocomplete failure should not block manual entry downstream

1. Simulate `/tag/?search=unknown` returning `[]`.
2. **Expected:** The API safely indicates no suggestions; manual tag creation remains a separate S02 create-question behavior and is not changed by S03.

## Failure Signals

- `GET /tag/?search=<partial>` returns 401/403 instead of public HTTP 200.
- Blank or missing `search` returns all tags.
- Response items include IDs, nested question data, or user data.
- Results are unbounded or ordered nondeterministically.
- `questions_count` is missing or mismatched with stored tag counters.
- Full `apps.qa` regression tests fail after autocomplete changes.

## Not Proven By This UAT

- Frontend tag input consumption and manual fallback UX; that remains for S05.
- Question list filtering by repeated `tag` params and tag chips on question list/detail; that remains for S04.
- Full frontend/backend tag-flow regression; that remains for S06.
- Production performance under large tag tables beyond the current bounded-query contract.

## Notes for Tester

- The authoritative verifier for this project is Django `manage.py test`, not bare `pytest`; this Windows worktree currently lacks a `pytest` command on PATH.
- drf-spectacular may emit pre-existing warnings for unrelated path parameters during schema generation; those warnings are not failures for the `/tag/` autocomplete contract.

