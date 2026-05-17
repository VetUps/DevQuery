from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from rest_framework.exceptions import ValidationError

from django.db.models import Sum, Q, Value, DecimalField, Count
from django.db.models.functions import Coalesce, Cast

from apps.knowledge.models import QuestionConceptEdge, UserConceptActivity
from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer
from apps.notifications.services import NotificationService
from apps.qa.models import Question, Solution
from apps.qa.services.question_protection_service import QuestionProtectionService
from apps.user.models import CustomUser
from apps.user.services.reputation_service import ReputationService


@dataclass(frozen=True)
class EligibleExpertsResult:
    slot_state: dict
    candidates: list[dict]


@dataclass(frozen=True)
class InvitationCreationResult:
    slot_state: dict
    invitations: list[dict]


@dataclass(frozen=True)
class InvitedExpertsResult:
    invitations: list[dict]


class QuestionExpertInvitationService:
    MAX_INVITES_PER_QUESTION = 5

    SLOTS_AVAILABLE = 'expert_invitation_slots_available'
    MAX_INVITES_EXCEEDED = 'expert_invitation_max_invites_exceeded'
    EMPTY_RECIPIENTS = 'expert_invitation_empty_recipients'
    DUPLICATE_RECIPIENT = 'expert_invitation_duplicate_recipient'
    NOT_QUESTION_AUTHOR = 'expert_invitation_not_question_author'
    QUESTION_NOT_PROTECTED = 'expert_invitation_question_not_protected'
    RECIPIENT_NOT_ELIGIBLE = 'expert_invitation_recipient_not_eligible'
    RECIPIENT_ALREADY_INVITED = 'expert_invitation_recipient_already_invited'
    INVALID_PROTECTION_STATE = 'expert_invitation_invalid_protection_state'

    ELIGIBLE_LEVELS = {
        CustomUser.ReputationLevel.EXPERT,
        CustomUser.ReputationLevel.MASTER,
    }

    ALLOWED_ORDERINGS = {'topic_strength', 'user_reputation_score', '-user_reputation_score'}

    @classmethod
    def build_dedupe_key(cls, question_id, recipient_id) -> str:
        return f'expert-invitation:{question_id}:{recipient_id}'

    @classmethod
    def get_eligible_experts(
        cls,
        question: Question,
        *,
        requester: CustomUser | None = None,
        search: str | None = None,
        ordering: str | None = None,
    ) -> EligibleExpertsResult:
        if requester is not None:
            cls._validate_author(question, requester)
            cls._validate_protection_state(question)

        if ordering not in cls.ALLOWED_ORDERINGS:
            ordering = 'topic_strength'

        invited_ids = cls._existing_invitation_queryset(question).values_list('recipient_id', flat=True)
        candidates = CustomUser.objects.filter(is_active=True).exclude(pk=question.user_id).exclude(pk__in=invited_ids)
        if search:
            candidates = candidates.filter(user_name__icontains=search)

        annotations = cls._get_topic_score_annotations(question)
        candidates = candidates.annotate(**annotations)

        if ordering == 'topic_strength':
            sort_order = ('-topic_score', '-user_reputation_score', 'user_name')
        elif ordering == 'user_reputation_score':
            sort_order = ('user_reputation_score', 'user_name')
        else: # -user_reputation_score
            sort_order = ('-user_reputation_score', 'user_name')

        serialized_candidates = [
            cls._serialize_candidate(user, resolution)
            for user in candidates.order_by(*sort_order)
            if (resolution := ReputationService.resolve_level(user=user)).value in cls.ELIGIBLE_LEVELS
        ]

        return EligibleExpertsResult(
            slot_state=cls._build_slot_state(question),
            candidates=serialized_candidates,
        )

    @classmethod
    def get_invited_experts(
        cls,
        question: Question,
        *,
        requester: CustomUser,
    ) -> InvitedExpertsResult:
        cls._validate_author(question, requester)
        invitations = [
            cls._serialize_invited_expert(notification)
            for notification in cls._existing_invitation_queryset(question)
            .select_related('recipient', 'source_question')
            .order_by('-created_at', 'notification_id')
        ]
        return InvitedExpertsResult(invitations=invitations)

    @classmethod
    def create_invitations(
        cls,
        *,
        question: Question,
        requester: CustomUser,
        recipient_ids,
    ) -> InvitationCreationResult:
        normalized_recipient_ids = cls._normalize_recipient_ids(recipient_ids)

        with transaction.atomic():
            cls._validate_author(question, requester)
            protection_state = cls._validate_protection_state(question)

            existing_invitation_qs = cls._existing_invitation_queryset(question).select_for_update()
            existing_count = existing_invitation_qs.count()
            existing_recipient_ids = set(existing_invitation_qs.values_list('recipient_id', flat=True))
            requested_recipient_ids = set(normalized_recipient_ids)

            already_invited_ids = requested_recipient_ids & existing_recipient_ids
            if already_invited_ids:
                cls._raise_validation(
                    cls.RECIPIENT_ALREADY_INVITED,
                    recipient_ids=[str(recipient_id) for recipient_id in sorted(already_invited_ids, key=str)],
                )

            if existing_count + len(normalized_recipient_ids) > cls.MAX_INVITES_PER_QUESTION:
                cls._raise_validation(
                    cls.MAX_INVITES_EXCEEDED,
                    max_invites=cls.MAX_INVITES_PER_QUESTION,
                    used=existing_count,
                    requested=len(normalized_recipient_ids),
                )

            eligible_recipients_by_id = cls._eligible_recipients_by_id(normalized_recipient_ids)
            missing_or_ineligible_ids = [
                recipient_id for recipient_id in normalized_recipient_ids if recipient_id not in eligible_recipients_by_id
            ]
            if missing_or_ineligible_ids:
                cls._raise_validation(
                    cls.RECIPIENT_NOT_ELIGIBLE,
                    recipient_ids=[str(recipient_id) for recipient_id in missing_or_ineligible_ids],
                )

            expires_at = question.question_created_at + ReputationService.get_protected_newcomer_window() * 2
            base_payload = cls._build_base_payload(
                question=question,
                requester=requester,
                protection_state=protection_state,
                expires_at=expires_at,
            )
            notifications = []
            for recipient_id in normalized_recipient_ids:
                recipient = eligible_recipients_by_id[recipient_id]
                notification = NotificationService.create_notification(
                    recipient=recipient,
                    notification_type=Notification.NotificationType.EXPERT_INVITATION,
                    title='Приглашение ответить на защищённый вопрос',
                    message=f'Автор вопроса «{question.question_title}» приглашает вас помочь с ответом.',
                    payload=cls._build_payload(base_payload=base_payload, recipient=recipient),
                    source_question=question,
                    expires_at=expires_at,
                    dedupe_key=cls.build_dedupe_key(question.pk, recipient.pk),
                )
                notifications.append(notification)

            return InvitationCreationResult(
                slot_state=cls._build_slot_state(question, used=existing_count + len(notifications)),
                invitations=[cls._serialize_invitation(notification) for notification in notifications],
            )

    @classmethod
    def _normalize_recipient_ids(cls, recipient_ids) -> list[UUID]:
        if not recipient_ids:
            cls._raise_validation(cls.EMPTY_RECIPIENTS)

        normalized_ids = []
        seen_ids = set()
        for raw_recipient_id in recipient_ids:
            try:
                recipient_id = raw_recipient_id if isinstance(raw_recipient_id, UUID) else UUID(str(raw_recipient_id))
            except (TypeError, ValueError, AttributeError) as exc:
                raise ValidationError(
                    {
                        'code': cls.RECIPIENT_NOT_ELIGIBLE,
                        'recipient_ids': [str(raw_recipient_id)],
                    }
                ) from exc

            if recipient_id in seen_ids:
                cls._raise_validation(cls.DUPLICATE_RECIPIENT, recipient_id=str(recipient_id))
            seen_ids.add(recipient_id)
            normalized_ids.append(recipient_id)

        return normalized_ids

    @classmethod
    def _validate_author(cls, question: Question, requester: CustomUser) -> None:
        if question.user_id != requester.pk:
            cls._raise_validation(cls.NOT_QUESTION_AUTHOR)

    @classmethod
    def _validate_protection_state(cls, question: Question):
        state = QuestionProtectionService.get_protection_state(question)
        required_state_attributes = [
            'is_protected',
            'protected_until',
            'reason_code',
            'author_level',
            'author_level_label',
            'progress',
        ]
        if any(not hasattr(state, attribute) for attribute in required_state_attributes):
            cls._raise_validation(cls.INVALID_PROTECTION_STATE)
        required_progress_attributes = [
            'points_to_next_level',
            'next_level',
            'next_level_label',
        ]
        if any(not hasattr(state.progress, attribute) for attribute in required_progress_attributes):
            cls._raise_validation(cls.INVALID_PROTECTION_STATE)
        if not state.is_protected:
            cls._raise_validation(cls.QUESTION_NOT_PROTECTED)
        return state

    @classmethod
    def _eligible_recipients_by_id(cls, recipient_ids: list[UUID]) -> dict[UUID, CustomUser]:
        candidates = CustomUser.objects.filter(pk__in=recipient_ids, is_active=True)
        eligible = {}
        for user in candidates:
            resolution = ReputationService.resolve_level(user=user)
            if resolution.value in cls.ELIGIBLE_LEVELS:
                eligible[user.pk] = user
        return eligible

    @classmethod
    def _existing_invitation_queryset(cls, question: Question):
        return Notification.objects.filter(
            source_question=question,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
        )

    @classmethod
    def _build_slot_state(cls, question: Question, *, used: int | None = None) -> dict:
        used_count = cls._existing_invitation_queryset(question).count() if used is None else used
        remaining = max(cls.MAX_INVITES_PER_QUESTION - used_count, 0)
        return {
            'max': cls.MAX_INVITES_PER_QUESTION,
            'used': used_count,
            'remaining': remaining,
            'can_invite': remaining > 0,
            'reason_code': cls.SLOTS_AVAILABLE if remaining > 0 else cls.MAX_INVITES_EXCEEDED,
        }

    @classmethod
    def _serialize_candidate(cls, user: CustomUser, resolution) -> dict:
        return {
            'user_id': str(user.pk),
            'user_name': user.user_name,
            'user_reputation_score': user.user_reputation_score,
            'reputation_level': resolution.value,
            'reputation_level_label': resolution.label,
            'is_manual_override': resolution.is_manual_override,
            'topic_score': float(getattr(user, 'topic_score', 0)),
            'topic_match_count': int(getattr(user, 'topic_match_count', 0)),
        }

    @classmethod
    def _get_topic_score_annotations(cls, question: Question):
        concept_ids = list(QuestionConceptEdge.objects.filter(question=question).values_list('concept_id', flat=True))

        if concept_ids:
            return {
                'topic_score': Coalesce(
                    Sum('concept_activities__weight_delta', filter=Q(concept_activities__concept_id__in=concept_ids)),
                    Value(0, output_field=DecimalField())
                ),
                'topic_match_count': Count(
                    'concept_activities',
                    filter=Q(concept_activities__concept_id__in=concept_ids),
                    distinct=True
                )
            }

        # Fallback to tag overlap
        tag_ids = list(question.tags.values_list('id', flat=True))
        if tag_ids:
            return {
                'topic_score': Cast(
                    Count('solution', filter=Q(solution__question__tags__id__in=tag_ids), distinct=True),
                    output_field=DecimalField()
                ),
                'topic_match_count': Cast(
                    Count('solution__question__tags', filter=Q(solution__question__tags__id__in=tag_ids), distinct=True),
                    output_field=DecimalField()
                )
            }

        return {
            'topic_score': Value(0, output_field=DecimalField()),
            'topic_match_count': Value(0, output_field=DecimalField())
        }

    @classmethod
    def _build_base_payload(cls, *, question: Question, requester: CustomUser, protection_state, expires_at) -> dict:
        protected_until = protection_state.protected_until
        return {
            'question_id': str(question.pk),
            'question_title': question.question_title,
            'question_status': question.question_status,
            'question_tags': list(question.tags.order_by('name').values_list('name', flat=True)),
            'author_id': str(requester.pk),
            'author_name': requester.user_name,
            'author_reputation_level': protection_state.author_level,
            'author_reputation_level_label': protection_state.author_level_label,
            'author_points_to_next_level': protection_state.progress.points_to_next_level,
            'author_next_level': protection_state.progress.next_level,
            'author_next_level_label': protection_state.progress.next_level_label,
            'invitation_type': Notification.NotificationType.EXPERT_INVITATION,
            'invitation_status': 'active',
            'cta_url': f'/questions/{question.pk}',
            'expires_at': expires_at.isoformat(),
            'is_protected': protection_state.is_protected,
            'protection_reason_code': protection_state.reason_code,
            'protected_until': protected_until.isoformat() if protected_until else None,
            'protected_window_ended': not protection_state.is_protected,
        }

    @classmethod
    def _build_payload(cls, *, base_payload: dict, recipient: CustomUser) -> dict:
        recipient_resolution = ReputationService.resolve_level(user=recipient)
        payload = dict(base_payload)
        payload.update(
            {
                'recipient_id': str(recipient.pk),
                'recipient_reputation_level': recipient_resolution.value,
                'recipient_reputation_level_label': recipient_resolution.label,
            }
        )
        return payload

    @classmethod
    def _serialize_invited_expert(cls, notification: Notification) -> dict:
        recipient = notification.recipient
        recipient_resolution = ReputationService.resolve_level(user=recipient)
        notification_metadata = NotificationSerializer(notification).data
        return {
            'recipient_id': str(recipient.pk),
            'recipient_name': recipient.user_name,
            'recipient_reputation_score': recipient.user_reputation_score,
            'reputation_level': recipient_resolution.value,
            'reputation_level_label': recipient_resolution.label,
            'notification_id': str(notification.pk),
            'is_read': notification.read_at is not None,
            'read_at': notification.read_at,
            'invitation_status': notification_metadata['invitation_status'],
            'protected_window_active': notification_metadata['protected_window_active'],
            'protected_until': notification_metadata['protected_until'],
        }

    @classmethod
    def _serialize_invitation(cls, notification: Notification) -> dict:
        return {
            'notification_id': str(notification.pk),
            'recipient_id': str(notification.recipient_id),
            'source_question_id': str(notification.source_question_id),
            'dedupe_key': notification.dedupe_key,
            'expires_at': notification.expires_at,
            'payload': notification.payload,
        }

    @classmethod
    def _raise_validation(cls, code: str, **details) -> None:
        payload = {'code': code}
        payload.update(details)
        raise ValidationError(payload)
