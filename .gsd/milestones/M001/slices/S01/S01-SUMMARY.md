---
id: S01
parent: M001
milestone: M001
provides:
  - `Tag` model with unique normalized `name`, stored `questions_count`, and optional `Question.tags` relation.
  - DRF tag validation/normalization contract for optional `tags: string[]`.
  - Question response contract exposing tags as `{name, questions_count}` objects and `tags: []` for untagged questions.
requires:
  []
affects:
  - S02
  - S03
  - S04
  - S05
  - S06
key_files:
  - src/backend/apps/qa/models.py
  - src/backend/apps/qa/migrations/0003_tag_question_tags.py
  - src/backend/apps/qa/serializers.py
  - src/backend/apps/qa/views.py
  - src/backend/apps/qa/tests.py
key_decisions:
  - Kept S01 scoped to schema and serializer contract only; tag persistence side effects are deferred to S02.
  - Used a strict serializer field for tag names so malformed non-string inputs are rejected instead of coerced.
  - Exposed tags as nested public objects `{name, questions_count}` instead of raw M2M IDs.
patterns_established:
  - Additive tag migration preserves existing untagged questions by using an optional `Question.tags` relation with `blank=True`.
  - Write serializer validates the future `tags: string[]` contract while read serializers expose nested tag objects.
  - Question querysets should prefetch `tags` when list/detail responses include tag chips.
observability_surfaces:
  - No runtime observability surfaces were added; this contract slice is monitored through migration checks and Django test diagnostics.
drill_down_paths:
  - .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-03T22:24:25.158Z
blocker_discovered: false
---

# S01: Backend tag model and serializer contract

**Backend tag persistence and the DRF tag contract now exist: questions can have zero or more tags, tag inputs are normalized/validated, and question responses expose stable nested tag objects.**

## What Happened

S01 established the backend foundation for the tag system without taking on downstream creation-flow side effects. The data layer now has a `Tag` model with unique indexed `name`, stored `questions_count`, and an optional `Question.tags` many-to-many relation with `blank=True`, backed by additive migration `qa.0003_tag_question_tags`; this keeps existing question rows valid and allows old questions to remain untagged. The serializer layer now defines the write-side tag contract for question creation/update: optional `tags: string[]`, strict string item validation, trim/lowercase normalization, latin letters/digits/hyphen-only names, empty-value rejection, duplicate collapse after normalization, and a maximum of five unique tags. The serializer deliberately removes validated tags during S01 create/update persistence so S02 can own get_or_create, M2M attachment, and counter updates. The response layer now exposes tags through a read-only `TagSerializer` shaped `{name, questions_count}` on question list, detail, and create response serializers, and question querysets prefetch tags for efficient list/retrieve rendering. Regression tests cover the schema contract, serializer contract, nested response shape, empty-tag compatibility, and existing question search/ordering behavior.

## Verification

Fresh slice-level verification was run after the failed auto gate using the project-specific Django commands rather than unavailable bare `pytest`. `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` exited 0 with no migration drift. `src/backend/venv/Scripts/python.exe src/backend/manage.py migrate --plan` exited 0 and confirmed the additive migration plan for `qa.0003_tag_question_tags`. `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` exited 0, ran 24 tests in 13.328s, and reported OK. This verifies R001, R002, and R010 for the S01 contract/data-model scope.

## Requirements Advanced

- R011 — Added backend automated tests covering tag model, serializer contract, nested response shape, and compatibility regressions as part of the broader tag-flow proof.

## Requirements Validated

- R001 — Additive migration and model tests verify Tag persistence, unique name, stored questions_count, and optional Question.tags relation.
- R002 — Serializer tests verify trim/lowercase normalization, latin/digit/hyphen validation, empty/malformed rejection, duplicate collapse, and five-tag limit.
- R010 — Regression tests verify untagged questions remain valid and serialize with `tags: []` while existing list/search/ordering behavior continues to pass.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

The automated gate attempted bare `pytest`, which is not installed or used as the verifier for this project. S01 was verified with the planned Django management commands from the slice plan. Earlier task execution also needed ignored local verification infrastructure and a disposable MySQL database in the isolated Windows worktree; no tracked runtime configuration was changed.

## Known Limitations

S01 intentionally does not persist submitted tag names during question create/update, does not attach tags to new questions, and does not update `questions_count`; S02 owns those behaviors. S01 also does not provide autocomplete, repeated-tag filtering, or any frontend tag UI, which remain assigned to S03-S06.

## Follow-ups

S02 should consume the validated `tags` contract and implement get_or_create, M2M attachment, duplicate-safe persistence, and counter updates. S03 should reuse the `Tag` model and `{name, questions_count}` response shape for autocomplete. S04 should rely on the nested tag response shape and prefetch pattern when adding repeated `tag` filtering.

## Files Created/Modified

- `src/backend/apps/qa/models.py` — Added Tag model and optional Question.tags many-to-many relation.
- `src/backend/apps/qa/migrations/0003_tag_question_tags.py` — Added migration creating tags table and question/tag join relation.
- `src/backend/apps/qa/serializers.py` — Added strict tag name validation, optional write-side tags contract, TagSerializer, and nested tag response fields.
- `src/backend/apps/qa/views.py` — Prefetched tags in question querysets for list/retrieve/create response efficiency.
- `src/backend/apps/qa/tests.py` — Added model, serializer, API response, and compatibility regression tests for the S01 tag contract.
