from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.knowledge.models import ConceptTagMapping, KnowledgeConcept, QuestionConceptEdge, UserConceptActivity
from apps.knowledge.services import mark_user_graph_fresh, rebuild_structural_graph, rebuild_user_concept_activity
from apps.notifications.models import Notification
from apps.qa.models import Comment, Question, QuestionEditEvent, QuestionEditProposal, QuestionRevision, Solution, SolutionEdits, Tag, Vote
from apps.qa.services.question_expert_invitation_service import QuestionExpertInvitationService
from apps.qa.services.question_protection_service import QuestionProtectionService
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
        email='master.local@example.com',
        username='master_local',
        score=360,
        bio='Мастер для проверки M008 приглашений, profile notifications и доступа к protected-вопросам.',
    ),
    SeedUser(
        email='blocked.local@example.com',
        username='blocked_local',
        score=35,
        bio='Обычный участник без ответа на M008 protected-вопросы; нужен для чистой negative-path проверки.',
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
            self._seed_m008_invitations(users, questions)
            self._refresh_tag_counters(tags)
            graph_summary, activity_summary = self._rebuild_seed_knowledge_graph(users)

        self.stdout.write(self.style.SUCCESS('Локальные тестовые данные готовы.'))
        self.stdout.write('Аккаунты для входа:')
        for seed_user in SEED_USERS:
            self.stdout.write(f'- {seed_user.email} / {LOCAL_PASSWORD} ({seed_user.username})')
        self.stdout.write(
            'Большой граф знаний: войдите как expert.local@example.com или master.local@example.com '
            'и откройте профиль → Граф знаний.'
        )
        self.stdout.write(
            'Knowledge graph seed: '
            f'questions={graph_summary.processed_questions} '
            f'concepts={graph_summary.created_concepts + graph_summary.updated_concepts} '
            f'edges={graph_summary.created_edges + graph_summary.updated_edges} '
            f'activity_rows={activity_summary.created_rows + activity_summary.updated_rows}'
        )

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
        seed_tag_names = self._seed_tag_names()
        UserConceptActivity.objects.filter(concept__slug__in=seed_tag_names).delete()
        QuestionConceptEdge.objects.filter(concept__slug__in=seed_tag_names).delete()
        ConceptTagMapping.objects.filter(tag__name__in=seed_tag_names).delete()
        KnowledgeConcept.objects.filter(slug__in=seed_tag_names).delete()
        CustomUser.objects.filter(user_email__in=seed_emails).delete()
        Question.objects.filter(question_title__startswith='[seed]').delete()
        Tag.objects.filter(name__in=seed_tag_names).delete()

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
        base_tags = ['django', 'vue', 'typescript', 'docker', 'reputation', 'postgresql']
        graph_tags = [tag for tag, *_ in self._large_graph_tag_topics()]
        return [*base_tags, *graph_tags]

    def _large_graph_tag_topics(self) -> list[tuple[str, str, str]]:
        return [
            ('python', 'Python', 'backend'),
            ('drf', 'Django REST Framework', 'backend'),
            ('jwt', 'JWT authentication', 'backend'),
            ('celery', 'Celery jobs', 'backend'),
            ('redis', 'Redis cache', 'backend'),
            ('pytest', 'Pytest', 'backend'),
            ('api-design', 'API design', 'backend'),
            ('websocket', 'WebSocket', 'backend'),
            ('vite', 'Vite', 'frontend'),
            ('pinia', 'Pinia', 'frontend'),
            ('vue-router', 'Vue Router', 'frontend'),
            ('vitest', 'Vitest', 'frontend'),
            ('playwright', 'Playwright', 'frontend'),
            ('cytoscape', 'Cytoscape', 'frontend'),
            ('accessibility', 'Accessibility', 'frontend'),
            ('frontend-performance', 'Frontend performance', 'frontend'),
            ('postgres-indexes', 'PostgreSQL indexes', 'data'),
            ('query-optimization', 'Query optimization', 'data'),
            ('transactions', 'Transactions', 'data'),
            ('migrations', 'Migrations', 'data'),
            ('full-text-search', 'Full-text search', 'data'),
            ('knowledge-graph', 'Knowledge graph', 'knowledge'),
            ('concept-extraction', 'Concept extraction', 'knowledge'),
            ('graph-privacy', 'Graph privacy', 'knowledge'),
            ('graph-visualization', 'Graph visualization', 'knowledge'),
            ('activity-ledger', 'Activity ledger', 'knowledge'),
            ('notifications', 'Notifications', 'product'),
            ('expert-invitations', 'Expert invitations', 'product'),
            ('admin-panel', 'Admin panel', 'product'),
            ('audit-trail', 'Audit trail', 'product'),
        ]

    def _seed_tags(self) -> dict[str, Tag]:
        return {
            tag_name: Tag.objects.update_or_create(name=tag_name, defaults={})[0]
            for tag_name in self._seed_tag_names()
        }

    def _seed_questions(self, users: dict[str, CustomUser], tags: dict[str, Tag]) -> dict[str, Question]:
        now = timezone.now()
        question_specs = {
            'protected': {
                'user': users['newcomer_local'],
                'title': '[seed] Почему Vue-компонент не обновляется после mutation?',
                'body': 'Проверочный вопрос новичка: нужен protected-window, теги и несколько комментариев.',
                'status': Question.Status.OPEN_STATUS,
                'tags': ['vue', 'typescript'],
                'created_at': now - timedelta(hours=1),
            },
            'm008_invite_flow': {
                'user': users['newcomer_local'],
                'title': '[seed][m008] Как вручную пригласить эксперта к protected-вопросу?',
                'body': (
                    'Чистый M008-сценарий без заранее созданных приглашений. '
                    'Войдите как newcomer_local, откройте вопрос и отправьте приглашение expert/master из панели вопроса.'
                ),
                'status': Question.Status.OPEN_STATUS,
                'tags': ['vue', 'reputation'],
                'created_at': now - timedelta(minutes=30),
            },
            'm008_active_invitation': {
                'user': users['newcomer_local'],
                'title': '[seed][m008] Активное приглашение эксперту: проверить уведомление и ответ',
                'body': (
                    'M008-сценарий с готовыми активными приглашениями для expert_local и master_local. '
                    'Получатели должны видеть карточки в профиле и доступный ответ на question detail.'
                ),
                'status': Question.Status.OPEN_STATUS,
                'tags': ['typescript', 'reputation'],
                'created_at': now - timedelta(hours=1),
            },
            'm008_expired_invitation': {
                'user': users['newcomer_local'],
                'title': '[seed][m008] Истёкшее приглашение при ещё активной защите',
                'body': 'M008-сценарий для проверки карточки уведомления с истёкшим TTL приглашения.',
                'status': Question.Status.OPEN_STATUS,
                'tags': ['django', 'reputation'],
                'created_at': now - timedelta(hours=2),
            },
            'm008_protected_ended': {
                'user': users['newcomer_local'],
                'title': '[seed][m008] Приглашение после завершения protected-window',
                'body': 'M008-сценарий для проверки состояния protected-window-ended в уведомлениях.',
                'status': Question.Status.OPEN_STATUS,
                'tags': ['docker', 'reputation'],
                'created_at': now - timedelta(hours=13),
            },
            'solved': {
                'user': users['participant_local'],
                'title': '[seed] Как настроить Django migrations в Docker Compose?',
                'body': 'Проверочный solved-вопрос с принятым ответом и голосами.',
                'status': Question.Status.SOLVED_STATUS,
                'tags': ['django', 'docker'],
                'created_at': now - timedelta(days=2),
            },
            'admin': {
                'user': users['expert_local'],
                'title': '[seed] Как проектировать audit trail для ручной репутации?',
                'body': 'Вопрос для проверки admin activity timeline и истории репутации.',
                'status': Question.Status.OPEN_STATUS,
                'tags': ['reputation', 'django'],
                'created_at': now - timedelta(days=1),
            },
        }

        questions = {}
        for key, spec in {**question_specs, **self._large_graph_question_specs(users, now)}.items():
            question, _ = Question.objects.update_or_create(
                question_title=spec['title'],
                defaults={
                    'user': spec['user'],
                    'question_body': spec['body'],
                    'question_status': spec['status'],
                },
            )
            Question.objects.filter(pk=question.pk).update(question_created_at=spec['created_at'])
            question.refresh_from_db()
            question.tags.set([tags[tag_name] for tag_name in spec['tags']])
            questions[key] = question
        return questions

    def _large_graph_question_specs(self, users: dict[str, CustomUser], now) -> dict[str, dict]:
        tag_windows = [
            ['python', 'django', 'drf', 'postgresql', 'api-design'],
            ['django', 'drf', 'jwt', 'reputation', 'api-design'],
            ['python', 'celery', 'redis', 'notifications', 'activity-ledger'],
            ['postgres-indexes', 'query-optimization', 'transactions', 'migrations', 'django'],
            ['vue', 'typescript', 'vite', 'pinia', 'vue-router'],
            ['vue', 'vitest', 'playwright', 'accessibility', 'frontend-performance'],
            ['knowledge-graph', 'concept-extraction', 'graph-privacy', 'activity-ledger', 'postgresql'],
            ['knowledge-graph', 'graph-visualization', 'cytoscape', 'typescript', 'accessibility'],
            ['expert-invitations', 'notifications', 'reputation', 'admin-panel', 'audit-trail'],
            ['docker', 'migrations', 'postgresql', 'redis', 'celery'],
            ['full-text-search', 'postgres-indexes', 'query-optimization', 'django', 'api-design'],
            ['graph-privacy', 'audit-trail', 'admin-panel', 'jwt', 'transactions'],
        ]
        users_cycle = [
            users['expert_local'],
            users['master_local'],
            users['expert_local'],
            users['participant_local'],
        ]
        specs = {}
        for index in range(36):
            window = tag_windows[index % len(tag_windows)]
            bridge = tag_windows[(index + 3) % len(tag_windows)][index % 3]
            tag_names = list(dict.fromkeys([*window, bridge]))[:5]
            owner = users_cycle[index % len(users_cycle)]
            specs[f'large_graph_{index + 1:02d}'] = {
                'user': owner,
                'title': f'[seed][graph-large] Сценарий {index + 1:02d}: связка {tag_names[0]} / {tag_names[1]} / {tag_names[2]}',
                'body': (
                    'Большой seed-граф для ручной проверки профиля. '
                    f'Вопрос связывает концепты: {", ".join(tag_names)}. '
                    'Нужен для проверки плотности узлов, соседей, весов и деталей выбранного концепта.'
                ),
                'status': Question.Status.OPEN_STATUS if index % 5 else Question.Status.SOLVED_STATUS,
                'tags': tag_names,
                'created_at': now - timedelta(days=3, hours=index),
            }
        return specs

    def _seed_solutions(self, users: dict[str, CustomUser], questions: dict[str, Question]) -> dict[str, Solution]:
        solution_specs = {
            **self._large_graph_solution_specs(users, questions),
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

    def _large_graph_solution_specs(
        self,
        users: dict[str, CustomUser],
        questions: dict[str, Question],
    ) -> dict[str, dict]:
        answerers = [
            users['master_local'],
            users['expert_local'],
            users['participant_local'],
            users['admin_local'],
        ]
        specs = {}
        for index in range(36):
            question_key = f'large_graph_{index + 1:02d}'
            question = questions[question_key]
            answerer = answerers[index % len(answerers)]
            if answerer.pk == question.user_id:
                answerer = answerers[(index + 1) % len(answerers)]
            specs[f'large_graph_answer_{index + 1:02d}'] = {
                'user': answerer,
                'question': question,
                'body': (
                    f'Seed-ответ для большого графа #{index + 1:02d}: добавляет posted-solution activity '
                    'и делает связи концептов заметнее в профиле отвечающего.'
                ),
                'is_best': index % 6 == 0,
            }
        return specs

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

    def _seed_m008_invitations(self, users: dict[str, CustomUser], questions: dict[str, Question]) -> None:
        active_question = questions['m008_active_invitation']
        expired_question = questions['m008_expired_invitation']
        ended_question = questions['m008_protected_ended']

        active_expires_at = active_question.question_created_at + ReputationService.get_protected_newcomer_window() * 2
        expired_expires_at = timezone.now() - timedelta(minutes=10)
        ended_expires_at = timezone.now() + timedelta(hours=4)

        self._upsert_invitation_notification(
            recipient=users['expert_local'],
            question=active_question,
            expires_at=active_expires_at,
            read=False,
        )
        self._upsert_invitation_notification(
            recipient=users['master_local'],
            question=active_question,
            expires_at=active_expires_at,
            read=True,
        )
        self._upsert_invitation_notification(
            recipient=users['expert_local'],
            question=expired_question,
            expires_at=expired_expires_at,
            read=False,
            title='Истёкшее приглашение ответить на защищённый вопрос',
        )
        self._upsert_invitation_notification(
            recipient=users['expert_local'],
            question=ended_question,
            expires_at=ended_expires_at,
            read=False,
            title='Приглашение к вопросу с завершённым protected-window',
        )

    def _upsert_invitation_notification(
        self,
        *,
        recipient: CustomUser,
        question: Question,
        expires_at,
        read: bool,
        title: str = 'Приглашение ответить на защищённый вопрос',
    ) -> None:
        dedupe_key = QuestionExpertInvitationService.build_dedupe_key(question.pk, recipient.pk)
        payload = self._build_m008_invitation_payload(recipient=recipient, question=question, expires_at=expires_at)
        read_at = timezone.now() if read else None

        Notification.objects.update_or_create(
            recipient=recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            dedupe_key=dedupe_key,
            defaults={
                'title': title,
                'message': f'Автор вопроса «{question.question_title}» приглашает вас помочь с ответом.',
                'payload': payload,
                'source_question': question,
                'expires_at': expires_at,
                'read_at': read_at,
            },
        )

    def _build_m008_invitation_payload(self, *, recipient: CustomUser, question: Question, expires_at) -> dict:
        author = question.user
        protection_state = QuestionProtectionService.get_protection_state(question)
        author_resolution = ReputationService.resolve_level(user=author)
        recipient_resolution = ReputationService.resolve_level(user=recipient)
        protected_until = protection_state.protected_until
        progress = getattr(protection_state, 'progress', None)

        return {
            'question_id': str(question.pk),
            'question_title': question.question_title,
            'question_status': question.question_status,
            'question_tags': list(question.tags.order_by('name').values_list('name', flat=True)),
            'author_id': str(author.pk),
            'author_name': author.user_name,
            'author_reputation_level': author_resolution.value,
            'author_reputation_level_label': author_resolution.label,
            'author_points_to_next_level': getattr(progress, 'points_to_next_level', None),
            'author_next_level': getattr(progress, 'next_level', None),
            'author_next_level_label': getattr(progress, 'next_level_label', None),
            'recipient_id': str(recipient.pk),
            'recipient_reputation_level': recipient_resolution.value,
            'recipient_reputation_level_label': recipient_resolution.label,
            'invitation_type': Notification.NotificationType.EXPERT_INVITATION,
            'invitation_status': 'active',
            'cta_url': f'/questions/{question.pk}',
            'expires_at': expires_at.isoformat(),
            'is_protected': protection_state.is_protected,
            'protection_reason_code': protection_state.reason_code,
            'protected_until': protected_until.isoformat() if protected_until else None,
            'protected_window_ended': not protection_state.is_protected,
        }

    def _rebuild_seed_knowledge_graph(self, users: dict[str, CustomUser]):
        seed_questions = Question.objects.filter(question_title__startswith='[seed]').order_by('pk')
        graph_summary = rebuild_structural_graph(queryset=seed_questions)
        activity_summary = rebuild_user_concept_activity(user_id=None)
        for user in users.values():
            mark_user_graph_fresh(user, phase='seed_local_data')
        return graph_summary, activity_summary

    def _refresh_tag_counters(self, tags: dict[str, Tag]) -> None:
        for tag in tags.values():
            tag.questions_count = tag.questions.count()
            tag.save(update_fields=['questions_count'])
