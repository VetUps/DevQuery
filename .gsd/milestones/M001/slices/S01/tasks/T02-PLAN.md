---
estimated_steps: 28
estimated_files: 2
skills_used: []
---

# T02: Define serializer tag normalization and validation contract

Why: This task establishes R002 as a reusable serializer contract before S02 wires persistence and counters.

Skills expected: `api-design`, `tdd`, `verify-before-complete`.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| DRF serializer validation | Keep errors under the `tags` field and avoid global `non_field_errors` unless the entire payload type is wrong. | Not applicable. | Reject malformed `tags` values with serializer errors rather than silently coercing unsafe values. |

Load Profile:
- Shared resources: pure serializer CPU work, no database writes in this task.
- Per-operation cost: O(n) over submitted tag strings, capped at a small max.
- 10x breakpoint: oversized lists should fail before downstream DB work in S02.

Steps:
1. In `src/backend/apps/qa/serializers.py`, import `Tag` from `.models` and define clear constants such as `MAX_QUESTION_TAGS = 5`, `TAG_NAME_PATTERN = re.compile(r'^[a-z0-9-]+$')`, and a helper like `normalize_question_tags(raw_tags)`.
2. Implement normalization rules exactly: require a list of strings when `tags` is provided; strip whitespace; lowercase; reject empty/whitespace-only values; reject values not matching latin letters/digits/hyphen; collapse duplicates after normalization while preserving first normalized order; enforce max 5 unique normalized tags.
3. Add `tags = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)` to `QuestionUpdateCreateSerializer`, include `tags` in `Meta.fields`, and add `validate_tags()` that returns the normalized unique list. Do not create `Tag` rows or attach them to questions in S01.
4. Add focused serializer tests in `src/backend/apps/qa/tests.py` for valid normalization (`[' Django ', 'django', 'DRF3', 'vue-js'] -> ['django', 'drf3', 'vue-js']`), omitted tags remaining valid, empty/whitespace rejection, invalid values like `python_api`, `c++`, `django rest`, and non-Latin text, and more than 5 unique normalized tags.
5. Run `apps.qa` tests and adjust only serializer contract behavior needed to pass the planned assertions.

Must-Haves:
- [ ] Provided tag lists are normalized to lowercase trimmed unique values in first-seen order.
- [ ] Empty strings, whitespace-only strings, invalid characters, non-list payloads, and more than 5 unique tags fail validation under `tags`.
- [ ] Omitting `tags` remains valid for compatibility; S02 may enforce create-time required 1-5 tags later.
- [ ] No S02 persistence work is pulled in: this task validates and returns normalized data but does not `get_or_create` tags or update counters.

Negative Tests:
- Malformed inputs: `tags='django'`, `tags=[123]`, `tags=['   ']`, `tags=['c++']`, `tags=['django rest']`, `tags=['джанго']`.
- Error paths: validation errors should be localized to `serializer.errors['tags']` where DRF permits.
- Boundary conditions: omitted tags valid; exactly 5 unique tags valid; 6 unique tags invalid; duplicates after normalization do not count toward the limit.

Verification:
- `src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

Done when: Serializer tests prove the normalization/validation contract and the write serializer accepts optional normalized `tags` without persisting them.

## Inputs

- ``src/backend/apps/qa/serializers.py` — existing question serializer classes and DRF validation style.`
- ``src/backend/apps/qa/tests.py` — existing APITestCase/unittest assertion style.`
- ``src/backend/apps/qa/models.py` — `Tag` and `Question.tags` output from T01.`

## Expected Output

- ``src/backend/apps/qa/serializers.py` — adds tag validation constants/helper and optional write-side `tags` validation on `QuestionUpdateCreateSerializer`.`
- ``src/backend/apps/qa/tests.py` — adds serializer tests for normalization, duplicate collapse, max-5 enforcement, empty values, invalid characters, and optional omitted tags.`

## Verification

`src/backend/venv/Scripts/python.exe src/backend/manage.py test apps.qa`

## Observability Impact

Failure visibility added: invalid tag payloads return DRF serializer errors under the `tags` field, making bad user input diagnosable at the API boundary.
