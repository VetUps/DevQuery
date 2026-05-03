---
estimated_steps: 5
estimated_files: 4
skills_used:
  - api-design
  - tdd
  - verify-before-complete
---

# T02: Harden autocomplete boundaries and schema documentation

**Slice:** S03 — Tag autocomplete API
**Milestone:** M001

## Description

Finish the autocomplete contract by pinning empty-query, no-result, result-limit, and OpenAPI documentation behavior.

Autocomplete accepts user-controlled query text and will later be called frequently from the frontend. Predictable empty/error behavior and a bounded result set prevent accidental tag dumps, unstable UI behavior, and needless backend load while preserving manual tag entry if suggestions are unavailable.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `search` query parameter | Missing/blank query should return HTTP 200 with `[]`, not a full-table dump or 400. | N/A for local API test client; keep query bounded. | Treat unusual text as search text; do not crash or create tags. |
| drf-spectacular schema metadata | Schema docs may omit the parameter, making frontend integration ambiguous; update `extend_schema` instead of relying on implicit behavior. | N/A. | Tests/review should catch mismatch between documented `TagSerializer` response and runtime output. |
| `tags` database table | Let standard DRF/Django diagnostics surface real DB failures. | Bounded query should avoid long scans in normal autocomplete usage. | Serializer/test assertions should reject extra/private fields. |

## Load Profile

- **Shared resources**: `tags` table and DB read connections.
- **Per-operation cost**: one bounded read query returning at most 10 serialized tag suggestions.
- **10x breakpoint**: frontend typeahead can multiply requests; first bottleneck is DB read concurrency, so missing/blank input must not list the whole table.

## Negative Tests

- **Malformed inputs**: whitespace-only `search`, weird no-match text, and mixed-case input.
- **Error paths**: missing `search` must be safe and non-error.
- **Boundary conditions**: no matches returns `[]`; 11+ matching tags returns only the first 10 in deterministic order.

## Steps

1. Extend `TagAutocompleteApiTests` in `src/backend/apps/qa/tests.py` for missing `search`, blank/whitespace `search`, no-result input, and more than the maximum suggestion count.
2. Update the tag viewset in `src/backend/apps/qa/views.py` so missing/blank search returns `[]` with HTTP 200 and does not list every stored tag.
3. Bound suggestions to 10 results for autocomplete and keep ordering as `-questions_count`, then `name`.
4. Add `extend_schema`/`OpenApiParameter` documentation for the `search` query parameter and `TagSerializer(many=True)` response, matching existing drf-spectacular style in QA views.
5. Run the focused tests, full QA tests, and migration drift check with the project-specific Django verifier rather than bare `pytest`.

## Must-Haves

- [ ] Empty and whitespace search return `[]` with HTTP 200.
- [ ] No-result searches return `[]` with HTTP 200.
- [ ] Autocomplete never returns more than 10 tag suggestions.
- [ ] OpenAPI metadata documents the `search` query parameter and tag response shape.
- [ ] Full `apps.qa` tests still pass; no migration changes are generated.

## Verification

- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa.tests.TagAutocompleteApiTests`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`

## Observability Impact

- Signals added/changed: schema documentation and tests make empty-query, no-result, and limit behavior inspectable.
- How a future agent inspects this: call `GET /tag/?search=...`, inspect generated OpenAPI schema, or run the focused/full Django test commands.
- Failure state exposed: test failures distinguish accidental full-table dumps, unbounded results, and undocumented query parameter regressions.

## Inputs

- `src/backend/apps/qa/views.py` — Tag viewset produced by T01 and existing schema annotation patterns.
- `src/backend/apps/qa/tests.py` — Tag autocomplete tests produced by T01.
- `src/backend/apps/qa/urls.py` — Registered `/tag/` route from T01.
- `src/backend/apps/qa/serializers.py` — `TagSerializer` response contract.

## Expected Output

- `src/backend/apps/qa/views.py` — Hardened empty-query/no-result/limit behavior plus OpenAPI documentation.
- `src/backend/apps/qa/tests.py` — Boundary, limit, and regression tests for autocomplete.
