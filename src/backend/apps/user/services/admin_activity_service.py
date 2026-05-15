from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from apps.qa.models import (
    Comment,
    Question,
    QuestionEditEvent,
    QuestionEditProposal,
    QuestionRevision,
    Solution,
    SolutionEdits,
    Vote,
)
from apps.user.models import CustomUser, ReputationTransaction


@dataclass(frozen=True)
class AdminActivityItem:
    id: str
    type: str
    occurred_at: Any
    title: str
    summary: str
    target_label: str
    route: dict[str, str]

    def as_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'type': self.type,
            'occurred_at': self.occurred_at,
            'title': self.title,
            'summary': self.summary,
            'target_label': self.target_label,
            'route': self.route,
        }


class AdminActivityService:
    DEFAULT_LIMIT = 10
    MAX_LIMIT = 50
    ALLOWED_TYPES = {
        'question',
        'solution',
        'comment',
        'vote',
        'solution_edit',
        'question_edit_proposal',
        'question_revision',
        'question_edit_event',
        'reputation',
    }

    @classmethod
    def timeline(
        cls,
        *,
        user: CustomUser,
        activity_types: Iterable[str] | None = None,
        page: int = 1,
        page_size: int = DEFAULT_LIMIT,
    ) -> tuple[list[dict[str, Any]], int]:
        normalized_page = max(1, int(page))
        normalized_limit = max(0, min(int(page_size), cls.MAX_LIMIT))
        if normalized_limit == 0:
            return [], 0

        requested_types = set(activity_types or cls.ALLOWED_TYPES)
        items: list[AdminActivityItem] = []

        collectors = {
            'question': cls._questions,
            'solution': cls._solutions,
            'comment': cls._comments,
            'vote': cls._votes,
            'solution_edit': cls._solution_edits,
            'question_edit_proposal': cls._question_edit_proposals,
            'question_revision': cls._question_revisions,
            'question_edit_event': cls._question_edit_events,
            'reputation': cls._reputation_events,
        }
        counts = {
            'question': lambda u: Question.objects.filter(user=u).count(),
            'solution': lambda u: Solution.objects.filter(user=u).count(),
            'comment': lambda u: Comment.objects.filter(user=u).count(),
            'vote': lambda u: Vote.objects.filter(user=u).count(),
            'solution_edit': lambda u: SolutionEdits.objects.filter(user=u).count(),
            'question_edit_proposal': lambda u: QuestionEditProposal.objects.filter(author=u).count(),
            'question_revision': lambda u: QuestionRevision.objects.filter(actor=u).count(),
            'question_edit_event': lambda u: QuestionEditEvent.objects.filter(actor=u).count(),
            'reputation': lambda u: ReputationTransaction.objects.filter(user=u).count(),
        }

        total_count = 0
        fetch_limit = normalized_page * normalized_limit

        for activity_type in sorted(requested_types):
            collector = collectors.get(activity_type)
            counter = counts.get(activity_type)
            if collector is not None and counter is not None:
                total_count += counter(user)
                items.extend(collector(user, fetch_limit))

        items.sort(key=lambda item: item.occurred_at, reverse=True)
        
        offset = (normalized_page - 1) * normalized_limit
        page_items = items[offset : offset + normalized_limit]
        
        return [item.as_dict() for item in page_items], total_count

    @staticmethod
    def _question_label(question: Question | None) -> str:
        if question is None:
            return 'Вопрос недоступен'
        return question.question_title or 'Вопрос без названия'

    @classmethod
    def _solution_label(cls, solution: Solution | None) -> str:
        if solution is None:
            return 'Решение недоступно'
        return f'Решение для вопроса: {cls._question_label(solution.question)}'

    @classmethod
    def _generic_target_label(cls, target: Any) -> str:
        if isinstance(target, Question):
            return cls._question_label(target)
        if isinstance(target, Solution):
            return cls._solution_label(target)
        if target is None:
            return 'Объект недоступен'
        return str(target)

    @staticmethod
    def _question_route(question: Question | None) -> dict[str, str]:
        if question is None:
            return {}
        return {'kind': 'question', 'question_id': str(question.question_id)}

    @classmethod
    def _solution_route(cls, solution: Solution | None) -> dict[str, str]:
        if solution is None:
            return {}
        route = {'kind': 'solution', 'solution_id': str(solution.solution_id)}
        if solution.question_id:
            route['question_id'] = str(solution.question_id)
        return route

    @staticmethod
    def _actor_label(actor: CustomUser | None) -> str:
        return actor.user_name if actor else 'Неизвестный пользователь'

    @classmethod
    def _questions(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        return [
            AdminActivityItem(
                id=str(question.question_id),
                type='question',
                occurred_at=question.question_created_at,
                title='Вопрос создан',
                summary='Создал вопрос.',
                target_label=cls._question_label(question),
                route=cls._question_route(question),
            )
            for question in Question.objects.filter(user=user).order_by('-question_created_at')[:limit]
        ]

    @classmethod
    def _solutions(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        return [
            AdminActivityItem(
                id=str(solution.solution_id),
                type='solution',
                occurred_at=solution.solution_created_at,
                title='Решение опубликовано',
                summary='Опубликовал решение.',
                target_label=cls._question_label(solution.question),
                route=cls._solution_route(solution),
            )
            for solution in Solution.objects.select_related('question').filter(user=user).order_by('-solution_created_at')[:limit]
        ]

    @classmethod
    def _comments(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        comments = list(Comment.objects.select_related('content_type').filter(user=user).order_by('-created_at')[:limit])
        target_info = cls._generic_target_info(comments)
        items = []
        for comment in comments:
            target_label, route = target_info.get(
                (comment.content_type_id, str(comment.object_id)),
                ('Объект недоступен', {}),
            )
            items.append(
                AdminActivityItem(
                    id=str(comment.comment_id),
                    type='comment',
                    occurred_at=comment.created_at,
                    title='Комментарий добавлен',
                    summary='Добавил комментарий.',
                    target_label=target_label,
                    route=route,
                )
            )
        return items

    @classmethod
    def _votes(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        votes = list(Vote.objects.select_related('content_type').filter(user=user).order_by('-created_at')[:limit])
        target_info = cls._generic_target_info(votes)
        items = []
        for vote in votes:
            target_label, route = target_info.get(
                (vote.content_type_id, str(vote.object_id)),
                ('Объект недоступен', {}),
            )
            vote_label = 'Голос за' if vote.vote_type == Vote.VoteType.UPVOTE else 'Голос против'
            items.append(
                AdminActivityItem(
                    id=str(vote.vote_id),
                    type='vote',
                    occurred_at=vote.created_at,
                    title='Голос учтён',
                    summary=f'{vote_label} материал.',
                    target_label=target_label,
                    route=route,
                )
            )
        return items

    @classmethod
    def _solution_edits(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        items = []
        queryset = (
            SolutionEdits.objects.select_related('solution', 'solution__question')
            .filter(user=user)
            .order_by('-solution_edit_edited_at')[:limit]
        )
        for edit in queryset:
            if edit.solution_edit_is_approved is True:
                status = 'одобрено'
            elif edit.solution_edit_is_approved is False:
                status = 'отклонено'
            else:
                status = 'на рассмотрении'
            items.append(
                AdminActivityItem(
                    id=str(edit.solution_edit_id),
                    type='solution_edit',
                    occurred_at=edit.solution_edit_edited_at,
                    title='Предложена правка решения',
                    summary=f'Предложил правку решения ({status}).',
                    target_label=cls._solution_label(edit.solution),
                    route=cls._solution_route(edit.solution),
                )
            )
        return items

    @classmethod
    def _question_edit_proposals(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        items = []
        queryset = (
            QuestionEditProposal.objects.select_related('question')
            .filter(author=user)
            .order_by('-question_edit_edited_at')[:limit]
        )
        for proposal in queryset:
            if proposal.question_edit_is_approved is True:
                status = 'одобрено'
            elif proposal.question_edit_is_approved is False:
                status = 'отклонено'
            else:
                status = 'на рассмотрении'
            items.append(
                AdminActivityItem(
                    id=str(proposal.question_edit_id),
                    type='question_edit_proposal',
                    occurred_at=proposal.question_edit_edited_at,
                    title='Предложена правка вопроса',
                    summary=f'Предложил правку вопроса ({status}).',
                    target_label=cls._question_label(proposal.question),
                    route=cls._question_route(proposal.question),
                )
            )
        return items

    @classmethod
    def _question_revisions(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        return [
            AdminActivityItem(
                id=str(revision.revision_id),
                type='question_revision',
                occurred_at=revision.created_at,
                title='Создана ревизия вопроса',
                summary=f'Создал ревизию вопроса из {revision.source}.',
                target_label=cls._question_label(revision.question),
                route=cls._question_route(revision.question),
            )
            for revision in QuestionRevision.objects.select_related('question').filter(actor=user).order_by('-created_at')[:limit]
        ]

    @classmethod
    def _question_edit_events(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        return [
            AdminActivityItem(
                id=str(event.event_id),
                type='question_edit_event',
                occurred_at=event.created_at,
                title='Событие правки вопроса',
                summary=f'Событие правки: {event.event_type}.',
                target_label=cls._question_label(event.question),
                route=cls._question_route(event.question),
            )
            for event in QuestionEditEvent.objects.select_related('question').filter(actor=user).order_by('-created_at')[:limit]
        ]

    @classmethod
    def _reputation_events(cls, user: CustomUser, limit: int) -> list[AdminActivityItem]:
        # Localize the reason key if needed, or rely on frontend if the reason is a string token.
        # But here we format a string. The reason is usually string constants like `solution_upvoted` or `manual_level_override`.
        # To make it readable without mapping here, let's keep the raw reason but translate the wrapper,
        # or better yet, since the frontend `formatReputationReason` knows them, it will translate the reason.
        # Wait! In `AdminUserActivityTimeline.vue`, we have:
        # <p class="admin-activity__item-summary">{{ item.summary }}</p>
        # So it just prints `summary`. I should map it here or at least translate the template.
        return [
            AdminActivityItem(
                id=str(transaction.reputation_transaction_id),
                type='reputation',
                occurred_at=transaction.created_at,
                title='Изменение репутации',
                summary=(
                    f'Причина ({transaction.reputation_transaction_reason}): '
                    f'{transaction.reputation_transaction_amount:+d} от {cls._actor_label(transaction.actor)}.'
                ),
                target_label='Журнал репутации',
                route={'kind': 'reputation'},
            )
            for transaction in ReputationTransaction.objects.select_related('actor')
            .filter(user=user)
            .order_by('-created_at')[:limit]
        ]

    @classmethod
    def _route_for_generic_target(cls, target: Any) -> dict[str, str]:
        if isinstance(target, Question):
            return cls._question_route(target)
        if isinstance(target, Solution):
            return cls._solution_route(target)
        return {}

    @classmethod
    def _generic_target_info(cls, objects: Iterable[Any]) -> dict[tuple[int, str], tuple[str, dict[str, str]]]:
        question_keys = set()
        solution_keys = set()
        for obj in objects:
            model = obj.content_type.model if obj.content_type_id else None
            key = (obj.content_type_id, str(obj.object_id))
            if model == 'question':
                question_keys.add(key)
            elif model == 'solution':
                solution_keys.add(key)

        target_info: dict[tuple[int, str], tuple[str, dict[str, str]]] = {}
        if question_keys:
            ids = [object_id for _, object_id in question_keys]
            content_type_id = next(content_type_id for content_type_id, _ in question_keys)
            for question in Question.objects.filter(question_id__in=ids):
                target_info[(content_type_id, str(question.question_id))] = (
                    cls._question_label(question),
                    cls._question_route(question),
                )
        if solution_keys:
            ids = [object_id for _, object_id in solution_keys]
            content_type_id = next(content_type_id for content_type_id, _ in solution_keys)
            for solution in Solution.objects.select_related('question').filter(solution_id__in=ids):
                target_info[(content_type_id, str(solution.solution_id))] = (
                    cls._solution_label(solution),
                    cls._solution_route(solution),
                )
        return target_info
