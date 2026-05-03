# S02: Question creation with tags and counters

**Goal:** An authenticated backend API caller can create a question with 1–5 normalized tags; missing tags are created, existing tags are reused, question/tag associations are persisted, and stored Tag.questions_count values update once per associated question.
**Demo:** An authenticated API caller can create a question with tags; missing tags are created and counters update.

## Must-Haves

- ## Must-Haves
- `POST /question/` accepts the existing write contract `tags: string[]` for authenticated users and still accepts omitted tags for backward compatibility.
- Submitted tag names are normalized and deduplicated using the S01 serializer contract before persistence; malformed payloads fail validation without creating questions or tags.
- Missing tags are created during question submit and existing tags are reused rather than duplicated, honoring D001.
- The new question is associated with each unique normalized tag and the create response returns nested `{name, questions_count}` tag objects.
- `Tag.questions_count` increments exactly once per created question/tag association and duplicate submitted names do not double-count, honoring D002.
- Untagged question creation and existing search/ordering/list behavior remain compatible.
- ## Threat Surface
- **Abuse**: Authenticated users can submit tag payloads intended to create excessive or malformed DB rows; existing serializer validation must remain the gate for max 5, strict string values, normalized unique names, and latin/digit/hyphen-only names. Repeated retries may create multiple questions by design because `POST /question/` is not idempotent.
- **Data exposure**: Create responses expose only public question fields and nested tag `name` plus `questions_count`; no tokens, secrets, or private user profile fields should be added.
- **Input trust**: User-provided `question_title`, `question_body`, and `tags` enter DRF validation and then DB writes; tag creation/counter updates must be wrapped in an atomic transaction so partial writes are not left behind on failure.
- ## Requirement Impact
- **Requirements touched**: R001, R002, R003, R004, R011.
- **Re-verify**: Tag serializer validation/normalization, authenticated question create API, create response tag shape, counter updates, untagged create compatibility, and existing list search/ordering pagination behavior.
- **Decisions revisited**: D001 and D002 are honored, not changed; D003-D005 remain downstream and are not re-litigated.
- ## Verification
- Add focused API/service regression tests in `src/backend/apps/qa/tests.py` covering authenticated create with new tags, mixed existing/new tags, duplicate collapse with single counter increments, omitted tags compatibility, invalid tag rejection with no persistence, and nested create response tag objects.
- Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` and require all apps.qa tests to pass.
- Run `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` and require no migration drift, because this slice should not change the schema.
- ## Observability / Diagnostics
- Runtime signals: No new runtime logging is planned; the source of truth is persisted DB state (`questions`, `tags`, and the question/tag join table) plus DRF validation errors.
- Inspection surfaces: Future agents can inspect behavior through `src/backend/apps/qa/tests.py`, the Django test command, `Tag.questions_count`, and response payloads from `POST /question/`.
- Failure visibility: Validation failures remain DRF 400 serializer errors under `tags`; persistence failures should roll back the whole create transaction rather than exposing partial state.
- Redaction constraints: Do not log or expose auth tokens; response remains limited to public question/tag fields.
- ## Proof Level
- This slice proves: backend integration.
- Real runtime required: yes, via Django ORM/API tests against the configured test database.
- Human/UAT required: no.
- ## Integration Closure
- Upstream surfaces consumed: `Tag`, `Question.tags`, `TagSerializer`, and `normalize_question_tags`/`QuestionUpdateCreateSerializer` from S01 in `src/backend/apps/qa/models.py` and `src/backend/apps/qa/serializers.py`.
- New wiring introduced in this slice: the real `POST /question/` runtime path persists validated tags, creates missing tags, attaches the M2M relation, updates counters, and returns nested tag data.
- What remains before the milestone is truly usable end-to-end: autocomplete API (S03), repeated tag filtering and list/detail display contract hardening (S04), frontend tag input/create integration (S05), and final discovery regression proof (S06).

## Proof Level

- This slice proves: Backend integration proof: Django API/ORM tests exercise the real `POST /question/` create path, serializer validation, tag persistence, M2M attachment, and stored counter updates. It does not prove frontend authoring UI or autocomplete/filter runtime behavior, which remain downstream slices.

## Integration Closure

Consumes S01's `Tag` model, optional `Question.tags` relation, strict tag normalization/validation, and nested `TagSerializer` response shape. Introduces create-path wiring in `QuestionUpdateCreateSerializer` and/or a focused QA service so `POST /question/` persists tags and counters transactionally. Downstream slices still need autocomplete, filtering, frontend input, and final integrated UI regression.

## Verification

- No new runtime telemetry is added. Failure diagnosis relies on DRF `tags` validation errors, atomic transaction rollback semantics, and direct inspection of `tags.questions_count` plus the question/tag join relation through focused Django tests.

## Tasks

- [ ] **T01: Add backend tests for tagged question creation** `est:45m`
  Add failing, focused Django API tests that define S02's create-with-tags behavior before implementation.
  - Files: `src/backend/apps/qa/tests.py`
  - Verify: Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`. Before T02 implementation, the new S02 tests are expected to fail on the missing persistence behavior; after T02 they must pass.

- [ ] **T02: Persist create-request tags and update counters atomically** `est:1h`
  Implement the real backend create-flow wiring so validated tags are created/reused, attached to the question, counted, and returned by `POST /question/`.
  - Files: `src/backend/apps/qa/serializers.py`, `src/backend/apps/qa/services/question_tag_service.py`, `src/backend/apps/qa/tests.py`
  - Verify: Run `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa` and `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`; both must exit 0.

## Files Likely Touched

- src/backend/apps/qa/tests.py
- src/backend/apps/qa/serializers.py
- src/backend/apps/qa/services/question_tag_service.py
