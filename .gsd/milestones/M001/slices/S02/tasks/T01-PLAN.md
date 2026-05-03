---
estimated_steps: 29
estimated_files: 1
skills_used: []
---

# T01: Add backend tests for tagged question creation

Add failing, focused Django API tests that define S02's create-with-tags behavior before implementation.

Skills expected in task plan frontmatter: `tdd`, `api-design`, `verify-before-complete`.

Steps:
1. In `src/backend/apps/qa/tests.py`, replace or update the S01-specific create-response test that expected `tags: []` after submitting tags; S02 must now expect persisted nested tags.
2. Add an authenticated API test for `POST /question/` with mixed-case/whitespace tags that asserts response tags are normalized nested objects, `Tag` rows exist, the question M2M relation is set, and each `questions_count` is `1`.
3. Add tests for mixed existing/new tags and duplicate submitted names to prove existing tags are reused and counters increment once per unique normalized association.
4. Add negative/compatibility tests proving invalid tag payloads return 400 without creating questions/tags and omitted `tags` still creates an untagged question.
5. Keep assertions tied to public API and ORM state; do not rely on `.gsd/`, ignored fixtures, or test-only files outside the tracked backend test module.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Django test database/ORM | Test fails with traceback; do not mask setup errors | Test runner timeout is a verifier failure | Assert response status and payload shape before inspecting nested fields |
| DRF authenticated client | A 401/403 response fails the create-flow assertion | N/A for in-process tests | Assert 201/400 explicitly before checking response data |

Load Profile (Q6):
- **Shared resources**: Django test DB tables `questions`, `tags`, and the M2M join table.
- **Per-operation cost**: One API request and bounded ORM reads for at most five tags per test case.
- **10x breakpoint**: Test runtime grows linearly with API cases; no production load path is changed by this task.

Negative Tests (Q7):
- **Malformed inputs**: non-list tags, non-string values, invalid characters, more than five unique tags as already covered by S01; this task adds create-API persistence assertions for invalid tag rejection.
- **Error paths**: unauthenticated create remains rejected by existing permissions if covered elsewhere; this task focuses on authenticated invalid payload rollback.
- **Boundary conditions**: omitted `tags`, duplicate tags after normalization, and exactly unique association/counter behavior.

Must-haves:
- The tests directly cover R003's backend API create path and R004's counter update behavior.
- Tests assert both response contract and persisted DB state, not just serializer validity.
- Tests remain runnable through the project verifier: `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`.

Observability Impact:
- Signals added/changed: Test diagnostics make partial persistence and counter drift visible through assertion failures.
- How a future agent inspects this: Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` and inspect failing assertions in `src/backend/apps/qa/tests.py`.
- Failure state exposed: API status, response `tags`, `Tag.questions_count`, `Tag.objects.count()`, and `question.tags` relation are asserted explicitly.

## Inputs

- `src/backend/apps/qa/tests.py`
- `src/backend/apps/qa/models.py`
- `src/backend/apps/qa/serializers.py`
- `src/backend/apps/qa/views.py`

## Expected Output

- `src/backend/apps/qa/tests.py`

## Verification

Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`. Before T02 implementation, the new S02 tests are expected to fail on the missing persistence behavior; after T02 they must pass.

## Observability Impact

Adds executable diagnostics in `src/backend/apps/qa/tests.py` for response shape, persisted tag rows, M2M associations, rollback on invalid create payloads, and stored counter drift.
