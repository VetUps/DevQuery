---
estimated_steps: 17
estimated_files: 2
skills_used: []
---

# T01: Apply repeated-tag AND filtering to question discovery

Expected executor skills: `api-design`, `tdd`, `verify-before-complete`.

Add the real `GET /question/` filtering behavior for repeated `tag` query params, using persisted question/tag associations without changing the existing public list endpoint contract.

Steps:
1. Extend `QuestionDiscoveryTests` in `src/backend/apps/qa/tests.py` with fixtures that attach overlapping `Tag` rows to multiple questions.
2. Add RED tests for one tag, two repeated tags with AND semantics, duplicate/case/whitespace-normalized tag params, unknown tag returning no rows without creating a tag, and tag filters combined with existing `search`/`ordering`/pagination response shape.
3. Update `QuestionViewSet.get_queryset()` in `src/backend/apps/qa/views.py` to read `request.query_params.getlist('tag')`, strip/lowercase/dedupe non-empty values, apply one queryset filter per tag name for AND semantics, and use `distinct()` so join multiplicity cannot duplicate questions.
4. Keep the endpoint public and paginated; do not create `Tag` rows from filter params and do not change create/update tag semantics.
5. Run the task verification command and fix regressions before completion.

Must-haves:
- R006 is directly advanced by executable API tests and real ORM filtering.
- Repeated `tag` params use AND semantics, not OR or comma parsing.
- Unknown/malformed-looking tag input is safe, read-only, and does not create rows.
- Search, ordering, and pagination still work with and without tag filters.

Threat/quality focus:
- Failure Modes (Q5): the dependency is the Django ORM many-to-many join between `Question` and `Tag`; missing or unknown tags should return an empty paginated result, malformed-looking tag text must not create tags or crash, and duplicate tag query params should be idempotent after normalization.
- Load Profile (Q6): shared resources are the questions table, tags table, and join table; per operation should remain one paginated list queryset with tag joins and existing `prefetch_related('tags')`; at 10x load the first risk is duplicate rows or inefficient join chains, so use `distinct()` when filtering by tags.
- Negative Tests (Q7): cover one tag, two repeated tags with AND semantics, duplicate/case/whitespace-normalized tag params, unknown tag returning no rows without creating a tag, and coexistence with existing `search`, `ordering`, and pagination response shape.

## Inputs

- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/tests.py`
- `src/backend/apps/qa/models.py`
- `src/backend/apps/qa/serializers.py`

## Expected Output

- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/tests.py`

## Verification

`src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

## Observability Impact

This task changes the public question-list API path. Future agents can inspect behavior with `GET /question/?tag=django&tag=serializer` or the Django test failures in `QuestionDiscoveryTests`; the API response count/results reveal filter state without exposing secrets.
