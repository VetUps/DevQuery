# S01: Backend tag model and serializer contract

**Goal:** Establish the backend tag data model and serializer contract for questions: a normalized unique Tag model with stored questions_count, an optional Question.tags relationship that preserves existing untagged questions, and DRF serializers that validate and represent tags as the downstream API contract.
**Demo:** Backend has tag persistence and validation contract; old questions without tags still work in tests.

## Must-Haves

- ## Must-Haves
- R001: Backend has a `Tag` model with unique normalized `name`, stored `questions_count`, and a `Question.tags` many-to-many relation with `blank=True` so existing questions can have zero tags.
- R002: DRF serializer code normalizes and validates provided tags by trimming, lowercasing, accepting only latin letters/digits/hyphen, rejecting empty values, collapsing duplicates after normalization, and enforcing a maximum of 5 unique tags.
- R010: Existing question create/list/retrieve behavior remains compatible for questions without tags; serializers emit `tags: []` rather than raw M2M IDs or errors.
- Downstream contract: question read/create response serializers expose tags as objects shaped `{name, questions_count}` and the write serializer accepts an optional `tags: string[]` contract without performing S02 get_or_create/counter updates yet.
- Verification includes focused Django tests in `src/backend/apps/qa/tests.py`, migration drift proof, migration plan inspection, and the existing `apps.qa` test suite.

## Proof Level

- This slice proves: Contract + data-model proof. This slice proves the persistence schema and serializer boundary contract through Django migrations and automated backend tests; it does not yet prove runtime question creation with tag persistence/counter increments, autocomplete, or repeated-tag filtering because those are owned by S02-S04.

## Integration Closure

Upstream surfaces consumed: none; S01 is the first tag-system slice. New wiring introduced: `src/backend/apps/qa/models.py` adds `Tag` and `Question.tags`; `src/backend/apps/qa/serializers.py` exposes `TagSerializer`, optional write-side tag validation, and nested read/create response tags; `src/backend/apps/qa/views.py` may prefetch tags for question list/retrieve/create response efficiency. Remaining before end-to-end usability: S02 must persist submitted tags and update counters, S03 must expose autocomplete, S04 must add repeated `tag` filtering and full display contract, and frontend slices must wire the UI.

## Verification

- Runtime signals: no new logs or endpoints are required for this contract slice. Inspection surfaces: Django migration plan, the `tags` table, the `questions_tags` join table, serializer validation errors under the `tags` field, and `apps.qa` tests. Failure visibility: invalid tag payloads fail with DRF serializer errors localized to `tags`; schema drift is caught by `makemigrations qa --check --dry-run`. Redaction constraints: tag names are public user input; no secrets or token data are exposed.

## Tasks

- [ ] **T01: Add Tag persistence and optional Question relationship** `est:45m`
  Why: This task retires the highest-risk data migration part of R001/R010 while keeping existing question rows valid.
  - Files: `src/backend/apps/qa/models.py`, `src/backend/apps/qa/migrations/0003_tag_question_tags.py`, `src/backend/apps/qa/tests.py`
  - Verify: `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` and `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

- [ ] **T02: Define serializer tag normalization and validation contract** `est:1h`
  Why: This task establishes R002 as a reusable serializer contract before S02 wires persistence and counters.
  - Files: `src/backend/apps/qa/serializers.py`, `src/backend/apps/qa/tests.py`
  - Verify: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

- [ ] **T03: Expose nested tag response shape and regression proof** `est:1h`
  Why: This task closes the downstream API response boundary so S02-S04 and frontend work can rely on stable tag chips data instead of raw M2M IDs.
  - Files: `src/backend/apps/qa/serializers.py`, `src/backend/apps/qa/views.py`, `src/backend/apps/qa/tests.py`
  - Verify: `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` then `src/backend/venv/Scripts/python.exe src/backend/manage.py migrate --plan` then `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

## Files Likely Touched

- src/backend/apps/qa/models.py
- src/backend/apps/qa/migrations/0003_tag_question_tags.py
- src/backend/apps/qa/tests.py
- src/backend/apps/qa/serializers.py
- src/backend/apps/qa/views.py
