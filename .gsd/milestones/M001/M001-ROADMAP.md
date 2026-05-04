# M001: Полная система тегов

**Vision:** Добавить полную, практичную систему тегов для вопросов: backend Tag model, validation/normalization, autocomplete, tag filtering, visible tag chips, and frontend tag input integrated into the existing Q&A flow.

## Success Criteria

- User can create a question with 1–5 valid normalized tags.
- Tags are visible on question cards and question detail pages.
- Users can autocomplete existing tags but manual tag entry still works if autocomplete fails.
- Question list filtering by repeated tag params uses AND semantics.
- Existing questions without tags remain valid and render correctly.
- Existing search, ordering and pagination continue working with tag filters.

## Slices

- [x] **S01: S01** `risk:high` `depends:[]`
  > After this: Backend has tag persistence and validation contract; old questions without tags still work in tests.

- [x] **S02: S02** `risk:high` `depends:[]`
  > After this: An authenticated API caller can create a question with tags; missing tags are created and counters update.

- [x] **S03: S03** `risk:medium` `depends:[]`
  > After this: API clients can search existing tags by partial input and see normalized names with question counts.

- [x] **S04: S04** `risk:high` `depends:[]`
  > After this: Question list can be filtered with `/question/?tag=django&tag=serializer`; list/detail responses include tag chips data.

- [x] **S05: S05** `risk:medium` `depends:[]`
  > After this: The ask-question form has a tag input with suggestions, chips, removal, max 5 and manual fallback if suggestions fail.

- [x] **S06: S06** `risk:medium` `depends:[]`
  > After this: Users see tags in discovery/detail and filter the question list by multiple tags through URL state; regression tests prove the full flow.

## Boundary Map

## Boundary Map

### S01 → S02
Produces:
- `Tag` model with unique normalized `name` and stored `questions_count`.
- `Question.tags` relationship that allows existing questions to have zero tags.
- Serializer-level tag normalization/validation helper or contract: trim, lowercase, latin/digit/hyphen, max 5 unique, duplicate collapse.

Consumes:
- nothing (first slice)

### S01 → S03
Produces:
- `Tag` persistence model and response serializer shape for `name` + `questions_count`.

Consumes:
- nothing (first slice)

### S01 + S02 → S04
Produces:
- Question creation persists real tag associations and counters.
- Backend tag data is available from question objects for list/detail/create response serializers.

Consumes from S01:
- `Tag` model, `Question.tags`, serializer tag representation.

Consumes from S02:
- Created questions with real tag associations and counter updates.

### S02 + S03 → S05
Produces:
- Create-question API accepts `tags: string[]` and returns tags.
- Tag autocomplete API returns normalized suggestions with `questions_count`.

Consumes from S02:
- Create payload/response contract for tags.

Consumes from S03:
- Autocomplete query contract and response shape.

### S04 + S05 → S06
Produces:
- Question list/detail response includes tags.
- Repeated `tag` API filter contract with AND semantics.
- Frontend authoring UI can create questions with tag payloads.

Consumes from S04:
- Backend repeated `tag` filtering and display contracts.

Consumes from S05:
- Frontend tag input and create-question payload integration.
