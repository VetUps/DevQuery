from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.qa.models import Question, Solution
from apps.user.models import CustomUser


class QuestionDiscoveryTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='author@example.com',
            user_name='author',
            password='password',
        )
        self.django_question = Question.objects.create(
            user=self.user,
            question_title='Django serializer validation',
            question_body='Как валидировать вложенный serializer?',
        )
        self.vue_question = Question.objects.create(
            user=self.user,
            question_title='Vue query cache invalidation',
            question_body='Как обновить TanStack Query cache?',
        )

    def test_question_list_searches_by_title(self):
        response = self.client.get('/question/', {'search': 'django'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['question_title'], self.django_question.question_title)

    def test_question_list_orders_by_creation_date(self):
        older_date = timezone.now() - timedelta(days=2)
        newer_date = timezone.now() - timedelta(days=1)
        Question.objects.filter(question_id=self.django_question.question_id).update(question_created_at=older_date)
        Question.objects.filter(question_id=self.vue_question.question_id).update(question_created_at=newer_date)

        newest_response = self.client.get('/question/', {'ordering': '-question_created_at'})
        oldest_response = self.client.get('/question/', {'ordering': 'question_created_at'})

        self.assertEqual(newest_response.status_code, status.HTTP_200_OK)
        self.assertEqual(oldest_response.status_code, status.HTTP_200_OK)
        self.assertEqual(newest_response.data['results'][0]['question_id'], str(self.vue_question.question_id))
        self.assertEqual(oldest_response.data['results'][0]['question_id'], str(self.django_question.question_id))


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
