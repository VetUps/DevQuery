from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from django.db import transaction
from django.db.models import F, QuerySet
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.knowledge.services import sync_question_graph
from ...user.models import CustomUser, ReputationTransaction
from ...user.services.reputation_service import ReputationService
from ..models import Question, QuestionEditEvent, QuestionEditProposal, QuestionRevision, Tag
from .question_tag_service import QuestionTagService


@dataclass(frozen=True)
class QuestionChangePayload:
    title: str
    body: str
    tags: list[str]


class QuestionEditService:
    APPROVED_EDIT_REPUTATION_AWARD = 2

    @staticmethod
    def _base_proposal_queryset() -> QuerySet[QuestionEditProposal]:
        return QuestionEditProposal.objects.select_related('question__user', 'author')

    @staticmethod
    def _base_revision_queryset() -> QuerySet[QuestionRevision]:
        return QuestionRevision.objects.select_related('question__user', 'actor').prefetch_related('tags')

    @staticmethod
    def _base_event_queryset() -> QuerySet[QuestionEditEvent]:
        return QuestionEditEvent.objects.select_related('question__user', 'actor', 'proposal')

    @staticmethod
    def get_proposal(proposal_id: str) -> QuestionEditProposal:
        try:
            return QuestionEditService._base_proposal_queryset().get(question_edit_id=proposal_id)
        except QuestionEditProposal.DoesNotExist:
            raise NotFound('Такой правки вопроса не существует')

    @staticmethod
    def get_question(question_id: str) -> Question:
        try:
            return Question.objects.select_related('user').prefetch_related('tags').get(question_id=question_id)
        except Question.DoesNotExist:
            raise NotFound('Такого вопроса не существует')

    @staticmethod
    @transaction.atomic
    def direct_edit(*, question: Question, actor: CustomUser, payload: QuestionChangePayload) -> Question:
        QuestionEditService._assert_question_author(question, actor)
        before_title = question.question_title
        before_body = question.question_body
        before_tags = QuestionEditService._extract_tag_names(question.tags.all())

        QuestionEditService._apply_current_state(question, payload)
        revision = QuestionEditService._create_revision(
            question=question,
            actor=actor,
            source=QuestionRevision.Source.DIRECT_EDIT,
            before_title=before_title,
            before_body=before_body,
            before_tags=before_tags,
            after_title=question.question_title,
            after_body=question.question_body,
            after_tags=payload.tags,
        )
        QuestionEditService._create_event(
            question=question,
            actor=actor,
            event_type=QuestionEditEvent.EventType.DIRECT_EDITED,
            proposal=None,
            revision=revision,
        )
        return question

    @staticmethod
    @transaction.atomic
    def create_proposal(*, question: Question, actor: CustomUser, payload: QuestionChangePayload) -> QuestionEditProposal:
        if question.user == actor:
            raise ValidationError('Автор вопроса может редактировать вопрос напрямую')

        if QuestionEditProposal.objects.filter(
            question=question,
            author=actor,
            question_edit_is_approved__isnull=True,
        ).exists():
            raise ValidationError('У вас уже есть ожидающая рассмотрения правка этого вопроса')

        proposal = QuestionEditProposal.objects.create(
            question=question,
            author=actor,
            question_edit_title_before=question.question_title,
            question_edit_body_before=question.question_body,
            question_edit_tags_before=QuestionEditService._extract_tag_names(question.tags.all()),
            question_edit_title_after=payload.title,
            question_edit_body_after=payload.body,
            question_edit_tags_after=payload.tags,
        )
        QuestionEditService._create_event(
            question=question,
            actor=actor,
            event_type=QuestionEditEvent.EventType.PROPOSED,
            proposal=proposal,
            revision=None,
        )
        return proposal

    @staticmethod
    @transaction.atomic
    def change_proposal_approval(*, proposal_id: str, actor: CustomUser, approved: bool) -> QuestionEditProposal:
        proposal = QuestionEditService.get_proposal(proposal_id)
        QuestionEditService._assert_question_author(proposal.question, actor)
        QuestionEditService._assert_proposal_pending(proposal)

        revision = None
        if approved:
            QuestionEditService._apply_current_state(
                proposal.question,
                QuestionChangePayload(
                    title=proposal.question_edit_title_after,
                    body=proposal.question_edit_body_after,
                    tags=list(proposal.question_edit_tags_after),
                ),
            )
            revision = QuestionEditService._create_revision(
                question=proposal.question,
                actor=actor,
                source=QuestionRevision.Source.APPROVED_PROPOSAL,
                before_title=proposal.question_edit_title_before,
                before_body=proposal.question_edit_body_before,
                before_tags=list(proposal.question_edit_tags_before),
                after_title=proposal.question.question_title,
                after_body=proposal.question.question_body,
                after_tags=list(proposal.question_edit_tags_after),
                proposal=proposal,
            )
            ReputationService.record_transaction(
                user=proposal.author,
                amount=QuestionEditService.APPROVED_EDIT_REPUTATION_AWARD,
                reason=ReputationTransaction.TransactionReason.APPROVED_EDIT,
                actor=actor,
                source=proposal,
                note='Награда за одобренную правку вопроса.',
            )

        proposal.question_edit_is_approved = approved
        proposal.reviewed_by = actor
        proposal.reviewed_at = proposal.reviewed_at or proposal.question.question_updated_at
        proposal.save(update_fields=['question_edit_is_approved', 'reviewed_by', 'reviewed_at'])

        QuestionEditService._create_event(
            question=proposal.question,
            actor=actor,
            event_type=(
                QuestionEditEvent.EventType.APPROVED
                if approved
                else QuestionEditEvent.EventType.REJECTED
            ),
            proposal=proposal,
            revision=revision,
        )
        return proposal

    @staticmethod
    def proposal_history(question_id: str) -> QuerySet[QuestionEditProposal]:
        question = QuestionEditService.get_question(question_id)
        return QuestionEditService._base_proposal_queryset().filter(question=question).order_by('-question_edit_edited_at')

    @staticmethod
    def pending_proposals(question_id: str, actor: CustomUser) -> QuerySet[QuestionEditProposal]:
        question = QuestionEditService.get_question(question_id)
        QuestionEditService._assert_question_author(question, actor)
        return QuestionEditService._base_proposal_queryset().filter(
            question=question,
            question_edit_is_approved__isnull=True,
        ).order_by('-question_edit_edited_at')

    @staticmethod
    def review_queue(actor: CustomUser) -> QuerySet[QuestionEditProposal]:
        return QuestionEditService._base_proposal_queryset().filter(
            question__user=actor,
            question_edit_is_approved__isnull=True,
        ).order_by('-question_edit_edited_at')

    @staticmethod
    def event_history(question_id: str) -> QuerySet[QuestionEditEvent]:
        question = QuestionEditService.get_question(question_id)
        return QuestionEditService._base_event_queryset().filter(question=question).order_by('created_at')

    @staticmethod
    def revision_history(question_id: str) -> QuerySet[QuestionRevision]:
        question = QuestionEditService.get_question(question_id)
        return QuestionEditService._base_revision_queryset().filter(question=question).order_by('created_at')

    @staticmethod
    def _assert_question_author(question: Question, actor: CustomUser) -> None:
        if question.user != actor:
            raise PermissionDenied('Вы не автор этого вопроса')

    @staticmethod
    def _assert_proposal_pending(proposal: QuestionEditProposal) -> None:
        if proposal.question_edit_is_approved is not None:
            raise ValidationError('Правка вопроса уже была одобрена или отклонена')

    @staticmethod
    def _apply_current_state(question: Question, payload: QuestionChangePayload) -> None:
        question.question_title = payload.title
        question.question_body = payload.body
        question.save(update_fields=['question_title', 'question_body', 'question_updated_at'])
        QuestionEditService._replace_question_tags(question, payload.tags)
        question.refresh_from_db()
        sync_question_graph(question)

    @staticmethod
    def _replace_question_tags(question: Question, normalized_tag_names: list[str]) -> None:
        current_names = set(question.tags.values_list('name', flat=True))
        next_names = set(normalized_tag_names)

        names_to_remove = current_names - next_names
        names_to_add = [name for name in normalized_tag_names if name not in current_names]

        if names_to_remove:
            removable_tags = list(Tag.objects.filter(name__in=names_to_remove))
            question.tags.remove(*removable_tags)
            Tag.objects.filter(pk__in=[tag.pk for tag in removable_tags]).update(
                questions_count=F('questions_count') - 1
            )

        if names_to_add:
            QuestionTagService.attach_tags_to_question(question, names_to_add)

        if hasattr(question, '_prefetched_objects_cache'):
            question._prefetched_objects_cache.pop('tags', None)

    @staticmethod
    def _create_revision(
        *,
        question: Question,
        actor: CustomUser,
        source: str,
        before_title: str,
        before_body: str,
        before_tags: list[str],
        after_title: str,
        after_body: str,
        after_tags: list[str],
        proposal: QuestionEditProposal | None = None,
    ) -> QuestionRevision:
        revision = QuestionRevision.objects.create(
            question=question,
            actor=actor,
            proposal=proposal,
            source=source,
            title_before=before_title,
            body_before=before_body,
            tags_before=before_tags,
            title_after=after_title,
            body_after=after_body,
            tags_after=after_tags,
        )
        tags = list(Tag.objects.filter(name__in=after_tags))
        if tags:
            revision.tags.set(tags)
        return revision

    @staticmethod
    def _create_event(
        *,
        question: Question,
        actor: CustomUser,
        event_type: str,
        proposal: QuestionEditProposal | None,
        revision: QuestionRevision | None,
    ) -> QuestionEditEvent:
        return QuestionEditEvent.objects.create(
            question=question,
            actor=actor,
            proposal=proposal,
            revision=revision,
            event_type=event_type,
        )

    @staticmethod
    def _extract_tag_names(tags: Iterable[Tag]) -> list[str]:
        return [tag.name for tag in tags]
