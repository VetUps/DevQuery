# S04: Question list filtering and tag display contract

**Goal:** Question discovery API consumes the persisted tag associations from S01/S02 so `/question/?tag=django&tag=serializer` filters questions with repeated-tag AND semantics, while list/detail responses continue to expose nested tag-chip data for tagged and untagged questions.
**Demo:** Question list can be filtered with `/question/?tag=django&tag=serializer`; list/detail responses include tag chips data.

## Must-Haves

- R006 is satisfied by backend tests proving `/question/` accepts one or more repeated `tag` query params, normalizes them for lookup, applies AND semantics across tags, returns no rows for missing tags, and does not create tags during filtering.
- R007 is satisfied by backend tests proving question list and detail responses expose `tags` as nested `{name, questions_count}` objects and `tags: []` for untagged questions, including filtered list responses.
- Existing `search`, `ordering`, and `PageNumberPagination` behavior continues to work when `tag` filters are present or absent.
- The OpenAPI schema documents the public `tag` query parameter on `GET /question/` without changing the existing unauthenticated list/retrieve auth model.
- Threat Surface (Q3): repeated `tag` query params are untrusted public input reaching ORM filters; abuse risks are parameter spam, malformed text, and attempts to force expensive joins; data exposure risk is low because only public question metadata and public tag names/counts should be returned.
- Requirement Impact (Q4): touches R006, R007, and compatibility constraints from R010; re-verify existing question list search, ordering, pagination, untagged question responses, D003 repeated-param semantics, and the nested tag response pattern established by S01/S02.

## Proof Level

- This slice proves: backend API contract and integration with the real ORM/queryset path. Real runtime required: no live server is required; Django API tests exercise the DRF viewset, serializers, URL routing, ORM joins, and pagination against the test database. Human/UAT required: no; S06 owns frontend URL-state and end-to-end discovery UAT.

## Integration Closure

Upstream surfaces consumed: `Tag`, `Question.tags`, nested `TagSerializer`, create-flow persisted associations, and stored `Tag.questions_count` from S01/S02.
New wiring introduced in this slice: `QuestionViewSet.get_queryset()` applies repeated `tag` query params to the real question list queryset and `QuestionViewSet.list` documents the parameter.
What remains before the milestone is truly usable end-to-end: frontend discovery/detail rendering and URL-state filtering in S06, plus frontend authoring integration in S05.

## Verification

- Slice verification commands:
- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`
- Planned test coverage lives in `src/backend/apps/qa/tests.py` and must assert repeated-tag filtering, nested tag display, schema documentation, and compatibility with search/ordering/pagination.
- Runtime signals: no new logs are planned; behavior is observable through deterministic DRF responses, response counts, and persisted `Tag`/question M2M state in the database.
- Inspection surfaces: `GET /question/?tag=...` API response, generated OpenAPI schema, and Django test diagnostics.
- Failure visibility: failing tests should localize whether breakage is in normalization, AND semantics, schema documentation, pagination/search/ordering composition, or nested response shape.
- Redaction constraints: tag names and public question metadata are non-secret; do not expose raw tag IDs or unrelated question body data in list tag chips.

## Tasks

- [ ] **T01: Apply repeated-tag AND filtering to question discovery** `est:1h 30m`
  Expected executor skills: `api-design`, `tdd`, `verify-before-complete`.
  - Files: `src/backend/apps/qa/views.py`, `src/backend/apps/qa/tests.py`
  - Verify: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

- [ ] **T02: Harden tag display and schema contract for question clients** `est:1h`
  Expected executor skills: `api-design`, `tdd`, `verify-before-complete`.
  - Files: `src/backend/apps/qa/views.py`, `src/backend/apps/qa/tests.py`
  - Verify: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` and `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`

## Files Likely Touched

- src/backend/apps/qa/views.py
- src/backend/apps/qa/tests.py
