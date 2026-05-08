from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.qa.models import Comment, Question, QuestionEditEvent, QuestionEditProposal, QuestionRevision, Solution, SolutionEdits, Tag, Vote
from apps.user.models import CustomUser, ReputationLevelThreshold, ReputationPolicyConfig, ReputationTransaction
from apps.user.services.reputation_service import ReputationService


LOCAL_PASSWORD = 'Password123!'
SEED_NOTE = 'Локальные тестовые данные StackOverflow 2.0.'


@dataclass(frozen=True)
class SeedUser:
    email: str
    username: str
    role: str = CustomUser.Roles.USER_ROLE
    score: int = 0
    bio: str = ''
    manual_level: str | None = None
    is_staff: bool = False
    is_superuser: bool = False


SEED_USERS = [
    SeedUser(
        email='admin.local@example.com',
        username='admin_local',
        role=CustomUser.Roles.ADMIN_ROLE,
        score=420,
        bio='Администратор для проверки панели управления, ручных корректировок и audit trail.',
        manual_level=CustomUser.ReputationLevel.MASTER,
        is_staff=True,
        is_superuser=True,
    ),
    SeedUser(
        email='newcomer.local@example.com',
        username='newcomer_local',
        score=5,
        bio='Новичок с вопросом в protected-window.',
    ),
    SeedUser(
        email='participant.local@example.com',
        username='participant_local',
        score=55,
        bio='Участник с несколькими ответами и комментариями.',
    ),
    SeedUser(
        email='expert.local@example.com',
        username='expert_local',
        score=160,
        bio='Эксперт с принятым решением и историей правок.',
    ),
    SeedUser(
        email='moderated.local@example.com',
        username='moderated_local',
        score=18,
        bio='Пользователь для проверки ручной модерации репутации.',
        manual_level=CustomUser.ReputationLevel.EXPERT,
    ),
]


class Command(BaseCommand):
    help = 'Создает воспроизводимые локальные тестовые данные для ручной проверки frontend/backend.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Удалить ранее созданные seed-данные перед повторным наполнением.',
        )
        parser.add_argument(
            '--allow-production',
            action='store_true',
            help='Разрешить запуск вне DEBUG/SQLite. Используйте только осознанно.',
        )

    def handle(self, *args, **options):
        self._guard_local_database(allow_production=options['allow_production'])

        with transaction.atomic():
            if options['reset']:
                self._reset_seed_data()

            self._ensure_reputation_policy()
            users = self._seed_users()
            tags = self._seed_tags()
            questions = self._seed_questions(users, tags)
            solutions = self._seed_solutions(users, questions)
            self._seed_comments(users, questions, solutions)
            self._seed_votes(users, questions, solutions)
            self._seed_edit_history(users, questions, solutions, tags)
            self._seed_reputation_events(users, solutions)
            self._refresh_tag_counters(tags)

        self.stdout.write(self.style.SUCCESS('Локальные тестовые данные готовы.'))
        self.stdout.write('Аккаунты для входа:')
        for seed_user in SEED_USERS:
            self.stdout.write(f'- {seed_user.email} / {LOCAL_PASSWORD} ({seed_user.username})')

    def _guard_local_database(self, *, allow_production: bool) -> None:
        engine = settings.DATABASES['default']['ENGINE']
        is_sqlite = engine.endswith('sqlite3')
        if settings.DEBUG or is_sqlite or allow_production:
            return

        raise CommandError(
            'seed_local_data работает только в DEBUG или SQLite. '
            'Если это точно локальная БД, повторите с --allow-production.'
        )

    def _reset_seed_data(self) -> None:
        seed_emails = [seed_user.email for seed_user in SEED_USERS]
        CustomUser.objects.filter(user_email__in=seed_emails).delete()
        Question.objects.filter(question_title__startswith='[seed]').delete()
        Tag.objects.filter(name__in=self._seed_tag_names()).delete()

    def _ensure_reputation_policy(self) -> None:
        for level, minimum_score in ReputationLevelThreshold.DEFAULT_THRESHOLDS.items():
            threshold, _ = ReputationLevelThreshold.objects.update_or_create(
                level=level,
                defaults={
                    'minimum_score': minimum_score,
                    'is_active': True,
                    'description': 'Базовый порог для локальных seed-данных.',
                },
            )
            threshold.full_clean()

        ReputationPolicyConfig.objects.update_or_create(
            singleton_key='default',
            defaults={'protected_newcomer_window_hours': 12},
        )

    def _seed_users(self) -> dict[str, CustomUser]:
        users = {}
        for seed_user in SEED_USERS:
            user, _ = CustomUser.objects.update_or_create(
                user_email=seed_user.email,
                defaults={
                    'user_name': seed_user.username,
                    'user_role': seed_user.role,
                    'user_reputation_score': seed_user.score,
                    'user_bio': seed_user.bio,
                    'is_staff': seed_user.is_staff,
                    'is_superuser': seed_user.is_superuser,
                    'is_active': True,
                },
            )
            user.set_password(LOCAL_PASSWORD)
            user.save(update_fields=['password'])
            if user.manual_reputation_level != seed_user.manual_level:
                ReputationService.set_manual_level_override(
                    user=user,
                    manual_level=seed_user.manual_level,
                    actor=None,
                    note=SEED_NOTE,
                )
                user.refresh_from_db()
            users[seed_user.username] = user
        return users

    def _seed_tag_names(self) -> list[str]:
        return ['django', 'vue', 'typescript', 'docker', 'reputation', 'postgresql']

    def _seed_tags(self) -> dict[str, Tag]:
        return {
            tag_name: Tag.objects.update_or_create(name=tag_name, defaults={})[0]
            for tag_name in self._seed_tag_names()
        }

    def _seed_questions(self, users: dict[str, CustomUser], tags: dict[str, Tag]) -> dict[str, Question]:
        question_specs = {
            'protected': {
                'user': users['newcomer_local'],
                'title': '[seed] Почему Vue-компонент не обновляется после mutation?',
                'body': 'Проверочный вопрос новичка: нужен protected-window, теги и несколько комментариев.',
                'status': Question.Status.OPEN_STATUS,
                'tags': ['vue', 'typescript'],
            },
            'solved': {
                'user': users['participant_local'],
                'title': '[seed] Как настроить Django migrations в Docker Compose?',
                'body': 'Проверочный solved-вопрос с принятым ответом и голосами.',
                'status': Question.Status.SOLVED_STATUS,
                'tags': ['django', 'docker'],
            },
            'admin': {
                'user': users['expert_local'],
                'title': '[seed] Как проектировать audit trail для ручной репутации?',
                'body': 'Вопрос для проверки admin activity timeline и истории репутации.',
                'status': Question.Status.OPEN_STATUS,
                'tags': ['reputation', 'django'],
            },
        }

        questions = {}
        for key, spec in question_specs.items():
            question, _ = Question.objects.update_or_create(
                question_title=spec['title'],
                defaults={
                    'user': spec['user'],
                    'question_body': spec['body'],
                    'question_status': spec['status'],
                },
            )
            question.tags.set([tags[tag_name] for tag_name in spec['tags']])
            questions[key] = question
        return questions

    def _seed_solutions(self, users: dict[str, CustomUser], questions: dict[str, Question]) -> dict[str, Solution]:
        solution_specs = {
            'protected_answer': {
                'user': users['participant_local'],
                'question': questions['protected'],
                'body': 'Проверьте, что reactive source не теряется при destructuring, и используйте computed/ref.',
                'is_best': False,
            },
            'docker_answer': {
                'user': users['expert_local'],
                'question': questions['solved'],
                'body': 'Запускайте migrations отдельным сервисом перед backend и проверяйте DATABASE_* переменные.',
                'is_best': True,
            },
            'audit_answer': {
                'user': users['admin_local'],
                'question': questions['admin'],
                'body': 'Храните actor, target, reason, amount, note и timestamp в отдельной таблице транзакций.',
                'is_best': False,
            },
        }

        solutions = {}
        for key, spec in solution_specs.items():
            solution, _ = Solution.objects.update_or_create(
                user=spec['user'],
                question=spec['question'],
                defaults={
                    'solution_body': spec['body'],
                    'solution_is_best': spec['is_best'],
                },
            )
            solutions[key] = solution
        return solutions

    def _seed_comments(
        self,
        users: dict[str, CustomUser],
        questions: dict[str, Question],
        solutions: dict[str, Solution],
    ) -> None:
        question_type = ContentType.objects.get_for_model(Question)
        solution_type = ContentType.objects.get_for_model(Solution)
        comment_specs = [
            (users['expert_local'], question_type, questions['protected'].pk, 'Нужен пример кода с watcher/computed.'),
            (users['newcomer_local'], solution_type, solutions['protected_answer'].pk, 'Спасибо, destructuring действительно ломал реактивность.'),
            (users['admin_local'], question_type, questions['admin'].pk, 'Проверьте, что ручная корректировка видна в ledger.'),
        ]
        for user, content_type, object_id, body in comment_specs:
            Comment.objects.update_or_create(
                user=user,
                content_type=content_type,
                object_id=object_id,
                body=body,
                defaults={},
            )

    def _seed_votes(
        self,
        users: dict[str, CustomUser],
        questions: dict[str, Question],
        solutions: dict[str, Solution],
    ) -> None:
        question_type = ContentType.objects.get_for_model(Question)
        solution_type = ContentType.objects.get_for_model(Solution)
        vote_specs = [
            (users['participant_local'], question_type, questions['protected'].pk, Vote.VoteType.UPVOTE),
            (users['expert_local'], question_type, questions['protected'].pk, Vote.VoteType.UPVOTE),
            (users['admin_local'], question_type, questions['solved'].pk, Vote.VoteType.UPVOTE),
            (users['newcomer_local'], solution_type, solutions['docker_answer'].pk, Vote.VoteType.UPVOTE),
            (users['participant_local'], solution_type, solutions['audit_answer'].pk, Vote.VoteType.UPVOTE),
            (users['moderated_local'], solution_type, solutions['protected_answer'].pk, Vote.VoteType.DOWNVOTE),
        ]
        for user, content_type, object_id, vote_type in vote_specs:
            Vote.objects.update_or_create(
                user=user,
                content_type=content_type,
                object_id=object_id,
                defaults={'vote_type': vote_type},
            )

    def _seed_edit_history(
        self,
        users: dict[str, CustomUser],
        questions: dict[str, Question],
        solutions: dict[str, Solution],
        tags: dict[str, Tag],
    ) -> None:
        question = questions['admin']
        proposal, _ = QuestionEditProposal.objects.update_or_create(
            question=question,
            author=users['moderated_local'],
            question_edit_title_after='[seed] Как проектировать audit trail для ручной репутации в Django?',
            defaults={
                'reviewed_by': users['admin_local'],
                'question_edit_title_before': question.question_title,
                'question_edit_body_before': question.question_body,
                'question_edit_tags_before': ['reputation', 'django'],
                'question_edit_body_after': question.question_body + '\n\nДобавлен акцент на Django admin и API.',
                'question_edit_tags_after': ['reputation', 'django', 'postgresql'],
                'question_edit_is_approved': True,
            },
        )
        revision, _ = QuestionRevision.objects.update_or_create(
            question=question,
            actor=users['admin_local'],
            proposal=proposal,
            source=QuestionRevision.Source.APPROVED_PROPOSAL,
            title_after=proposal.question_edit_title_after,
            defaults={
                'title_before': proposal.question_edit_title_before,
                'body_before': proposal.question_edit_body_before,
                'tags_before': proposal.question_edit_tags_before,
                'body_after': proposal.question_edit_body_after,
                'tags_after': proposal.question_edit_tags_after,
            },
        )
        revision.tags.set([tags['reputation'], tags['django'], tags['postgresql']])
        QuestionEditEvent.objects.update_or_create(
            question=question,
            actor=users['admin_local'],
            proposal=proposal,
            revision=revision,
            event_type=QuestionEditEvent.EventType.APPROVED,
            defaults={},
        )

        SolutionEdits.objects.update_or_create(
            solution=solutions['docker_answer'],
            user=users['participant_local'],
            solution_edit_body_after=solutions['docker_answer'].solution_body + '\nПроверьте healthcheck базы перед запуском миграций.',
            defaults={
                'solution_edit_body_before': solutions['docker_answer'].solution_body,
                'solution_edit_is_approved': None,
            },
        )

    def _seed_reputation_events(self, users: dict[str, CustomUser], solutions: dict[str, Solution]) -> None:
        solution_type = ContentType.objects.get_for_model(Solution)
        ReputationTransaction.objects.update_or_create(
            user=users['expert_local'],
            actor=users['admin_local'],
            reputation_transaction_reason=ReputationTransaction.TransactionReason.BEST_SOLUTION,
            content_type=solution_type,
            object_id=solutions['docker_answer'].pk,
            defaults={
                'reputation_transaction_amount': 50,
                'note': SEED_NOTE + ' Принятый ответ для локальной проверки ledger.',
            },
        )
        ReputationTransaction.objects.update_or_create(
            user=users['moderated_local'],
            actor=users['admin_local'],
            reputation_transaction_reason=ReputationTransaction.TransactionReason.ADMIN_ADJUSTMENT,
            content_type=None,
            object_id=None,
            defaults={
                'reputation_transaction_amount': 15,
                'note': SEED_NOTE + ' Ручная корректировка для проверки admin формы.',
            },
        )

    def _refresh_tag_counters(self, tags: dict[str, Tag]) -> None:
        for tag in tags.values():
            tag.questions_count = tag.questions.count()
            tag.save(update_fields=['questions_count'])
