---
estimated_steps: 31
estimated_files: 3
skills_used: []
---

# T02: Persist create-request tags and update counters atomically

Implement the real backend create-flow wiring so validated tags are created/reused, attached to the question, counted, and returned by `POST /question/`.

Skills expected in task plan frontmatter: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Add a focused service module such as `src/backend/apps/qa/services/question_tag_service.py` that takes a saved `Question` plus normalized tag names, performs `Tag.objects.get_or_create(name=...)`, attaches the unique tags to `question.tags`, and increments `questions_count` exactly once per associated tag.
2. Update `QuestionUpdateCreateSerializer.create()` in `src/backend/apps/qa/serializers.py` to pop the already-normalized `tags`, create the question and persist tag side effects inside `transaction.atomic()`, then return a question instance whose tags can be serialized by `QuestionCreateResponseSerializer`.
3. Preserve update behavior as out of scope unless needed for compatibility: `update()` should continue to ignore submitted tags because edit semantics/counter decrement are not part of S02.
4. Use `F('questions_count') + 1` or another race-safe ORM update for existing and newly-created tags, and refresh or re-query as needed so the create response includes current counter values.
5. Keep the public API additive: request remains `POST /question/` with optional `tags: string[]`, response remains 201 with question fields plus nested `tags`, and existing untagged creates still return `tags: []`.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| MySQL/Django ORM transaction | Raise the DB error and roll back question, tag, join, and counter writes | Treat as request failure; no retry loop in serializer | N/A, ORM objects are local not remote responses |
| Unique tag constraint | Reuse existing tag or recover by fetching it after `get_or_create`; never create duplicates | N/A | N/A |
| DRF serializer validation | Return 400 before persistence | N/A | Serializer errors remain under `tags` |

Load Profile (Q6):
- **Shared resources**: `tags` unique index, question/tag M2M table, and `questions_count` column.
- **Per-operation cost**: Bounded by maximum five unique normalized tags; expect up to five get/create operations, one M2M set/add, and bounded counter updates.
- **10x breakpoint**: Hot popular tags may contend on counter updates; use atomic DB increments rather than read-modify-write Python counters.

Negative Tests (Q7):
- **Malformed inputs**: Existing serializer tests must continue rejecting non-list, non-string, empty, malformed, and >5 unique tag payloads.
- **Error paths**: Invalid create payload must not leave a question, tag, join row, or counter increment behind.
- **Boundary conditions**: Omitted tags, duplicate normalized names, all-new tags, mixed existing/new tags, and exactly five unique tags.

Must-haves:
- D001 is honored: missing tags are created during question submit after backend normalization/validation.
- D002 is honored: stored `questions_count` is updated during question creation and duplicate submitted tags do not double-count.
- The create response returns nested public tag objects with current counts, not raw IDs.
- No migration is introduced for this behavior-only slice.

Observability Impact:
- Signals added/changed: Atomic transaction boundaries make partial DB state observable as all-or-nothing in tests; no new logs are added.
- How a future agent inspects this: Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`, inspect `src/backend/apps/qa/services/question_tag_service.py`, and query `Tag.questions_count` plus `question.tags` in a Django shell if needed.
- Failure state exposed: Counter drift, missing associations, duplicate tag rows, and invalid-payload partial writes are all covered by tests.

## Inputs

- `src/backend/apps/qa/tests.py`
- `src/backend/apps/qa/models.py`
- `src/backend/apps/qa/serializers.py`
- `src/backend/apps/qa/views.py`

## Expected Output

- `src/backend/apps/qa/serializers.py`
- `src/backend/apps/qa/services/question_tag_service.py`
- `src/backend/apps/qa/tests.py`

## Verification

Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` and `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`; both must exit 0.

## Observability Impact

Uses atomic persistence and tests as the diagnostic surface for rollback, association, and counter-drift failures; no runtime logging or metrics are added.
