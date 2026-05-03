---
estimated_steps: 17
estimated_files: 2
skills_used: []
---

# T02: Harden tag display and schema contract for question clients

Expected executor skills: `api-design`, `tdd`, `verify-before-complete`.

Lock down the client-facing response and documentation contract that lets frontend discovery render tag chips from list/detail responses and know how to call the repeated-tag filter.

Steps:
1. Add or strengthen API tests in `src/backend/apps/qa/tests.py` proving filtered list results include nested `tags` objects shaped `{name, questions_count}` and never raw tag IDs.
2. Add or strengthen detail/list tests proving untagged questions still emit `tags: []` and tagged detail responses include the same public tag-chip shape.
3. Update `QuestionViewSet.list` schema documentation in `src/backend/apps/qa/views.py` to include a public repeated `tag` query parameter alongside existing `search` and `ordering` parameters.
4. Add a schema test using `SchemaGenerator().get_schema(...)` that verifies `/question/` documents `tag`, `search`, `ordering`, and the paginated list response still references `QuestionList` data.
5. Run the full task verification commands, including the no-migration-drift check.

Must-haves:
- R007 is directly advanced by executable list/detail response tests.
- The repeated `tag` filter contract is discoverable in OpenAPI for frontend clients.
- Existing nested `TagSerializer` shape is preserved; do not expose tag IDs or unrelated question body data in list cards.
- Untagged legacy questions remain valid and serializable.

Threat/quality focus:
- Failure Modes (Q5): the dependency is DRF serializer output plus drf-spectacular schema generation; schema drift should fail a test, raw tag IDs must not leak in public responses, and untagged questions must continue to emit `tags: []` instead of omitting the field.
- Load Profile (Q6): shared resources are serializer query access and generated schema; per question should use the existing prefetched tags rather than per-row tag lookups, and at 10x list size the main risk is accidental N+1 or missing prefetch regression.
- Negative Tests (Q7): cover filtered list items including nested `{name, questions_count}`, detail response tag chips, untagged list/detail compatibility, and OpenAPI documentation for the `tag` query parameter alongside existing `search` and `ordering` parameters.

## Inputs

- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/serializers.py`
- `src/backend/apps/qa/tests.py`

## Expected Output

- `src/backend/apps/qa/views.py`
- `src/backend/apps/qa/tests.py`

## Verification

`src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` and `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`

## Observability Impact

This task improves API introspection rather than adding logs. Future agents can inspect generated schema via `SchemaGenerator().get_schema(...)` in tests and public response payloads from `/question/` and `/question/{question_id}/`.
