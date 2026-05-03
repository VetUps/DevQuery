---
estimated_steps: 31
estimated_files: 3
skills_used: []
---

# T03: Expose nested tag response shape and regression proof

Why: This task closes the downstream API response boundary so S02-S04 and frontend work can rely on stable tag chips data instead of raw M2M IDs.

Skills expected: `api-design`, `tdd`, `verify-before-complete`.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| QuestionViewSet query/serializer wiring | Keep existing list/retrieve/create action selection intact; only add tag prefetch/fields needed for the response contract. | Not applicable for local tests. | Regression tests should fail if responses emit raw UUID/PK IDs instead of `{name, questions_count}` objects. |

Load Profile:
- Shared resources: database reads for question tags.
- Per-operation cost: list/retrieve responses include nested tag serialization; `prefetch_related('tags')` should avoid avoidable N+1 reads.
- 10x breakpoint: large question pages could suffer N+1 if prefetch is omitted; S04 can optimize further when filtering is added.

Steps:
1. Add `TagSerializer` in `src/backend/apps/qa/serializers.py` with read-only fields `name` and `questions_count` only.
2. Add `tags = TagSerializer(many=True, read_only=True)` to `QuestionGetSerializer`, `QuestionListSerializer`, and `QuestionCreateResponseSerializer`; ensure `QuestionListSerializer.Meta.fields` includes `tags` and `QuestionGetSerializer(fields='__all__')` no longer emits raw M2M IDs for tags.
3. In `QuestionViewSet.get_queryset()` in `src/backend/apps/qa/views.py`, add `prefetch_related('tags')` for question querysets where serializers may render tags; do not change auth, search, ordering, lookup field, or pagination.
4. Add regression tests: untagged list/detail/create response serializers emit `tags: []`; tagged question serializers/API responses emit `tags` as `[{ 'name': 'django', 'questions_count': 1 }]`; existing search and ordering tests continue passing.
5. Run migration drift check, inspect migration plan for the additive tag migration, and run the full `apps.qa` suite.

Must-Haves:
- [ ] `TagSerializer` exposes only `name` and `questions_count` for the public contract.
- [ ] Question list/detail/create response serializers emit `tags` as nested objects and emit `[]` for old untagged questions.
- [ ] Raw tag primary keys are not exposed by `QuestionGetSerializer(fields='__all__')`.
- [ ] Existing search, ordering, pagination shape, and auth permissions are unchanged by tag response wiring.
- [ ] Final verification proves no migration drift and the `apps.qa` tests pass.

Negative Tests:
- Malformed inputs: not applicable beyond T02 validation; this task protects response shape regressions.
- Error paths: tagged and untagged question responses should not raise serializer errors when tag relations are empty.
- Boundary conditions: zero tags serializes as `[]`; one or more tags serialize as objects with stable keys.

Verification:
- `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py migrate --plan`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

Done when: The public question serializer/API contract includes nested tags for tagged questions, remains safe for untagged questions, and all planned backend checks pass.

## Inputs

- ``src/backend/apps/qa/serializers.py` — tag validation and question serializer contract output from T02.`
- ``src/backend/apps/qa/views.py` — existing QuestionViewSet list/retrieve/create serializer wiring.`
- ``src/backend/apps/qa/tests.py` — model and serializer tests from T01/T02.`
- ``src/backend/apps/qa/models.py` — `Tag` and `Question.tags` relation output from T01.`

## Expected Output

- ``src/backend/apps/qa/serializers.py` — adds `TagSerializer` and nested read-only `tags` fields to question read/list/create response serializers using `{name, questions_count}` objects.`
- ``src/backend/apps/qa/views.py` — prefetches `tags` for question list/retrieve/create response paths where appropriate without changing auth, search, ordering, or pagination behavior.`
- ``src/backend/apps/qa/tests.py` — adds API/serializer regression tests proving untagged responses emit `tags: []`, tagged responses emit nested tag objects, and existing search/ordering still pass.`
- ``src/backend/apps/qa/migrations/0003_tag_question_tags.py` — remains in sync with the final model state after all serializer/view work.`

## Verification

`src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` then `src/backend/venv/Scripts/python.exe src/backend/manage.py migrate --plan` then `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

## Observability Impact

Inspection surfaces stabilized: API responses expose public tag objects with `name` and `questions_count`; failing compatibility appears in concrete regression tests for untagged and tagged question responses.
