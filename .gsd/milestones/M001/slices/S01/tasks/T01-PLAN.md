---
estimated_steps: 29
estimated_files: 3
skills_used: []
---

# T01: Add Tag persistence and optional Question relationship

Why: This task retires the highest-risk data migration part of R001/R010 while keeping existing question rows valid.

Skills expected: `tdd`, `verify-before-complete`.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| Django migration framework | Stop and inspect migration dependencies/model state before editing further. | Not applicable for local schema generation; rerun once after confirming database settings. | Not applicable. |

Load Profile:
- Shared resources: database schema and future many-to-many join table.
- Per-operation cost: adding/removing tags later will use the join table; this task only defines schema.
- 10x breakpoint: future unprefetched tag reads could become N+1; prefetch optimization is planned in T03/S04.

Steps:
1. Add a `Tag` model near `Question` in `src/backend/apps/qa/models.py` with `name = models.CharField(max_length=50, unique=True, db_index=True)`, `questions_count = models.PositiveIntegerField(default=0)`, `db_table = 'tags'`, and `__str__` returning `name`.
2. Add `tags = models.ManyToManyField(Tag, related_name='questions', blank=True, help_text=...)` to `Question`; do not make tags mandatory and do not add create-flow counter logic in this task.
3. Generate or write `src/backend/apps/qa/migrations/0003_tag_question_tags.py` so it depends on the latest qa migration and only creates the tag table plus the question/tag M2M join table.
4. Add focused tests in `src/backend/apps/qa/tests.py`: creating a `Question` without tags still succeeds and has `question.tags.count() == 0`; duplicate `Tag.name` values raise a database integrity error.
5. Run migration drift and qa tests, fixing only model/migration/test issues from this task.

Must-Haves:
- [ ] `Tag` model exists with unique indexed normalized-name storage and stored `questions_count` defaulting to 0.
- [ ] `Question.tags` exists as an optional many-to-many relation; old question creation paths do not need to provide tags.
- [ ] Migration is additive and non-destructive for existing `questions` rows.
- [ ] Tests prove untagged question compatibility and tag name uniqueness.

Negative Tests:
- Malformed inputs: duplicate tag names at the model/database layer should fail with `IntegrityError`.
- Error paths: migration check must fail if the model and migration drift apart.
- Boundary conditions: a question with zero tags remains valid and serializable.

Verification:
- `src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run`
- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

Done when: The data model, migration, and focused model tests pass without making tags required for existing questions.

## Inputs

- ``src/backend/apps/qa/models.py` — existing Question model and db_table conventions.`
- ``src/backend/apps/qa/migrations/0001_initial.py` — existing migration style and app dependencies.`
- ``src/backend/apps/qa/migrations/0002_initial.py` — latest qa migration dependency.`
- ``src/backend/apps/qa/tests.py` — existing APITestCase style and question fixtures.`

## Expected Output

- ``src/backend/apps/qa/models.py` — defines `Tag` with unique indexed normalized `name`, stored `questions_count`, `db_table = 'tags'`, and `Question.tags = models.ManyToManyField(Tag, related_name='questions', blank=True)`.`
- ``src/backend/apps/qa/migrations/0003_tag_question_tags.py` — creates the `tags` table and the nullable/optional question-tag join table without adding non-null columns to `questions`.`
- ``src/backend/apps/qa/tests.py` — includes model tests proving untagged questions remain valid and tag uniqueness is enforced.`

## Verification

`src/backend/venv/Scripts/python.exe src/backend/manage.py makemigrations qa --check --dry-run` and `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

## Observability Impact

Inspection surfaces added: database schema objects `tags` and the `Question.tags` join table; migration drift is visible through Django's `makemigrations --check --dry-run` command.
