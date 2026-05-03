# S01 — Backend tag model and serializer contract — Research

**Date:** 2026-05-03

## Summary

S01 owns R001, R002, and R010: introduce the backend tag domain foundation, define serializer-level normalization/validation, and preserve compatibility for existing questions without tags. The current backend has no tag model or tag serializer contract: `src/backend/apps/qa/models.py` only defines `Question`, `Solution`, `SolutionEdits`, `Comment`, and `Vote`; `Question` currently has no many-to-many relationships; question serializers in `src/backend/apps/qa/serializers.py` expose only question fields and currently create/update from `question_title` + `question_body`.

The safest implementation is a thin model + contract slice: add `Tag` with unique normalized `name` and `questions_count`, add `Question.tags = ManyToManyField(Tag, related_name='questions', blank=True)`, create a migration that only creates the new table/join table (so old questions remain valid with an empty relation), and add serializer helpers/fields that normalize and validate tag names without yet taking responsibility for create-time `get_or_create` and counter updates. That keeps S01 focused and gives S02 a clear seam for persistence/atomic counter behavior.

The API-design skill reinforces that contracts should be explicit and additive. For this slice, the additive response shape should be a stable nested tag representation, e.g. `tags: [{"name": "django", "questions_count": 3}]`, not raw many-to-many IDs from `fields='__all__'`. Validation errors should stay in DRF's existing serializer error style under the `tags` field to match the current codebase.

## Recommendation

Implement `Tag` as a first-class `qa` model and expose a small serializer contract in `src/backend/apps/qa/serializers.py`:

- `Tag`: `name = CharField(max_length=50, unique=True, db_index=True)`, `questions_count = PositiveIntegerField(default=0)`, `db_table = 'tags'`, `__str__` returns `name`.
- `Question.tags`: `ManyToManyField(Tag, related_name='questions', blank=True)`. `blank=True` is important for R010 and for current tests/fixtures that create questions without tags.
- `TagSerializer`: read-only response shape with `name` and `questions_count`.
- Shared validation helper, preferably near the question serializers or in a small service if the executor wants a cleaner seam, with constants for max count and regex: trim strings, lowercase, reject empty values, require `^[a-z0-9-]+$`, silently collapse duplicates while preserving first normalized order, enforce max 5 unique normalized tags.
- `QuestionUpdateCreateSerializer` should accept/validate `tags` when provided, but S01 should not yet implement tag creation/counters unless the planner intentionally pulls S02 work forward. If added to the serializer now, use `required=False` so existing create tests and compatibility remain intact until the create-flow slice decides whether new questions must require at least one tag.
- Override `tags = TagSerializer(many=True, read_only=True)` on read/response serializers that may otherwise emit M2M primary keys, especially `QuestionGetSerializer`, because it currently uses `fields='__all__'`.

## Implementation Landscape

### Key Files

- `src/backend/apps/qa/models.py` — Add `Tag` before or near `Question`, then add `Question.tags` with `blank=True`. Current `Question` starts at line 9 and has only scalar fields plus `user`; adding a M2M field is non-destructive for existing rows.
- `src/backend/apps/qa/migrations/0003_tag_question_tags.py` (new) — Create `Tag` and add the many-to-many field. Existing migrations stop at `0002_initial.py`; there are no later `qa` migrations in this worktree.
- `src/backend/apps/qa/serializers.py` — Current question serializers are at lines 10–41. Add `TagSerializer`, tag validation constants/helper, `tags` output fields, and a `validate_tags()` path on `QuestionUpdateCreateSerializer` if the write contract accepts tags in S01.
- `src/backend/apps/qa/views.py` — `QuestionViewSet` begins at line 24. S01 probably only needs optional `prefetch_related('tags')` in `get_queryset()` if response serializers include nested tags now; S04 can optimize further when filtering/display is fully introduced.
- `src/backend/apps/qa/tests.py` — Existing backend tests use Django `APITestCase`, not pytest. Add focused tests for the model/relationship and serializer contract alongside `QuestionDiscoveryTests`.
- `src/backend/apps/qa/urls.py` — No S01 change expected. Tag autocomplete registration belongs to S03.
- `src/backend/apps/qa/admin.py` — Optional low-risk registration of `Tag`; not required for the slice acceptance.

### Natural Seams

- **Model/migration seam:** `Tag` and `Question.tags` can be implemented and tested independently from create-flow persistence.
- **Serializer validation seam:** a pure normalization/validation function can be tested directly through `QuestionUpdateCreateSerializer` without needing DB tag creation.
- **Read contract seam:** nested `TagSerializer` can be added to question read/create response serializers and verified against both tagged and untagged question instances. This can be done without building list filtering or autocomplete.

### Build Order

1. Add the `Tag` model and `Question.tags` relation first. This retires the migration/compatibility risk for R001/R010 and unblocks every downstream slice.
2. Generate/write the migration and inspect that it only creates the `tags` table plus the M2M join table; it should not add non-null columns to `questions`.
3. Add `TagSerializer` and the tag normalization/validation helper. Prove with serializer tests before wiring more API behavior.
4. Add read serializer `tags` fields to avoid raw M2M IDs and to produce the downstream `name` + `questions_count` contract.
5. Add/adjust query prefetch only if tests or serializer output indicate N+1-sensitive list/detail behavior; deeper filtering optimization belongs to S04.

### Verification Approach

Run backend verification from the repo worktree with the backend environment configured:

- `python src/backend/manage.py makemigrations qa --check --dry-run` — after committing/writing the migration, should report no model changes pending.
- `python src/backend/manage.py migrate --plan` — should show the new tag migration without destructive operations.
- `python src/backend/manage.py test apps.qa` — should pass existing discovery/best-solution tests plus new tag model/serializer tests.

Targeted tests to add in S01:

- Creating a `Question` without tags remains valid and `question.tags.count() == 0`.
- `Tag.name` uniqueness is enforced by the model/database.
- Serializer normalizes `[' Django ', 'django', 'DRF3', 'vue-js']` to `['django', 'drf3', 'vue-js']` and collapses duplicates.
- Serializer rejects empty strings/whitespace-only values under `tags`.
- Serializer rejects invalid characters such as `python_api`, `c++`, `django rest`, or non-Latin text.
- Serializer rejects more than 5 unique normalized tags.
- Question read/create response serializers emit `tags` as `[]` for old/untagged questions and as objects with `name` + `questions_count` for tagged questions.

## Constraints

- The backend is Django REST Framework with MySQL; migrations must be normal Django migrations and compatible with the existing `apps.qa` app label.
- `REST_FRAMEWORK` globally defaults to authenticated access, but `QuestionViewSet` already opens list/retrieve with `AllowAny`; S01 should not change auth behavior.
- The project uses Django unittest/APITestCase style in `src/backend/apps/qa/tests.py`; no pytest setup is present.
- `QuestionViewSet.pagination_class` is `PageNumberPagination`, while global settings use limit-offset. S01 should not touch pagination; S04 will need to preserve existing list behavior when filtering by tags.
- Existing codebase validation messages are often Russian. New serializer errors should be user-readable and may follow that language convention.

## Common Pitfalls

- **Accidentally making tags mandatory at the database/model layer** — use `ManyToManyField(..., blank=True)` so existing questions and current tests remain valid.
- **Returning raw tag primary keys from `QuestionGetSerializer(fields='__all__')`** — explicitly declare nested `tags = TagSerializer(many=True, read_only=True)` for the downstream frontend/API contract.
- **Letting duplicate tags count toward the limit before normalization** — normalize and de-duplicate first, then enforce the maximum of 5 unique tags.
- **Overbuilding S02 in S01** — S01 should define the validation and representation contract; `get_or_create`, atomic association, and `questions_count` increments are the next slice unless intentionally pulled forward.
- **Counter drift assumptions** — S01 can add the field with default 0, but only S02 should prove deterministic increments for create-flow; edits/deletes are out of scope for M001.

## Open Risks

- The final milestone says users create questions with 1–5 tags, while the S01 acceptance only requires max-5 validation and existing zero-tag questions must remain valid. The planner should decide whether S01's serializer merely validates provided tags (`required=False`) or also enforces a non-empty `tags` payload for create; the safer slice boundary is optional in S01 and stricter create behavior in S02.
- The local harness shell lacks `/bin/bash`, so command execution may need Windows/Python invocation in this environment even though the project verification commands are standard Django commands.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| HTTP/DRF API contract | `api-design` | Installed and used; relevant rules: explicit request/response/error contract, additive evolution, honest HTTP semantics. |
| Django / Django REST Framework | Dedicated Django/DRF skill | None installed in the available skill list; codebase patterns are straightforward enough to follow existing serializers/viewsets. |

## Sources

- Existing codebase inspection: `src/backend/apps/qa/models.py`, `src/backend/apps/qa/serializers.py`, `src/backend/apps/qa/views.py`, `src/backend/apps/qa/tests.py`, `src/backend/apps/qa/migrations/0001_initial.py`, `src/backend/apps/qa/migrations/0002_initial.py`.
- Durable project memories: tag creation policy, stored counter decision, repeated tag filter contract, frontend tag input boundary, and autocomplete failure policy.
