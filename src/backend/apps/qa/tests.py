from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework import status
from rest_framework.test import APITestCase

from apps.qa.models import Question, Solution, Tag
from apps.qa.serializers import (
    MAX_QUESTION_TAGS,
    QuestionCreateResponseSerializer,
    QuestionGetSerializer,
    QuestionListSerializer,
    QuestionUpdateCreateSerializer,
    TagSerializer,
)
from apps.user.models import CustomUser


class QuestionTagModelTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='tag-author@example.com',
            user_name='tag-author',
            password='password',
        )

    def test_question_can_be_created_without_tags(self):
        question = Question.objects.create(
            user=self.user,
            question_title='Question without tags',
            question_body='Existing create flows should not require tags.',
        )

        self.assertEqual(question.tags.count(), 0)

    def test_duplicate_tag_name_raises_integrity_error(self):
        Tag.objects.create(name='django')

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Tag.objects.create(name='django')


class QuestionTagSerializerTests(APITestCase):
    def valid_payload(self, tags_marker=None):
        payload = {
            'question_title': 'How to validate tags?',
            'question_body': 'I need a normalized tag contract.',
        }
        if tags_marker is not None:
            payload['tags'] = tags_marker
        return payload

    def assert_tags_error(self, tags):
        serializer = QuestionUpdateCreateSerializer(data=self.valid_payload(tags))

        self.assertFalse(serializer.is_valid())
        self.assertIn('tags', serializer.errors)

    def test_tags_are_normalized_and_deduplicated_in_first_seen_order(self):
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload([' Django ', 'django', 'DRF3', 'vue-js'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['tags'], ['django', 'drf3', 'vue-js'])

    def test_tags_can_be_omitted_for_backwards_compatibility(self):
        serializer = QuestionUpdateCreateSerializer(data=self.valid_payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('tags', serializer.validated_data)

    def test_exactly_five_unique_tags_are_valid(self):
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload(['django', 'drf', 'mysql', 'vue', 'docker'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(len(serializer.validated_data['tags']), MAX_QUESTION_TAGS)

    def test_duplicate_tags_after_normalization_do_not_count_toward_limit(self):
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload(['Django', 'django', ' DRF ', 'drf', 'mysql', 'vue', 'docker'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['tags'], ['django', 'drf', 'mysql', 'vue', 'docker'])

    def test_saving_question_with_validated_tags_persists_normalized_tags_in_s02(self):
        user = CustomUser.objects.create_user(
            user_email='serializer-author@example.com',
            user_name='serializer-author',
            password='password',
        )
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload(['Django', 'DRF'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        question = serializer.save(user=user)

        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django', 'drf'})
        self.assertEqual(
            dict(Tag.objects.order_by('name').values_list('name', 'questions_count')),
            {'django': 1, 'drf': 1},
        )

    def test_rejects_more_than_five_unique_tags(self):
        self.assert_tags_error(['django', 'drf', 'mysql', 'vue', 'docker', 'python'])

    def test_rejects_non_list_tags_payload(self):
        self.assert_tags_error('django')

    def test_rejects_non_string_tag_values(self):
        self.assert_tags_error([123])

    def test_rejects_empty_or_whitespace_only_tags(self):
        self.assert_tags_error(['   '])

    def test_rejects_invalid_tag_characters(self):
        invalid_tag_values = ['python_api', 'c++', 'django rest', 'джанго']

        for invalid_tag in invalid_tag_values:
            with self.subTest(invalid_tag=invalid_tag):
                self.assert_tags_error([invalid_tag])


class QuestionTagResponseSerializerTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='response-author@example.com',
            user_name='response-author',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.user,
            question_title='How should tags be represented?',
            question_body='Question responses should expose public tag objects.',
        )

    def test_tag_serializer_exposes_only_public_contract_fields(self):
        tag = Tag.objects.create(name='django', questions_count=1)

        self.assertEqual(set(TagSerializer(tag).data.keys()), {'name', 'questions_count'})
        self.assertEqual(TagSerializer(tag).data, {'name': 'django', 'questions_count': 1})

    def test_untagged_question_serializers_emit_empty_tag_lists(self):
        expected_empty_tags = []

        self.assertEqual(QuestionListSerializer(self.question).data['tags'], expected_empty_tags)
        self.assertEqual(QuestionGetSerializer(self.question).data['tags'], expected_empty_tags)
        self.assertEqual(QuestionCreateResponseSerializer(self.question).data['tags'], expected_empty_tags)

    def test_tagged_question_serializers_emit_nested_tag_objects(self):
        tag = Tag.objects.create(name='django', questions_count=1)
        self.question.tags.add(tag)
        expected_tags = [{'name': 'django', 'questions_count': 1}]

        self.assertEqual(QuestionListSerializer(self.question).data['tags'], expected_tags)
        self.assertEqual(QuestionGetSerializer(self.question).data['tags'], expected_tags)
        self.assertEqual(QuestionCreateResponseSerializer(self.question).data['tags'], expected_tags)

    def test_question_detail_response_emits_nested_tags_without_raw_tag_ids(self):
        tag = Tag.objects.create(name='django', questions_count=1)
        self.question.tags.add(tag)

        response = self.client.get(f'/question/{self.question.question_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['tags'], [{'name': 'django', 'questions_count': 1}])
        self.assertEqual(set(response.data['tags'][0].keys()), {'name', 'questions_count'})
        self.assertNotEqual(response.data['tags'], [tag.pk])
        self.assertNotIn('id', response.data['tags'][0])
        self.assertNotIn('tag_id', response.data['tags'][0])

    def test_untagged_question_detail_response_emits_empty_tags(self):
        response = self.client.get(f'/question/{self.question.question_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('tags', response.data)
        self.assertEqual(response.data['tags'], [])

    def test_question_list_response_emits_nested_tags_and_empty_lists(self):
        tag = Tag.objects.create(name='django', questions_count=1)
        self.question.tags.add(tag)
        untagged_question = Question.objects.create(
            user=self.user,
            question_title='Question without tags in list',
            question_body='Old untagged questions should still serialize safely.',
        )

        response = self.client.get('/question/', {'ordering': 'question_created_at'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response_by_id = {item['question_id']: item for item in response.data['results']}
        self.assertEqual(
            response_by_id[str(self.question.question_id)]['tags'],
            [{'name': 'django', 'questions_count': 1}],
        )
        self.assertEqual(response_by_id[str(untagged_question.question_id)]['tags'], [])


class TagAutocompleteApiTests(APITestCase):
    def setUp(self):
        self.django_tag = Tag.objects.create(name='django', questions_count=5)
        self.django_rest_tag = Tag.objects.create(name='django-rest', questions_count=2)
        self.vue_tag = Tag.objects.create(name='vue', questions_count=7)

    def test_tag_autocomplete_is_public_and_returns_matching_tag_suggestions(self):
        response = self.client.get('/tag/', {'search': 'Dj'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data,
            [
                {'name': 'django', 'questions_count': 5},
                {'name': 'django-rest', 'questions_count': 2},
            ],
        )

    def test_tag_autocomplete_response_shape_exposes_only_public_tag_fields(self):
        response = self.client.get('/tag/', {'search': 'django'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        for tag in response.data:
            self.assertEqual(set(tag.keys()), {'name', 'questions_count'})
            self.assertNotIn('id', tag)
            self.assertNotIn('question_id', tag)
            self.assertNotIn('question_body', tag)
            self.assertNotIn('user', tag)

    def test_tag_autocomplete_non_matching_input_returns_empty_list_without_creating_tags(self):
        response = self.client.get('/tag/', {'search': 'missing-tag'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, [])
        self.assertFalse(Tag.objects.filter(name='missing-tag').exists())
        self.assertEqual(Tag.objects.count(), 3)

    def test_tag_autocomplete_missing_search_returns_no_tags(self):
        response = self.client.get('/tag/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, [])

    def test_tag_autocomplete_empty_search_returns_no_tags(self):
        for search in ['', '   ']:
            with self.subTest(search=repr(search)):
                response = self.client.get('/tag/', {'search': search})

                self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
                self.assertEqual(response.data, [])

    def test_tag_autocomplete_malformed_search_text_is_safe_and_returns_no_matches(self):
        response = self.client.get('/tag/', {'search': "django'; DROP TABLE tags; --"})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, [])
        self.assertEqual(Tag.objects.count(), 3)

    def test_tag_autocomplete_limits_results_to_ten_existing_tags(self):
        for index in range(12):
            Tag.objects.create(name=f'dj-extra-{index:02d}', questions_count=1)

        response = self.client.get('/tag/', {'search': 'dj'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data), 10)
        self.assertEqual(response.data[0], {'name': 'django', 'questions_count': 5})
        self.assertEqual(response.data[1], {'name': 'django-rest', 'questions_count': 2})

    def test_tag_autocomplete_schema_documents_search_parameter_and_response(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        tag_list_operation = schema['paths']['/tag/']['get']

        search_parameter = next(
            parameter for parameter in tag_list_operation['parameters']
            if parameter['name'] == 'search' and parameter['in'] == 'query'
        )

        self.assertFalse(search_parameter.get('required', False))
        self.assertEqual(search_parameter['schema']['type'], 'string')
        self.assertEqual(
            tag_list_operation['responses']['200']['content']['application/json']['schema']['items']['$ref'],
            '#/components/schemas/Tag',
        )


class QuestionCreateWithTagsApiTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='question-create-author@example.com',
            user_name='question-create-author',
            password='password',
        )
        self.client.force_authenticate(self.user)

    def valid_payload(self, tags_marker=None):
        payload = {
            'question_title': 'How do I create a question with tags?',
            'question_body': 'I need the create API to persist normalized tag associations.',
        }
        if tags_marker is not None:
            payload['tags'] = tags_marker
        return payload

    def post_question(self, tags_marker=None):
        return self.client.post('/question/', self.valid_payload(tags_marker), format='json')

    def question_from_response(self, response):
        self.assertIn('question_id', response.data)
        return Question.objects.get(question_id=response.data['question_id'])

    def assert_response_tags(self, response, expected_tags):
        self.assertIn('tags', response.data)
        self.assertCountEqual(response.data['tags'], expected_tags)

    def assert_persisted_tags(self, question, expected_counts):
        self.assertEqual(set(question.tags.values_list('name', flat=True)), set(expected_counts.keys()))
        self.assertEqual(
            dict(Tag.objects.order_by('name').values_list('name', 'questions_count')),
            expected_counts,
        )

    def test_create_question_persists_normalized_nested_tags_and_counters(self):
        response = self.post_question([' Django ', 'DRF3', ' vue-js '])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assert_response_tags(
            response,
            [
                {'name': 'django', 'questions_count': 1},
                {'name': 'drf3', 'questions_count': 1},
                {'name': 'vue-js', 'questions_count': 1},
            ],
        )
        question = self.question_from_response(response)
        self.assert_persisted_tags(question, {'django': 1, 'drf3': 1, 'vue-js': 1})

    def test_create_question_reuses_existing_tags_and_counts_unique_submitted_names_once(self):
        existing_tag = Tag.objects.create(name='django', questions_count=1)
        existing_question = Question.objects.create(
            user=self.user,
            question_title='Existing Django question',
            question_body='Existing tag counters should be incremented, not replaced.',
        )
        existing_question.tags.add(existing_tag)

        response = self.post_question([' Django ', 'django', 'DRF', ' drf '])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assert_response_tags(
            response,
            [
                {'name': 'django', 'questions_count': 2},
                {'name': 'drf', 'questions_count': 1},
            ],
        )
        question = self.question_from_response(response)
        self.assert_persisted_tags(question, {'django': 2, 'drf': 1})
        self.assertEqual(Tag.objects.filter(name='django').count(), 1)

    def test_invalid_tag_payload_returns_400_without_creating_questions_or_tags(self):
        invalid_payloads = [
            'django',
            ['django', 123],
            ['django rest'],
            ['django', 'drf', 'mysql', 'vue', 'docker', 'python'],
        ]

        for invalid_tags in invalid_payloads:
            with self.subTest(invalid_tags=invalid_tags):
                response = self.post_question(invalid_tags)

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
                self.assertIn('tags', response.data)
                self.assertEqual(Question.objects.count(), 0)
                self.assertEqual(Tag.objects.count(), 0)

    def test_omitted_tags_still_creates_untagged_question(self):
        response = self.post_question()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['tags'], [])
        question = self.question_from_response(response)
        self.assertEqual(question.tags.count(), 0)
        self.assertEqual(Tag.objects.count(), 0)


class QuestionDiscoveryTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='author@example.com',
            user_name='author',
            password='password',
        )
        self.django_tag = Tag.objects.create(name='django', questions_count=2)
        self.serializer_tag = Tag.objects.create(name='serializer', questions_count=2)
        self.vue_tag = Tag.objects.create(name='vue', questions_count=1)
        self.mysql_tag = Tag.objects.create(name='mysql', questions_count=1)
        self.django_question = Question.objects.create(
            user=self.user,
            question_title='Django serializer validation',
            question_body='Как валидировать вложенный serializer?',
        )
        self.django_question.tags.add(self.django_tag, self.serializer_tag)
        self.django_only_question = Question.objects.create(
            user=self.user,
            question_title='Django model pagination',
            question_body='Как настроить page size для списка вопросов?',
        )
        self.django_only_question.tags.add(self.django_tag)
        self.serializer_only_question = Question.objects.create(
            user=self.user,
            question_title='Serializer field ordering',
            question_body='Как упорядочить поля serializer?',
        )
        self.serializer_only_question.tags.add(self.serializer_tag, self.mysql_tag)
        self.vue_question = Question.objects.create(
            user=self.user,
            question_title='Vue query cache invalidation',
            question_body='Как обновить TanStack Query cache?',
        )
        self.vue_question.tags.add(self.vue_tag)
        self.untagged_question = Question.objects.create(
            user=self.user,
            question_title='Question without tags',
            question_body='Untagged questions should remain discoverable without tag filters.',
        )

    def assert_question_ids(self, response, expected_questions):
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['count'], len(expected_questions))
        self.assertEqual(
            {item['question_id'] for item in response.data['results']},
            {str(question.question_id) for question in expected_questions},
        )

    def test_question_list_searches_by_title(self):
        response = self.client.get('/question/', {'search': 'django'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(
            {item['question_title'] for item in response.data['results']},
            {self.django_question.question_title, self.django_only_question.question_title},
        )

    def test_question_list_orders_by_creation_date(self):
        older_date = timezone.now() - timedelta(days=2)
        newer_date = timezone.now() - timedelta(days=1)
        Question.objects.filter(question_id=self.django_question.question_id).update(question_created_at=older_date)
        Question.objects.filter(question_id=self.vue_question.question_id).update(question_created_at=newer_date)

        newest_response = self.client.get('/question/', {'ordering': '-question_created_at'})
        oldest_response = self.client.get('/question/', {'ordering': 'question_created_at'})

        self.assertEqual(newest_response.status_code, status.HTTP_200_OK)
        self.assertEqual(oldest_response.status_code, status.HTTP_200_OK)
        self.assertEqual(newest_response.data['results'][0]['question_id'], str(self.untagged_question.question_id))
        self.assertEqual(oldest_response.data['results'][0]['question_id'], str(self.django_question.question_id))

    def test_question_list_filters_by_one_repeated_tag_parameter(self):
        response = self.client.get('/question/?tag=django')

        self.assert_question_ids(response, [self.django_question, self.django_only_question])
        for item in response.data['results']:
            self.assertIn({'name': 'django', 'questions_count': 2}, item['tags'])
            self.assertNotIn('question_body', item)
            for tag in item['tags']:
                self.assertEqual(set(tag.keys()), {'name', 'questions_count'})
                self.assertNotIn('id', tag)
                self.assertNotIn('tag_id', tag)

    def test_question_list_filters_repeated_tags_with_and_semantics(self):
        response = self.client.get('/question/?tag=django&tag=serializer')

        self.assert_question_ids(response, [self.django_question])
        self.assertCountEqual(
            response.data['results'][0]['tags'],
            [
                {'name': 'django', 'questions_count': 2},
                {'name': 'serializer', 'questions_count': 2},
            ],
        )

    def test_question_list_normalizes_duplicate_case_and_whitespace_tag_params(self):
        response = self.client.get('/question/?tag=django&tag=DJANGO&tag=%20django%20&tag=')

        self.assert_question_ids(response, [self.django_question, self.django_only_question])

    def test_question_list_unknown_tag_returns_no_rows_without_creating_tag(self):
        response = self.client.get('/question/?tag=django%27%3B%20DROP%20TABLE%20tags%3B%20--')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['count'], 0)
        self.assertEqual(response.data['results'], [])
        self.assertFalse(Tag.objects.filter(name="django'; drop table tags; --").exists())
        self.assertEqual(Tag.objects.count(), 4)

    def test_question_list_combines_tag_filter_with_search_ordering_and_pagination_shape(self):
        older_date = timezone.now() - timedelta(days=3)
        newer_date = timezone.now() - timedelta(days=1)
        Question.objects.filter(question_id=self.django_question.question_id).update(question_created_at=older_date)
        Question.objects.filter(question_id=self.django_only_question.question_id).update(question_created_at=newer_date)

        response = self.client.get('/question/?tag=django&search=django&ordering=question_created_at&page=1')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(set(response.data.keys()), {'count', 'next', 'previous', 'results'})
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['results'][0]['question_id'], str(self.django_question.question_id))
        self.assertEqual(response.data['results'][1]['question_id'], str(self.django_only_question.question_id))

    def test_question_list_schema_documents_repeated_tag_parameter(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        question_list_operation = schema['paths']['/question/']['get']
        parameters_by_name = {
            parameter['name']: parameter
            for parameter in question_list_operation['parameters']
            if parameter['in'] == 'query'
        }

        self.assertIn('tag', parameters_by_name)
        self.assertIn('search', parameters_by_name)
        self.assertIn('ordering', parameters_by_name)

        tag_parameter = parameters_by_name['tag']
        self.assertFalse(tag_parameter.get('required', False))
        self.assertEqual(tag_parameter['schema']['type'], 'array')
        self.assertEqual(tag_parameter['schema']['items']['type'], 'string')
        self.assertTrue(tag_parameter.get('explode', True))

        self.assertFalse(parameters_by_name['search'].get('required', False))
        self.assertEqual(parameters_by_name['search']['schema']['type'], 'string')
        self.assertFalse(parameters_by_name['ordering'].get('required', False))
        self.assertEqual(parameters_by_name['ordering']['schema']['type'], 'string')

        response_schema = question_list_operation['responses']['200']['content']['application/json']['schema']
        self.assertEqual(response_schema['$ref'], '#/components/schemas/PaginatedQuestionListList')
        paginated_schema = schema['components']['schemas']['PaginatedQuestionListList']
        self.assertEqual(
            paginated_schema['properties']['results']['items']['$ref'],
            '#/components/schemas/QuestionList',
        )


class BestSolutionTests(APITestCase):
    def setUp(self):
        self.question_author = CustomUser.objects.create_user(
            user_email='question-author@example.com',
            user_name='question-author',
            password='password',
        )
        self.first_solver = CustomUser.objects.create_user(
            user_email='solver-one@example.com',
            user_name='solver-one',
            password='password',
        )
        self.second_solver = CustomUser.objects.create_user(
            user_email='solver-two@example.com',
            user_name='solver-two',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.question_author,
            question_title='Как выбрать лучшее решение?',
            question_body='Нужно пометить один ответ как принятый.',
        )
        self.first_solution = Solution.objects.create(
            user=self.first_solver,
            question=self.question,
            solution_body='Первое решение.',
        )
        self.second_solution = Solution.objects.create(
            user=self.second_solver,
            question=self.question,
            solution_body='Второе решение.',
        )

    def test_question_author_can_mark_exactly_one_best_solution(self):
        self.client.force_authenticate(self.question_author)

        first_response = self.client.patch(
            f'/solution/{self.first_solution.solution_id}/best/',
            {'solution_is_best': True},
            format='json',
        )
        second_response = self.client.patch(
            f'/solution/{self.second_solution.solution_id}/best/',
            {'solution_is_best': True},
            format='json',
        )

        self.first_solution.refresh_from_db()
        self.second_solution.refresh_from_db()
        self.question.refresh_from_db()

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.first_solution.solution_is_best)
        self.assertTrue(self.second_solution.solution_is_best)
        self.assertEqual(self.question.question_status, Question.Status.SOLVED_STATUS)

    def test_question_author_can_remove_best_solution(self):
        self.second_solution.solution_is_best = True
        self.second_solution.save(update_fields=['solution_is_best'])
        self.question.question_status = Question.Status.SOLVED_STATUS
        self.question.save(update_fields=['question_status'])
        self.client.force_authenticate(self.question_author)

        response = self.client.patch(
            f'/solution/{self.second_solution.solution_id}/best/',
            {'solution_is_best': False},
            format='json',
        )

        self.second_solution.refresh_from_db()
        self.question.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.second_solution.solution_is_best)
        self.assertEqual(self.question.question_status, Question.Status.OPEN_STATUS)

    def test_non_author_cannot_mark_best_solution(self):
        self.client.force_authenticate(self.first_solver)

        response = self.client.patch(
            f'/solution/{self.second_solution.solution_id}/best/',
            {'solution_is_best': True},
            format='json',
        )

        self.second_solution.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(self.second_solution.solution_is_best)

    def test_question_author_cannot_create_solution_for_own_question(self):
        self.client.force_authenticate(self.question_author)

        response = self.client.post(
            '/solution/',
            {
                'question': str(self.question.question_id),
                'solution_body': 'Я сам отвечаю на свой вопрос.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
