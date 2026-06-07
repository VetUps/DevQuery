from io import StringIO

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from apps.knowledge.models import KnowledgeConcept, QuestionConceptEdge, UserConceptActivity, UserKnowledgeGraphState
from apps.knowledge.services.insights_service import get_owner_insights_payload
from apps.notifications.models import Notification
from apps.qa.models import Comment, Question, QuestionEditProposal, QuestionRevision, Solution, SolutionEdits, Tag, Vote
from apps.user.models import CustomUser, ReputationPolicyConfig, ReputationTransaction


DEMO_EMAILS = [
    'sofia.morozova@example.com',
    'ivan.lebedev@example.com',
    'olga.sokolova@example.com',
    'dmitry.volkov@example.com',
    'maria.kim@example.com',
    'pavel.ivanov@example.com',
    'elena.orlova@example.com',
]
ACTIVE_INVITATION_TITLE = 'Как стабилизировать форму ответа, если эксперт подключается через приглашение?'


class SeedLocalDataCommandTests(TestCase):
    def call_seed(self, *args):
        output = StringIO()
        call_command('seed_local_data', *args, stdout=output)
        return output.getvalue()

    @override_settings(DEBUG=True)
    def test_command_creates_demo_accounts_and_content(self):
        output = self.call_seed()

        self.assertIn('Демонстрационные данные готовы.', output)
        self.assertIn('sofia.morozova@example.com / Password123!', output)
        self.assertEqual(CustomUser.objects.filter(user_email__in=DEMO_EMAILS).count(), 7)
        self.assertTrue(CustomUser.objects.get(user_email='sofia.morozova@example.com').is_superuser)
        self.assertEqual(CustomUser.objects.get(user_email='maria.kim@example.com').user_reputation_score, 360)
        self.assertEqual(CustomUser.objects.get(user_email='pavel.ivanov@example.com').user_reputation_score, 35)
        self.assertEqual(
            CustomUser.objects.get(user_email='elena.orlova@example.com').manual_reputation_level,
            CustomUser.ReputationLevel.EXPERT,
        )
        self.assertEqual(Question.objects.count(), 43)
        self.assertEqual(Question.objects.filter(question_title__startswith='[seed]').count(), 0)
        self.assertTrue(
            Question.objects.filter(
                question_title='Почему computed-свойство во Vue 3 перестает обновляться после деструктуризации props?'
            ).exists()
        )
        self.assertEqual(Solution.objects.count(), 39)
        self.assertGreaterEqual(Tag.objects.count(), 36)
        self.assertGreaterEqual(KnowledgeConcept.objects.count(), 30)
        self.assertGreaterEqual(QuestionConceptEdge.objects.count(), 160)
        self.assertGreaterEqual(UserConceptActivity.objects.count(), 250)
        self.assertEqual(UserKnowledgeGraphState.objects.filter(status=UserKnowledgeGraphState.Status.FRESH).count(), 7)
        self.assertIn('Большой граф знаний: войдите как dmitry.volkov@example.com', output)
        self.assertIn('Knowledge graph demo: questions=43', output)
        self.assertEqual(Notification.objects.filter(notification_type=Notification.NotificationType.EXPERT_INVITATION).count(), 4)
        self.assertTrue(
            Notification.objects.filter(
                recipient__user_email='dmitry.volkov@example.com',
                source_question__question_title=ACTIVE_INVITATION_TITLE,
                read_at__isnull=True,
            ).exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient__user_email='maria.kim@example.com',
                source_question__question_title=ACTIVE_INVITATION_TITLE,
                read_at__isnull=False,
            ).exists()
        )
        self.assertFalse(
            Solution.objects.filter(
                user__user_email='pavel.ivanov@example.com',
                question__question_title__contains='приглаш',
            ).exists()
        )
        self.assertGreaterEqual(Vote.objects.count(), 6)
        self.assertEqual(QuestionEditProposal.objects.count(), 1)
        self.assertEqual(QuestionRevision.objects.count(), 1)
        self.assertEqual(SolutionEdits.objects.count(), 1)
        self.assertEqual(ReputationPolicyConfig.objects.get().protected_newcomer_window_hours, 12)
        self.assertTrue(Tag.objects.filter(name='django', questions_count__gt=0).exists())
        self.assertTrue(ReputationTransaction.objects.filter(note__contains='модераторской проверки').exists())

        for email in ['dmitry.volkov@example.com', 'maria.kim@example.com']:
            insights = get_owner_insights_payload(CustomUser.objects.get(user_email=email))
            states = insights['summary']['states']
            self.assertGreater(states['strong'], 0, email)
            self.assertGreater(states['growing'], 0, email)
            self.assertGreater(states['weak'], 0, email)
            self.assertLess(states['strong'], insights['summary']['concept_count'], email)

    @override_settings(DEBUG=True)
    def test_command_is_idempotent(self):
        self.call_seed()
        counts_after_first_run = self.snapshot_counts()

        self.call_seed()

        self.assertEqual(self.snapshot_counts(), counts_after_first_run)

    @override_settings(DEBUG=True)
    def test_reset_rebuilds_seed_data_without_duplicates(self):
        self.call_seed()
        CustomUser.objects.get(user_email='ivan.lebedev@example.com').delete()

        self.call_seed('--reset')

        self.assertEqual(CustomUser.objects.filter(user_email__in=DEMO_EMAILS).count(), 7)
        self.assertEqual(Question.objects.count(), 43)
        self.assertEqual(Question.objects.filter(question_title__startswith='[seed]').count(), 0)
        self.assertEqual(Solution.objects.count(), 39)
        self.assertEqual(Notification.objects.filter(notification_type=Notification.NotificationType.EXPERT_INVITATION).count(), 4)
        self.assertGreaterEqual(KnowledgeConcept.objects.count(), 30)
        self.assertGreaterEqual(QuestionConceptEdge.objects.count(), 160)
        self.assertGreaterEqual(UserConceptActivity.objects.count(), 250)

    @override_settings(
        DEBUG=False,
        DATABASES={
            'default': {
                'ENGINE': 'django.db.backends.mysql',
                'NAME': 'production_like',
            }
        },
    )
    def test_command_requires_explicit_override_for_non_local_database(self):
        with self.assertRaises(CommandError) as context:
            self.call_seed()

        self.assertIn('seed_local_data работает только в DEBUG или SQLite', str(context.exception))

    def snapshot_counts(self):
        return {
            'users': CustomUser.objects.filter(user_email__in=DEMO_EMAILS).count(),
            'questions': Question.objects.count(),
            'solutions': Solution.objects.count(),
            'comments': Comment.objects.count(),
            'votes': Vote.objects.count(),
            'question_edit_proposals': QuestionEditProposal.objects.count(),
            'question_revisions': QuestionRevision.objects.count(),
            'solution_edits': SolutionEdits.objects.count(),
            'reputation_transactions': ReputationTransaction.objects.count(),
            'notifications': Notification.objects.count(),
            'knowledge_concepts': KnowledgeConcept.objects.count(),
            'question_concept_edges': QuestionConceptEdge.objects.count(),
            'user_concept_activities': UserConceptActivity.objects.count(),
            'user_graph_states': UserKnowledgeGraphState.objects.count(),
        }
