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
SEED_NOTE = 'Корректировка по итогам модераторской проверки профиля.'
LEGACY_SEED_EMAILS = [
    'admin.local@example.com',
    'newcomer.local@example.com',
    'participant.local@example.com',
    'expert.local@example.com',
    'master.local@example.com',
    'blocked.local@example.com',
    'moderated.local@example.com',
]


@dataclass(frozen=True)
class SeedUser:
    key: str
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
        key='admin_local',
        email='sofia.morozova@example.com',
        username='sofia_morozova',
        role=CustomUser.Roles.ADMIN_ROLE,
        score=420,
        bio='Технический администратор платформы: следит за качеством правок, репутацией и прозрачностью решений.',
        manual_level=CustomUser.ReputationLevel.MASTER,
        is_staff=True,
        is_superuser=True,
    ),
    SeedUser(
        key='newcomer_local',
        email='ivan.lebedev@example.com',
        username='ivan_lebedev',
        score=5,
        bio='Frontend-разработчик, переносит личный кабинет на Vue 3 и задает первые вопросы в сообществе.',
    ),
    SeedUser(
        key='participant_local',
        email='olga.sokolova@example.com',
        username='olga_sokolova',
        score=55,
        bio='Fullstack-разработчик: помогает с Docker Compose, миграциями и аккуратным оформлением вопросов.',
    ),
    SeedUser(
        key='expert_local',
        email='dmitry.volkov@example.com',
        username='dmitry_volkov',
        score=160,
        bio='Backend-эксперт по Django, DRF и PostgreSQL. Любит ответы с воспроизводимыми шагами и метриками.',
    ),
    SeedUser(
        key='master_local',
        email='maria.kim@example.com',
        username='maria_kim',
        score=360,
        bio='Архитектор frontend-платформы: развивает Vue, TypeScript, accessibility и практику экспертных ревью.',
    ),
    SeedUser(
        key='blocked_local',
        email='pavel.ivanov@example.com',
        username='pavel_ivanov',
        score=35,
        bio='Инженер поддержки, часто уточняет инфраструктурные детали и проверяет граничные сценарии.',
    ),
    SeedUser(
        key='moderated_local',
        email='elena.orlova@example.com',
        username='elena_orlova',
        score=18,
        bio='Редактор базы знаний: улучшает формулировки вопросов, приводит теги в порядок и помогает новичкам.',
        manual_level=CustomUser.ReputationLevel.EXPERT,
    ),
]


class Command(BaseCommand):
    help = 'Создает воспроизводимые демонстрационные данные для ручной проверки frontend/backend.'

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
            else:
                self._remove_legacy_seed_data()

            self._ensure_reputation_policy()
            users = self._seed_users()
            tags = self._seed_tags()
            questions = self._seed_questions(users, tags)
            solutions = self._seed_solutions(users, questions)
            self._seed_comments(users, questions, solutions)
            self._seed_votes(users, questions, solutions)
            self._seed_edit_history(users, questions, solutions, tags)
            self._seed_reputation_events(users, questions, solutions)
            self._seed_m008_invitations(users, questions)
            self._refresh_tag_counters(tags)
            graph_summary, activity_summary = self._rebuild_seed_knowledge_graph(users, questions)

        self.stdout.write(self.style.SUCCESS('Демонстрационные данные готовы.'))
        self.stdout.write('Аккаунты для входа:')
        for seed_user in SEED_USERS:
            self.stdout.write(f'- {seed_user.email} / {LOCAL_PASSWORD} ({seed_user.username})')
        self.stdout.write(
            'Большой граф знаний: войдите как dmitry.volkov@example.com или maria.kim@example.com '
            'и откройте профиль → Граф знаний.'
        )
        self.stdout.write(
            'Knowledge graph demo: '
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
        all_known_seed_emails = [*seed_emails, *LEGACY_SEED_EMAILS]
        seed_tag_names = self._seed_tag_names()
        UserConceptActivity.objects.filter(concept__slug__in=seed_tag_names).delete()
        QuestionConceptEdge.objects.filter(concept__slug__in=seed_tag_names).delete()
        ConceptTagMapping.objects.filter(tag__name__in=seed_tag_names).delete()
        KnowledgeConcept.objects.filter(slug__in=seed_tag_names).delete()
        Question.objects.filter(question_title__startswith='[seed]').delete()
        Question.objects.filter(question_title__in=self._seed_question_titles()).delete()
        Question.objects.filter(user__user_email__in=all_known_seed_emails).delete()
        CustomUser.objects.filter(user_email__in=all_known_seed_emails).delete()
        Tag.objects.filter(name__in=seed_tag_names).delete()

    def _remove_legacy_seed_data(self) -> None:
        Question.objects.filter(question_title__startswith='[seed]').delete()
        CustomUser.objects.filter(user_email__in=LEGACY_SEED_EMAILS).delete()

    def _ensure_reputation_policy(self) -> None:
        for level, minimum_score in ReputationLevelThreshold.DEFAULT_THRESHOLDS.items():
            threshold, _ = ReputationLevelThreshold.objects.update_or_create(
                level=level,
                defaults={
                    'minimum_score': minimum_score,
                    'is_active': True,
                    'description': 'Базовый порог для демонстрационного набора данных.',
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
            users[seed_user.key] = user
        return users

    def _seed_tag_names(self) -> list[str]:
        base_tags = ['django', 'vue', 'typescript', 'docker', 'reputation', 'postgresql']
        graph_tags = [tag for tag, *_ in self._large_graph_tag_topics()]
        return [*base_tags, *graph_tags]

    def _base_question_titles(self) -> dict[str, str]:
        return {
            'protected': 'Почему computed-свойство во Vue 3 перестает обновляться после деструктуризации props?',
            'm008_invite_flow': 'Как подключить эксперта к вопросу новичка, пока действует защита?',
            'm008_active_invitation': 'Как стабилизировать форму ответа, если эксперт подключается через приглашение?',
            'm008_expired_invitation': 'Что показывать эксперту, если приглашение к защищенному вопросу уже истекло?',
            'm008_protected_ended': 'Нужно ли сохранять приглашение после окончания защитного окна?',
            'solved': 'Как запускать миграции Django в Docker Compose без гонки с PostgreSQL?',
            'admin': 'Как спроектировать audit trail для ручных изменений репутации?',
        }

    def _seed_question_titles(self) -> list[str]:
        titles = list(self._base_question_titles().values())
        titles.extend(
            self._graph_question_title(index, tag_names)
            for index, (_, tag_names) in enumerate(self._large_graph_tag_windows(), start=1)
        )
        return titles

    def _large_graph_tag_windows(self) -> list[tuple[str, list[str]]]:
        profile_windows = [
            ('expert-strong', ['python', 'django', 'drf', 'postgresql', 'api-design'], 3),
            ('expert-growing', ['jwt', 'celery', 'redis', 'pytest', 'websocket'], 2),
            ('expert-weak', ['concept-extraction', 'graph-privacy', 'graph-visualization', 'cytoscape', 'activity-ledger'], 1),
            ('master-strong', ['vue', 'typescript', 'vite', 'pinia', 'vue-router'], 3),
            ('master-growing', ['vitest', 'playwright', 'accessibility', 'frontend-performance', 'knowledge-graph'], 2),
            ('master-weak', ['notifications', 'expert-invitations', 'admin-panel', 'audit-trail', 'full-text-search'], 1),
        ]
        filler_windows = [
            ['python', 'celery', 'redis', 'notifications', 'activity-ledger'],
            ['postgres-indexes', 'query-optimization', 'transactions', 'migrations', 'django'],
            ['vue', 'vitest', 'playwright', 'accessibility', 'frontend-performance'],
            ['knowledge-graph', 'concept-extraction', 'graph-privacy', 'activity-ledger', 'postgresql'],
            ['knowledge-graph', 'graph-visualization', 'cytoscape', 'typescript', 'accessibility'],
            ['expert-invitations', 'notifications', 'reputation', 'admin-panel', 'audit-trail'],
            ['docker', 'migrations', 'postgresql', 'redis', 'celery'],
            ['full-text-search', 'postgres-indexes', 'query-optimization', 'django', 'api-design'],
            ['graph-privacy', 'audit-trail', 'admin-panel', 'jwt', 'transactions'],
            ['django', 'drf', 'jwt', 'reputation', 'api-design'],
            ['vue', 'typescript', 'vite', 'pinia', 'vue-router'],
            ['knowledge-graph', 'concept-extraction', 'graph-visualization', 'cytoscape', 'activity-ledger'],
        ]

        windows = []
        for label, tag_names, repeat_count in profile_windows:
            windows.extend((label, tag_names) for _ in range(repeat_count))
        for filler_index in range(24):
            windows.append(('supporting-graph', filler_windows[filler_index % len(filler_windows)]))
        return windows

    def _tag_label(self, tag_name: str) -> str:
        labels = {
            'django': 'Django',
            'vue': 'Vue',
            'typescript': 'TypeScript',
            'docker': 'Docker',
            'reputation': 'Reputation',
            'postgresql': 'PostgreSQL',
        }
        labels.update({tag: title for tag, title, _ in self._large_graph_tag_topics()})
        return labels.get(tag_name, tag_name)

    def _graph_question_title(self, index: int, tag_names: list[str]) -> str:
        primary, secondary, third = [self._tag_label(tag_name) for tag_name in tag_names[:3]]
        templates = [
            'Как разделить ответственность между {primary} и {secondary}, если {third} уже в продакшене?',
            'Как диагностировать задержки в связке {primary}, {secondary} и {third}?',
            'Как выбрать границу модуля для {primary}, {secondary} и {third}?',
            'Почему после релиза проседает сценарий с {primary} и {secondary}?',
            'Как спланировать рефакторинг {primary}, не ломая {secondary}?',
            'Какие метрики собрать перед оптимизацией {primary} и {secondary}?',
            'Как безопасно внедрить {primary}, если команда уже использует {secondary}?',
            'Как организовать ревью изменений вокруг {primary} и {secondary}?',
            'Что проверить в первую очередь, когда {primary} конфликтует с {secondary}?',
            'Как оформить runbook для {primary}, {secondary} и {third}?',
            'Как уменьшить технический долг в зоне {primary} и {secondary}?',
            'Как объяснить команде trade-off между {primary}, {secondary} и {third}?',
        ]
        template_index = (index - 1 + (index - 1) // len(templates)) % len(templates)
        return templates[template_index].format(primary=primary, secondary=secondary, third=third)

    def _graph_question_body(self, tag_names: list[str]) -> str:
        labels = [self._tag_label(tag_name) for tag_name in tag_names]
        return (
            'В рабочем проекте эта зона стала точкой риска: изменения проходят ревью, '
            'но команда по-разному понимает границы ответственности и критерии готовности.\n\n'
            f'Контекст: {", ".join(labels)}. Нужен практичный порядок проверки: какие симптомы собрать, '
            'где провести границу между слоями и какие решения лучше принять до следующего релиза.'
        )

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
        titles = self._base_question_titles()
        question_specs = {
            'protected': {
                'user': users['newcomer_local'],
                'title': titles['protected'],
                'body': (
                    'Переношу карточку профиля на Composition API. После деструктуризации props '
                    'счетчик репутации меняется в ответе API, но computed в шаблоне остается со старым значением.\n\n'
                    'Как сохранить реактивность и не превращать компонент в набор ручных watcher-ов?'
                ),
                'status': Question.Status.OPEN_STATUS,
                'tags': ['vue', 'typescript'],
                'created_at': now - timedelta(hours=1),
            },
            'm008_invite_flow': {
                'user': users['newcomer_local'],
                'title': titles['m008_invite_flow'],
                'body': (
                    'Вопрос опубликован недавно, поэтому ответы доступны только участникам с высоким уровнем доверия. '
                    'Хочу позвать специалиста по Vue и репутации, но не понимаю, какие данные попадут в уведомление '
                    'и как потом отследить, что эксперт действительно подключился.'
                ),
                'status': Question.Status.OPEN_STATUS,
                'tags': ['vue', 'reputation'],
                'created_at': now - timedelta(minutes=30),
            },
            'm008_active_invitation': {
                'user': users['newcomer_local'],
                'title': titles['m008_active_invitation'],
                'body': (
                    'После публикации вопроса отправил приглашения двум экспертам. Нужно понять, как лучше оформить '
                    'ответ: оставить короткий workaround или сразу разобрать причину проблемы с типами и состоянием формы?'
                ),
                'status': Question.Status.OPEN_STATUS,
                'tags': ['typescript', 'reputation'],
                'created_at': now - timedelta(hours=1),
            },
            'm008_expired_invitation': {
                'user': users['newcomer_local'],
                'title': titles['m008_expired_invitation'],
                'body': (
                    'Приглашение отправили утром, но эксперт открыл профиль уже после истечения срока. '
                    'Нужно ли оставлять карточку в истории уведомлений и какую подсказку показать, чтобы состояние не выглядело ошибкой?'
                ),
                'status': Question.Status.OPEN_STATUS,
                'tags': ['django', 'reputation'],
                'created_at': now - timedelta(hours=2),
            },
            'm008_protected_ended': {
                'user': users['newcomer_local'],
                'title': titles['m008_protected_ended'],
                'body': (
                    'Защитное окно уже закончилось, но приглашение эксперту осталось в уведомлениях. '
                    'Как лучше показывать такой сценарий: как архивное событие, как обычную ссылку на вопрос или как просроченный призыв к действию?'
                ),
                'status': Question.Status.OPEN_STATUS,
                'tags': ['docker', 'reputation'],
                'created_at': now - timedelta(hours=13),
            },
            'solved': {
                'user': users['participant_local'],
                'title': titles['solved'],
                'body': (
                    'Backend и PostgreSQL стартуют вместе. Иногда приложение пытается применить миграции раньше, '
                    'чем база принимает подключения, и контейнер падает. Хочется оставить запуск простым для локальной команды, '
                    'но убрать гонку при первом поднятии окружения.'
                ),
                'status': Question.Status.SOLVED_STATUS,
                'tags': ['django', 'docker'],
                'created_at': now - timedelta(days=2),
            },
            'admin': {
                'user': users['expert_local'],
                'title': titles['admin'],
                'body': (
                    'Администраторы могут вручную менять уровень участника после модераторской проверки. '
                    'Нужно сохранить прозрачную историю: кто изменил репутацию, почему, какие данные видел модератор '
                    'и как потом показать это пользователю без лишних внутренних деталей.'
                ),
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
        profile_owners = {
            'expert-strong': users['expert_local'],
            'expert-growing': users['expert_local'],
            'expert-weak': users['expert_local'],
            'master-strong': users['master_local'],
            'master-growing': users['master_local'],
            'master-weak': users['master_local'],
        }
        filler_owners = [
            users['participant_local'],
            users['admin_local'],
            users['blocked_local'],
            users['moderated_local'],
        ]

        specs = {}
        filler_index = 0
        for index, (label, tag_names) in enumerate(self._large_graph_tag_windows(), start=1):
            if label == 'supporting-graph':
                owner = filler_owners[filler_index % len(filler_owners)]
                filler_index += 1
            else:
                owner = profile_owners[label]

            specs[f'large_graph_{index:02d}'] = {
                'user': owner,
                'title': self._graph_question_title(index, tag_names),
                'body': self._graph_question_body(tag_names),
                'status': Question.Status.OPEN_STATUS if index % 5 else Question.Status.SOLVED_STATUS,
                'tags': tag_names,
                'created_at': now - timedelta(days=3, hours=index - 1),
            }
        return specs

    def _seed_solutions(self, users: dict[str, CustomUser], questions: dict[str, Question]) -> dict[str, Solution]:
        solution_specs = {
            **self._large_graph_solution_specs(users, questions),
            'protected_answer': {
                'user': users['participant_local'],
                'question': questions['protected'],
                'body': (
                    'Во Vue 3 нельзя деструктурировать props как обычный объект, если потом ждете реактивные обновления. '
                    'Оставьте доступ через props.user или оберните нужные поля через toRefs/toRef.\n\n'
                    'Для вычисляемого значения лучше держать один источник данных и строить computed от него, '
                    'а watcher оставить только для побочных эффектов вроде аналитики.'
                ),
                'is_best': False,
            },
            'docker_answer': {
                'user': users['expert_local'],
                'question': questions['solved'],
                'body': (
                    'Разделите ожидание базы и применение миграций. В Compose можно добавить healthcheck для PostgreSQL, '
                    'а миграции запускать отдельным одноразовым сервисом перед основным backend.\n\n'
                    'Так команда видит явную ошибку миграции, а приложение не стартует в полусобранном состоянии.'
                ),
                'is_best': True,
            },
            'audit_answer': {
                'user': users['admin_local'],
                'question': questions['admin'],
                'body': (
                    'Я бы вынес ручные изменения в отдельный журнал: actor, target, причина, прежнее значение, новое значение, '
                    'комментарий модератора и timestamp. В пользовательском профиле показывайте короткую причину, '
                    'а внутренний комментарий оставляйте только администраторам.'
                ),
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
            users['participant_local'],
            users['admin_local'],
            users['blocked_local'],
            users['moderated_local'],
        ]
        specs = {}
        for index in range(36):
            question_key = f'large_graph_{index + 1:02d}'
            question = questions[question_key]
            answerer = answerers[index % len(answerers)]
            if answerer.pk == question.user_id:
                answerer = answerers[(index + 1) % len(answerers)]
            tag_names = list(question.tags.order_by('name').values_list('name', flat=True))
            tag_labels = [self._tag_label(tag_name) for tag_name in tag_names[:3]]
            specs[f'large_graph_answer_{index + 1:02d}'] = {
                'user': answerer,
                'question': question,
                'body': (
                    f'Я бы начал с короткого технического решения для {", ".join(tag_labels)}: '
                    'описать текущий симптом, добавить минимальный воспроизводимый пример и договориться, '
                    'какая метрика покажет, что проблема действительно ушла.\n\n'
                    'После этого стоит закрепить решение в ревью-чеклисте, чтобы похожие изменения не расходились '
                    'по проекту разными стилями.'
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
            (users['admin_local'], question_type, questions['admin'].pk, 'Проверьте, что ручная корректировка попадает в журнал и не раскрывает внутренний комментарий пользователю.'),
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
            question_edit_title_after='Как спроектировать audit trail для ручных изменений репутации в Django?',
            defaults={
                'reviewed_by': users['admin_local'],
                'question_edit_title_before': question.question_title,
                'question_edit_body_before': question.question_body,
                'question_edit_tags_before': ['reputation', 'django'],
                'question_edit_body_after': question.question_body + '\n\nОтдельно интересует, как связать этот журнал с Django admin и публичным API профиля.',
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
            solution_edit_body_after=solutions['docker_answer'].solution_body + '\n\nДобавьте явный healthcheck базы и таймаут, чтобы локальный старт не зависал без понятной ошибки.',
            defaults={
                'solution_edit_body_before': solutions['docker_answer'].solution_body,
                'solution_edit_is_approved': None,
            },
        )

    def _seed_reputation_events(self, users: dict[str, CustomUser], questions: dict[str, Question], solutions: dict[str, Solution]) -> None:
        question_type = ContentType.objects.get_for_model(Question)
        solution_type = ContentType.objects.get_for_model(Solution)
        ReputationTransaction.objects.update_or_create(
            user=users['expert_local'],
            actor=users['admin_local'],
            reputation_transaction_reason=ReputationTransaction.TransactionReason.BEST_SOLUTION,
            content_type=solution_type,
            object_id=solutions['docker_answer'].pk,
            defaults={
                'reputation_transaction_amount': 50,
                'note': SEED_NOTE + ' Принятый ответ с подробным разбором инфраструктурной проблемы.',
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
                'note': SEED_NOTE + ' Ручная корректировка после серии полезных редакторских правок.',
            },
        )
        ReputationTransaction.objects.update_or_create(
            user=users['expert_local'],
            actor=users['admin_local'],
            reputation_transaction_reason=ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
            content_type=question_type,
            object_id=questions['large_graph_04'].pk,
            defaults={
                'reputation_transaction_amount': 5,
                'note': SEED_NOTE + ' Вопрос помог связать backend-архитектуру с практикой ревью.',
            },
        )
        ReputationTransaction.objects.update_or_create(
            user=users['master_local'],
            actor=users['admin_local'],
            reputation_transaction_reason=ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
            content_type=question_type,
            object_id=questions['large_graph_13'].pk,
            defaults={
                'reputation_transaction_amount': 5,
                'note': SEED_NOTE + ' Вопрос помог уточнить frontend-подход для экспертной базы знаний.',
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

    def _rebuild_seed_knowledge_graph(self, users: dict[str, CustomUser], questions: dict[str, Question]):
        seed_questions = Question.objects.filter(
            pk__in=[question.pk for question in questions.values()]
        ).order_by('pk')
        graph_summary = rebuild_structural_graph(queryset=seed_questions)
        activity_summary = rebuild_user_concept_activity(user_id=None)
        for user in users.values():
            mark_user_graph_fresh(user, phase='seed_local_data')
        return graph_summary, activity_summary

    def _refresh_tag_counters(self, tags: dict[str, Tag]) -> None:
        for tag in tags.values():
            tag.questions_count = tag.questions.count()
            tag.save(update_fields=['questions_count'])
