# S02: Question creation with tags and counters — UAT

**Milestone:** M001
**Written:** 2026-05-03T22:35:28.666Z

# S02: Question creation with tags and counters — UAT

**Milestone:** M001
**Written:** 2026-05-03

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice is a backend API/ORM integration slice with no frontend UI or human-experience surface. Focused Django API tests exercise the real `POST /question/` path, serializer validation, ORM persistence, many-to-many associations, transaction rollback behavior, and stored counter updates.

## Preconditions

- The backend code is available in the M001 worktree.
- The project virtualenv Python exists at `src/backend/venv/Scripts/python.exe`.
- Test database access is available through the Django test runner configuration.
- S01 schema is applied: `Tag` exists, `Question.tags` is optional, and untagged questions remain valid.

## Smoke Test

Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`. Expected: the suite exits 0, runs the focused apps.qa tests, and reports `OK`.

## Test Cases

### 1. Authenticated create with new normalized tags

1. Authenticate an API client as a valid user.
2. POST `/question/` with a valid title/body and tags such as `[" Django ", "REST-framework"]`.
3. **Expected:** The response is successful, returns nested tag objects with normalized names like `django` and `rest-framework`, creates corresponding Tag rows, associates them with the new Question, and sets each tag's `questions_count` to include the new question.

### 2. Existing and new tags are reused/created correctly

1. Pre-create an existing Tag row, for example `django` with an existing counter.
2. POST `/question/` with tags including `django` plus a new valid tag.
3. **Expected:** The existing `django` row is reused rather than duplicated, the new tag is created, the question is associated with both, and both counters increment exactly once for the new question.

### 3. Duplicate submitted tags collapse before persistence and counting

1. Authenticate an API client.
2. POST `/question/` with duplicate-equivalent tag values such as `["Django", " django ", "django"]`.
3. **Expected:** Only one normalized `django` association is persisted, the response contains one `django` tag object, and `questions_count` increments once rather than once per submitted duplicate.

### 4. Omitted tags remain backward-compatible

1. Authenticate an API client.
2. POST `/question/` with the existing title/body write contract and no `tags` field.
3. **Expected:** The question is created successfully, no Tag rows or question/tag associations are required, and existing untagged question behavior remains valid.

## Edge Cases

### Invalid tag payload rolls back cleanly

1. POST `/question/` with malformed tags, such as empty values, non-string values, unsupported characters, non-Latin values, or more than five unique tags.
2. **Expected:** The API returns serializer validation errors under `tags`; no Question, Tag, join-table association, or counter side effect is persisted for the invalid request.

### No migration drift

1. Run `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`.
2. **Expected:** The command exits 0 and reports no changes detected, because S02 only wires create behavior and should not modify the schema.

## Failure Signals

- Create responses contain `tags: []` after valid tagged input.
- Tag rows are duplicated for an existing normalized name.
- Duplicate submitted tag names create multiple associations or over-increment `questions_count`.
- Invalid tag payloads create partial Question/Tag rows or counter changes.
- Untagged create requests start failing.
- Migration dry-run reports model changes.

## Not Proven By This UAT

- Tag autocomplete API behavior; that is deferred to S03.
- Question list/detail tag display and repeated tag filter semantics; those are deferred to S04.
- Frontend tag input and ask-question form integration; that is deferred to S05.
- End-to-end browser discovery/create/filter regression; that is deferred to S06.
- Load/concurrency behavior beyond use of atomic create and `F()` counter updates.

## Notes for Tester

The authoritative verification commands for this Windows worktree are the Django commands in the slice plan. A plain `pytest` executable is not installed and is not the planned verifier for this backend slice.
