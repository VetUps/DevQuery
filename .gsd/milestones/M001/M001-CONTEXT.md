# M001: Полная система тегов

**Gathered:** 2026-05-03
**Status:** Ready for planning

## Project Description

StackOverflow 2.0 уже имеет рабочий Django REST backend и Vue/Vite frontend для core Q&A loop. Этот milestone добавляет полноценную систему тегов для вопросов: `Tag` model, связь с вопросами, backend-нормализацию и валидацию, autocomplete endpoint, фильтрацию списка вопросов по тегам, отображение тегов на карточках/detail и интерактивный frontend-ввод тегов при создании вопроса.

## Why This Milestone

Существующий discovery уже поддерживает поиск по заголовку и сортировку по дате, но у вопросов нет тематической структуры. Теги добавляют понятный способ классифицировать вопросы, сужать ленту и давать пользователю контекст до открытия вопроса.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Создать вопрос с 1–5 валидными тегами вроде `django`, `vue-js`, `drf3`.
- Видеть теги на карточке вопроса и странице вопроса.
- Искать подсказки тегов при вводе, но продолжать ручной ввод даже если autocomplete временно недоступен.
- Фильтровать список вопросов по одному или нескольким тегам через URL/query state.

### Entry point / environment

- Entry point: web frontend routes `/`, `/questions/ask`, `/questions/:questionId`; backend API under `/question/` and new tag endpoint.
- Environment: local dev / browser / Django REST API.
- Live dependencies involved: MySQL database, Django REST backend, Vue frontend.

## Completion Class

- Contract complete means: model/serializer/API contracts exist, migrations apply, tests prove normalization, validation, association, counters, autocomplete and filtering.
- Integration complete means: frontend create form sends `tags: string[]`, backend returns tags in list/detail/create responses, discovery URL state sends repeated `tag` params and renders backend-backed results.
- Operational complete means: existing questions without tags remain valid after migration and existing search/ordering/pagination flows still work with tag filtering.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A question can be created with valid tags; missing tags are created, duplicates collapse, `questions_count` updates, and the created question returns/render tags.
- `/question/?tag=django&tag=serializer` returns only questions containing all selected tags and composes with existing search/ordering/pagination behavior.
- Autocomplete failure does not block manual tag entry in the frontend form.
- Existing questions without tags still render in list/detail without chip placeholders or errors.

## Scope

### In Scope

- Backend model `Tag` with unique normalized `name` and stored `questions_count`.
- Question-to-tag relationship.
- DRF serializer validation and normalization: `trim`, `lowercase`, allowed format latin letters/digits/hyphen, max 5 unique tags, no empty values.
- Duplicate tags after normalization are silently collapsed into one tag.
- Users may create a new tag while creating a question if autocomplete does not find it.
- REST endpoint for tag autocomplete/search while typing.
- Question list filtering by selected tags.
- Multi-tag filtering semantics: AND — question must contain all selected tags.
- Frontend tag input with autocomplete/search, chips, removal, and hard 5-tag limit.
- Tags visible on question cards.
- Tags visible on question detail page.
- Tags integrated into question creation flow.
- Tags integrated into discovery/list filtering flow.
- Existing questions without tags remain valid and render correctly without chips.

### Out of Scope / Non-Goals

- Tag synonyms.
- Tag moderation.
- Complex caching.
- Editing tags on already-created questions in this milestone.
- Mandatory manual UAT script for this milestone.
- Diagnostic/admin recalculation tool for tag counters.

### Deferred

- Edit UI for tags on existing questions.
- Tag governance: aliases/synonyms/merge/moderation.
- Counter repair/recalculation tooling if future update/delete paths make drift risk material.

## Architectural Decisions

### Tag creation policy

**Decision:** Users may create a new tag while creating a question if autocomplete does not find it.

**Rationale:** Without synonyms/moderation/admin tag creation in scope, requiring pre-existing tags would block legitimate new topics. Backend remains the source of truth by normalizing and validating tag names before `get_or_create()`.

**Evidence Source:** DRF serializer docs for writable related data require explicit `create()` handling; codebase currently uses `QuestionUpdateCreateSerializer` as the question write contract.

**Alternatives Considered:** Only existing tags selectable from autocomplete — rejected because moderation/admin creation is out of scope.

### Tag question counter

**Decision:** Store `questions_count` as a model field on `Tag`.

**Rationale:** This matches the requested model shape and gives autocomplete/list UI cheap access to counts. The milestone includes deterministic updates when questions are created with tags.

**Evidence Source:** User explicitly requested a tag model with counter; current product scale does not require complex caching or live aggregation.

**Alternatives Considered:** Compute count via queryset annotation — lower drift risk, but not the requested model field and less direct for autocomplete response contracts.

### Multi-tag filter URL contract

**Decision:** Use repeated `tag` query params, e.g. `/question/?tag=django&tag=serializer`.

**Rationale:** It maps cleanly to URL state and backend `request.query_params.getlist('tag')`, avoids comma parsing, and supports AND semantics explicitly.

**Evidence Source:** Existing `HomePage.vue` already stores `search`, `ordering`, and `page` in URL query state; repeated params extend that pattern.

**Alternatives Considered:** `tags=django,serializer` — more compact but requires manual parsing and edge-case handling.

### Frontend component boundary

**Decision:** Add a focused tag input/search component with typed `v-model`, chips, removal, limit state, autocomplete and fallback behavior.

**Rationale:** `QuestionCreateForm.vue` is currently simple; tag behavior is stateful enough to deserve a child component rather than turning the form into a mega-component.

**Evidence Source:** Existing frontend uses Vue 3 Composition API, `<script setup>`, typed model bindings and feature-local components.

**Alternatives Considered:** Fold tag input directly into `QuestionCreateForm.vue` — rejected to preserve component focus and testability.

## Error Handling Strategy

### Backend

- Serializer is the authoritative validation layer.
- Tag names are normalized with `trim` and `lowercase`.
- Allowed format is Latin letters, digits, and hyphen only, e.g. `vue-js`.
- Empty tag names after trimming are rejected.
- Duplicate names after normalization are silently collapsed into one tag.
- More than 5 unique normalized tags returns a `tags` field error.
- Question creation, missing-tag creation, question-tag relation writes, and `questions_count` updates must be atomic.
- Concurrent creation of the same tag must rely on the database unique constraint and safe `get_or_create`/retry behavior.

### Frontend

- Autocomplete is a helper, not a gate.
- If autocomplete fails, manual tag entry remains available.
- The UI should show a soft inline warning that suggestions are temporarily unavailable while manual entry still works.
- Frontend should pre-validate limit and format for responsiveness, but backend repeats all validation.
- No-result filtering is an empty state, not an error.

### User-facing messages

- Invalid format: explain that tags may contain Latin letters, digits, and hyphen, e.g. `vue-js`.
- Limit error: explain that no more than 5 tags can be added.
- Autocomplete failure must not become a global question-submit failure.

## Risks and Unknowns

- Stored `questions_count` can drift if future edit/delete paths mutate tags without counter logic — current milestone limits proof to create-flow because tag editing is out of scope.
- Existing manual `QuestionViewSet.get_queryset()` search/ordering logic must compose cleanly with repeated tag filtering and pagination.
- Frontend repeated `tag` query params need careful handling because existing query builder mostly assumes scalar params.

## Existing Codebase / Prior Art

- `src/backend/apps/qa/models.py` — currently contains `Question`, `Solution`, `SolutionEdits`, `Comment`, `Vote`; no `Tag` model yet.
- `src/backend/apps/qa/serializers.py` — `QuestionUpdateCreateSerializer` currently accepts only `question_title` and `question_body`; tags must become part of the write payload.
- `src/backend/apps/qa/views.py` — `QuestionViewSet.get_queryset()` already handles `search` and `ordering`; tag filtering should extend this path or consolidate it without parallel discovery logic.
- `src/backend/apps/qa/urls.py` — DRF router can register a new `TagViewSet` or equivalent tag autocomplete endpoint.
- `src/frontend/src/pages/HomePage.vue` — already maps `search`, `ordering`, `page` into URL query state.
- `src/frontend/src/features/questions/components/DiscoverySearchReserve.vue` — existing discovery controls surface, likely extension point for tag filters.
- `src/frontend/src/features/questions/components/QuestionCreateForm.vue` — current ask-question form; should compose a focused tag input child component.
- `src/frontend/src/features/questions/components/QuestionCard.vue` — current card has status/date/title; needs tag chips.
- `src/frontend/src/features/questions/components/QuestionDetailHero.vue` — current detail hero has status/date/body/author/votes; needs tag chips.

## Relevant Requirements

- R001 — model and question relationship foundation.
- R002 — backend normalization and validation.
- R003 — create question with tags.
- R004 — stored tag question counter.
- R005 — tag autocomplete/search.
- R006 — repeated-tag question filtering with AND semantics.
- R007 — tag display on cards and detail.
- R008 — frontend tag input.
- R009 — discovery URL/query state for repeated tags.
- R010 — compatibility with old questions without tags.
- R011 — automated verification.
- R012 — autocomplete failure fallback.

## Technical Constraints

- Backend remains Django REST Framework + MySQL.
- Frontend remains Vue 3 + Vite + TypeScript with Composition API and feature-local components.
- Backend must enforce all tag validation; frontend validation is only responsiveness.
- Tag names are lowercase Latin letters, digits, and hyphen only.
- Maximum 5 unique normalized tags per question.
- Repeated query contract is `tag=...&tag=...`, not comma-separated `tags=`.

## Integration Points

- `Question` model ↔ `Tag` model via many-to-many relationship.
- `QuestionUpdateCreateSerializer` ↔ tag normalization/creation/association logic.
- `QuestionViewSet.list` ↔ repeated tag filtering with search/ordering/pagination.
- New tag autocomplete endpoint ↔ frontend tag input query/mutation behavior.
- `HomePage.vue` URL state ↔ `fetchQuestionList` params.
- `QuestionCreateForm.vue` ↔ `TagInput` component ↔ `createQuestion` payload.
- `QuestionCard.vue` and `QuestionDetailHero.vue` ↔ tags in API response.

## Testing Requirements

Backend tests must cover serializer normalization, duplicate collapse, invalid format, max-5 validation, tag creation, question-tag association, and `questions_count` update on question creation. API tests must cover tag autocomplete/search and question list filtering by one or more repeated `tag` params with AND semantics. Compatibility must be tested: existing questions without tags remain valid and render correctly.

Frontend tests must cover tag input behavior, chip removal, limit handling, autocomplete failure fallback to manual entry, create-question payload tags, question card/detail tag rendering, and discovery URL/query integration for repeated tags. Existing frontend typecheck/build/test commands must pass.

## Acceptance Criteria

### S01 — Backend tag model and serializer contract

- `Tag` model exists with unique normalized `name` and `questions_count`.
- `Question` can relate to zero or more tags.
- Migrations preserve old questions without tags.
- Serializer validation normalizes, validates allowed format, collapses duplicates and enforces max 5 unique tags.

### S02 — Question creation with tags and counters

- Authenticated API create question accepts `tags: string[]`.
- Missing tags are created safely.
- Question-tag associations are saved atomically.
- `questions_count` increments for associated tags.

### S03 — Tag autocomplete API

- Endpoint searches tags by partial input using practical case-insensitive matching.
- Response exposes normalized `name` and `questions_count`.
- Empty/no-result behavior is predictable and not an error.

### S04 — Question filtering and display contract

- List/detail/create response contracts include tags.
- Cards and detail can render questions with and without tags.
- Repeated `tag` params filter with AND semantics and compose with existing search/ordering/pagination.

### S05 — Frontend tag input and authoring integration

- Tag input supports autocomplete, manual entry, chips, removal, max 5 and format feedback.
- Autocomplete failure shows soft warning and does not block manual entry.
- Create question payload includes normalized-ish tag names while backend remains authoritative.

### S06 — Discovery filters and integrated regression proof

- Discovery UI exposes tag filtering and writes repeated `tag` params into URL state.
- Existing search/ordering/pagination continue to work with tag filters.
- Automated tests prove full create/display/filter flow across backend and frontend contracts.

## Open Questions

- None blocking planning.
