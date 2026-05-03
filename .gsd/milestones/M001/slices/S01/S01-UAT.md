# S01: Backend tag model and serializer contract — UAT

**Milestone:** M001
**Written:** 2026-05-03T22:24:25.159Z

# S01: Backend tag model and serializer contract — UAT

**Milestone:** M001
**Written:** 2026-05-03

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 is a backend schema and serializer-contract slice with no new human-facing UI or runtime endpoint beyond existing question APIs. Migration inspection and focused Django tests are the appropriate acceptance evidence for the data model, validation contract, and response shape.

## Preconditions

- Worktree is `F:/projects/Diplom/StackOverflow2.0/.gsd/worktrees/M001`.
- Backend dependencies and local Django settings are available through `src/backend/venv/Scripts/python.exe` and `.env`.
- A MySQL database matching local settings is reachable for Django test database creation.
- No frontend server is required for this slice.

## Smoke Test

Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`. Expected: the Q&A test suite completes successfully with all S01 tag model, serializer, and response-shape regressions passing.

## Test Cases

### 1. Migration and model contract

1. Run `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`.
2. Run `src/backend/venv/Scripts/python.exe src/backend/manage.py migrate --plan`.
3. Inspect the plan for `qa.0003_tag_question_tags`.
4. **Expected:** there is no migration drift; the migration plan is additive and creates `Tag` plus the `Question.tags` many-to-many relation without requiring tags on existing questions.

### 2. Existing untagged questions remain valid

1. Create or load a question without any tags through the existing question model/serializer paths covered by `apps.qa` tests.
2. Serialize the question for list/detail response.
3. **Expected:** the question remains valid and response data includes `tags: []`, not raw M2M IDs and not an error.

### 3. Tag validation normalizes accepted input

1. Validate a question write payload with tags containing whitespace, uppercase letters, repeated names after normalization, latin letters, digits, and hyphens.
2. **Expected:** serializer validation succeeds, names are trimmed and lowercased, duplicate normalized names collapse, and up to five unique names are accepted.

### 4. Tag validation rejects invalid input

1. Validate payloads containing empty tag names, non-string values, non-Latin characters, invalid punctuation/characters, and more than five unique normalized tags.
2. **Expected:** serializer validation fails under the `tags` field with no tag persistence side effects.

### 5. Public response shape for tagged questions

1. Associate existing `Tag` objects with a question in test data.
2. Retrieve/list the question through the public question serializers or existing API tests.
3. **Expected:** each tag is represented as an object with `name` and `questions_count`; response payloads do not expose raw relation IDs.

### 6. Existing list behavior remains compatible

1. Run existing question list/search/ordering tests with the new tags prefetch path enabled.
2. **Expected:** search, ordering, pagination-compatible list behavior, and retrieve behavior continue passing while tags are included in the serializer contract.

## Edge Cases

### Duplicate tags after normalization

1. Validate tags such as `[' Django ', 'django', 'DJANGO']`.
2. **Expected:** validation produces one normalized `django` value and does not count duplicates toward the five-tag limit.

### Create response before S02 persistence

1. Submit a create payload containing valid tags through the S01 serializer path.
2. **Expected:** validation accepts the tags, but S01 does not create/attach Tag rows or update counters; the create response can still emit an empty tag list until S02 wires persistence.

## Failure Signals

- `makemigrations qa --check --dry-run` reports pending model changes.
- `migrate --plan` does not include the expected additive `qa.0003_tag_question_tags` operations or introduces required tag fields for existing questions.
- `apps.qa` tests fail in tag model, serializer, response-shape, or existing question behavior cases.
- Serialized question responses show raw tag IDs, omit the `tags` key, or error for untagged questions.
- Invalid tag payloads are accepted silently or errors are not localized to `tags`.

## Not Proven By This UAT

- Runtime question creation with get_or_create tag persistence, many-to-many attachment, or `questions_count` updates; this is S02.
- Tag autocomplete/search endpoint behavior; this is S03.
- Repeated `tag` filtering with AND semantics; this is S04.
- Frontend tag input, chips, suggestions, URL state, or browser-based end-to-end behavior; these are S05-S06.
- Performance under production data volume beyond adding queryset tag prefetching.

## Notes for Tester

The failed auto-verification command `pytest` is not the authoritative verifier for this repository. Use the Django management commands above, especially `manage.py test apps.qa`, for this backend slice.
