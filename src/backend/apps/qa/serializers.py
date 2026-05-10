import re

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import TextChoices
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.knowledge.services import sync_authored_question_activity, sync_question_graph
from apps.user.models import CustomUser
from .models import (
    Question,
    QuestionEditEvent,
    QuestionEditProposal,
    QuestionRevision,
    Solution,
    SolutionEdits,
    Comment,
    Vote,
    Tag,
)
from .services.question_edit_service import QuestionChangePayload, QuestionEditService
from .services.question_protection_service import QuestionProtectionService
from .services.question_tag_service import QuestionTagService
from .services.vote_service import VoteService


MAX_QUESTION_TAGS = 5
TAG_NAME_PATTERN = re.compile(r'^[a-z0-9-]+$')
PROTECTED_NEWCOMER_ANSWER_ERROR_CODE = 'protected_newcomer_answer_required'


def normalize_question_tags(raw_tags):
    if not isinstance(raw_tags, list):
        raise serializers.ValidationError('Теги должны быть списком строк.')

    normalized_tags = []
    seen_tags = set()

    for raw_tag in raw_tags:
        if not isinstance(raw_tag, str):
            raise serializers.ValidationError('Каждый тег должен быть строкой.')

        normalized_tag = raw_tag.strip().lower()

        if not normalized_tag:
            raise serializers.ValidationError('Тег не может быть пустым.')

        if not TAG_NAME_PATTERN.fullmatch(normalized_tag):
            raise serializers.ValidationError('Тег может содержать только латинские буквы, цифры и дефисы.')

        if normalized_tag not in seen_tags:
            seen_tags.add(normalized_tag)
            normalized_tags.append(normalized_tag)

        if len(normalized_tags) > MAX_QUESTION_TAGS:
            raise serializers.ValidationError(f'У вопроса не может быть больше {MAX_QUESTION_TAGS} тегов.')

    return normalized_tags


class QuestionTagNameField(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError('Каждый тег должен быть строкой.')
        return super().to_internal_value(data)


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['name', 'questions_count']
        read_only_fields = fields


class QuestionProtectionMixin:
    protection_field_names = [
        'is_protected',
        'protection_reason_code',
        'protected_until',
        'author_level',
        'author_points_to_next_level',
        'author_next_level',
        'author_next_level_label',
        'viewer_can_answer',
        'viewer_answer_reason_code',
        'viewer_answer_reason_message',
        'viewer_answer_required_level',
        'viewer_answer_required_level_label',
        'viewer_level',
        'viewer_level_label',
        'viewer_points_to_next_level',
        'viewer_next_level',
        'viewer_next_level_label',
        'viewer_can_downvote',
        'viewer_downvote_reason_code',
        'viewer_downvote_reason_message',
    ]

    def _get_request_user(self):
        request = self.context.get('request')
        if request is None:
            return None

        user = getattr(request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return None

        return user

    def _get_protection_state(self, obj: Question):
        return QuestionProtectionService.get_protection_state(obj)

    def _get_answer_decision(self, obj: Question):
        return QuestionProtectionService.get_answer_eligibility(obj, self._get_request_user())

    def _get_downvote_decision(self, obj: Question):
        return QuestionProtectionService.get_question_downvote_eligibility(obj, self._get_request_user())

    def get_is_protected(self, obj: Question):
        return self._get_protection_state(obj).is_protected

    def get_protection_reason_code(self, obj: Question):
        return self._get_protection_state(obj).reason_code

    def get_protected_until(self, obj: Question):
        return self._get_protection_state(obj).protected_until

    def get_author_level(self, obj: Question):
        return self._get_protection_state(obj).author_level

    def get_author_points_to_next_level(self, obj: Question):
        return self._get_protection_state(obj).progress.points_to_next_level

    def get_author_next_level(self, obj: Question):
        return self._get_protection_state(obj).progress.next_level

    def get_author_next_level_label(self, obj: Question):
        return self._get_protection_state(obj).progress.next_level_label

    def get_viewer_can_answer(self, obj: Question):
        return self._get_answer_decision(obj).allowed

    def get_viewer_answer_reason_code(self, obj: Question):
        return self._get_answer_decision(obj).reason_code

    def get_viewer_answer_reason_message(self, obj: Question):
        answer_decision = self._get_answer_decision(obj)
        return QuestionProtectionService.build_answer_reason_message(
            answer_decision.reason_code,
            answer_decision,
        )

    def get_viewer_answer_required_level(self, obj: Question):
        return self._get_answer_decision(obj).required_level

    def get_viewer_answer_required_level_label(self, obj: Question):
        return self._get_answer_decision(obj).required_level_label

    def get_viewer_level(self, obj: Question):
        answer_decision = self._get_answer_decision(obj)
        if answer_decision.viewer_level is not None:
            return answer_decision.viewer_level

        return self._get_downvote_decision(obj).viewer_level

    def get_viewer_level_label(self, obj: Question):
        answer_decision = self._get_answer_decision(obj)
        if answer_decision.viewer_level_label is not None:
            return answer_decision.viewer_level_label

        return self._get_downvote_decision(obj).viewer_level_label

    def get_viewer_points_to_next_level(self, obj: Question):
        answer_decision = self._get_answer_decision(obj)
        if answer_decision.points_to_next_level is not None:
            return answer_decision.points_to_next_level

        return self._get_downvote_decision(obj).points_to_next_level

    def get_viewer_next_level(self, obj: Question):
        answer_decision = self._get_answer_decision(obj)
        if answer_decision.next_level is not None:
            return answer_decision.next_level

        return self._get_downvote_decision(obj).next_level

    def get_viewer_next_level_label(self, obj: Question):
        answer_decision = self._get_answer_decision(obj)
        if answer_decision.next_level_label is not None:
            return answer_decision.next_level_label

        return self._get_downvote_decision(obj).next_level_label

    def get_viewer_can_downvote(self, obj: Question):
        return self._get_downvote_decision(obj).allowed

    def get_viewer_downvote_reason_code(self, obj: Question):
        return self._get_downvote_decision(obj).reason_code

    def get_viewer_downvote_reason_message(self, obj: Question):
        downvote_decision = self._get_downvote_decision(obj)
        return QuestionProtectionService.build_downvote_reason_message(
            downvote_decision.reason_code,
            downvote_decision,
        )


class QuestionGetSerializer(QuestionProtectionMixin, serializers.ModelSerializer):
    upvotes = serializers.IntegerField(source='vote_upvotes', read_only=True)
    downvotes = serializers.IntegerField(source='vote_downvotes', read_only=True)
    score = serializers.IntegerField(source='vote_score', read_only=True)
    user_vote = serializers.ChoiceField(source='user_vote_type', choices=Vote.VoteType.choices, read_only=True, allow_null=True)
    tags = TagSerializer(many=True, read_only=True)
    is_protected = serializers.SerializerMethodField()
    protection_reason_code = serializers.SerializerMethodField()
    protected_until = serializers.SerializerMethodField()
    author_level = serializers.SerializerMethodField()
    author_points_to_next_level = serializers.SerializerMethodField()
    author_next_level = serializers.SerializerMethodField()
    author_next_level_label = serializers.SerializerMethodField()
    viewer_can_answer = serializers.SerializerMethodField()
    viewer_answer_reason_code = serializers.SerializerMethodField()
    viewer_answer_reason_message = serializers.SerializerMethodField()
    viewer_answer_required_level = serializers.SerializerMethodField()
    viewer_answer_required_level_label = serializers.SerializerMethodField()
    viewer_level = serializers.SerializerMethodField()
    viewer_level_label = serializers.SerializerMethodField()
    viewer_points_to_next_level = serializers.SerializerMethodField()
    viewer_next_level = serializers.SerializerMethodField()
    viewer_next_level_label = serializers.SerializerMethodField()
    viewer_can_downvote = serializers.SerializerMethodField()
    viewer_downvote_reason_code = serializers.SerializerMethodField()
    viewer_downvote_reason_message = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = '__all__'


class QuestionListSerializer(QuestionProtectionMixin, serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    is_protected = serializers.SerializerMethodField()
    protection_reason_code = serializers.SerializerMethodField()
    protected_until = serializers.SerializerMethodField()
    author_level = serializers.SerializerMethodField()
    author_points_to_next_level = serializers.SerializerMethodField()
    author_next_level = serializers.SerializerMethodField()
    author_next_level_label = serializers.SerializerMethodField()
    viewer_can_answer = serializers.SerializerMethodField()
    viewer_answer_reason_code = serializers.SerializerMethodField()
    viewer_answer_reason_message = serializers.SerializerMethodField()
    viewer_answer_required_level = serializers.SerializerMethodField()
    viewer_answer_required_level_label = serializers.SerializerMethodField()
    viewer_level = serializers.SerializerMethodField()
    viewer_level_label = serializers.SerializerMethodField()
    viewer_points_to_next_level = serializers.SerializerMethodField()
    viewer_next_level = serializers.SerializerMethodField()
    viewer_next_level_label = serializers.SerializerMethodField()
    viewer_can_downvote = serializers.SerializerMethodField()
    viewer_downvote_reason_code = serializers.SerializerMethodField()
    viewer_downvote_reason_message = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            'question_id',
            'user',
            'question_title',
            'question_status',
            'question_created_at',
            'question_updated_at',
            'tags',
            *QuestionProtectionMixin.protection_field_names,
        ]

class QuestionDraftAssistRequestSerializer(serializers.Serializer):
    question_title = serializers.CharField(max_length=300, trim_whitespace=False)
    question_body = serializers.CharField(trim_whitespace=False)
    tags = serializers.ListField(child=QuestionTagNameField(), allow_empty=True)
    mode = serializers.ChoiceField(choices=['create', 'edit'], required=False, default='create')

    def validate_question_title(self, value):
        normalized_value = value.strip()

        if not normalized_value:
            raise serializers.ValidationError('Заголовок вопроса не может быть пустым.')

        return normalized_value

    def validate_question_body(self, value):
        normalized_value = value.strip()

        if not normalized_value:
            raise serializers.ValidationError('Текст вопроса не может быть пустым.')

        return normalized_value

    def validate_tags(self, value):
        return normalize_question_tags(value)


class QuestionDraftAssistFindingSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)
    severity = serializers.ChoiceField(choices=['info', 'warning', 'error'], read_only=True)
    field = serializers.CharField(read_only=True, allow_null=True, required=False)


class QuestionDraftAssistWarningSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)


class QuestionDraftAssistResponseSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['ok', 'assistant_unavailable'], read_only=True)
    mode = serializers.ChoiceField(choices=['create', 'edit'], read_only=True)
    summary = serializers.CharField(read_only=True, allow_blank=True)
    findings = QuestionDraftAssistFindingSerializer(many=True, read_only=True)
    suggested_title = serializers.CharField(read_only=True, allow_null=True)
    suggested_body = serializers.CharField(read_only=True, allow_null=True)
    suggested_tags = serializers.ListField(child=serializers.CharField(), read_only=True)
    warnings = QuestionDraftAssistWarningSerializer(many=True, read_only=True)


class QuestionUpdateCreateSerializer(serializers.ModelSerializer):
    tags = serializers.ListField(child=QuestionTagNameField(), required=False, write_only=True)

    class Meta:
        model = Question
        fields = ['question_title', 'question_body', 'tags']

    def validate_question_title(self, value):
        normalized_value = value.strip()

        if not normalized_value:
            raise serializers.ValidationError('Заголовок вопроса не может быть пустым.')

        return normalized_value

    def validate_question_body(self, value):
        normalized_value = value.strip()

        if not normalized_value:
            raise serializers.ValidationError('Текст вопроса не может быть пустым.')

        return normalized_value

    def validate_tags(self, value):
        return normalize_question_tags(value)

    def create(self, validated_data):
        tag_names = validated_data.pop('tags', [])

        with transaction.atomic():
            question = super().create(validated_data)
            QuestionTagService.attach_tags_to_question(question, tag_names)
            sync_question_graph(question)
            sync_authored_question_activity(question)

        return question

    def update(self, instance, validated_data):
        tag_names = validated_data.pop('tags', None)
        instance = super().update(instance, validated_data)

        if tag_names is not None:
            QuestionEditService._replace_question_tags(instance, tag_names)
            instance.refresh_from_db()

        return instance


class QuestionEditCreateSerializer(serializers.Serializer):
    question = serializers.PrimaryKeyRelatedField(
        queryset=Question.objects.select_related('user').prefetch_related('tags'),
        write_only=True,
    )
    question_edit_title_after = serializers.CharField(max_length=300, required=False, write_only=True)
    question_edit_body_after = serializers.CharField(required=False, write_only=True)
    question_title = serializers.CharField(max_length=300, required=False, write_only=True)
    question_body = serializers.CharField(required=False, write_only=True)
    tags = serializers.ListField(child=QuestionTagNameField(), required=True, write_only=True)

    def validate_question_edit_title_after(self, value):
        normalized_value = value.strip()

        if not normalized_value:
            raise serializers.ValidationError('Заголовок вопроса не может быть пустым.')

        return normalized_value

    def validate_question_edit_body_after(self, value):
        normalized_value = value.strip()

        if not normalized_value:
            raise serializers.ValidationError('Текст вопроса не может быть пустым.')

        return normalized_value

    def validate_tags(self, value):
        return normalize_question_tags(value)

    def validate(self, data):
        question = data['question']
        user = self.context.get('request').user
        title_after = data.get('question_edit_title_after') or data.get('question_title')
        body_after = data.get('question_edit_body_after') or data.get('question_body')

        if title_after is None:
            raise serializers.ValidationError({'question_edit_title_after': 'Заголовок вопроса обязателен.'})

        if body_after is None:
            raise serializers.ValidationError({'question_edit_body_after': 'Текст вопроса обязателен.'})

        data['question_edit_title_after'] = self.validate_question_edit_title_after(title_after)
        data['question_edit_body_after'] = self.validate_question_edit_body_after(body_after)
        current_tags = list(question.tags.order_by('name').values_list('name', flat=True))
        next_tags = sorted(data.get('tags', []))

        if question.user == user:
            raise serializers.ValidationError('Автор вопроса может редактировать вопрос напрямую.')

        if (
            question.question_title == data['question_edit_title_after']
            and question.question_body == data['question_edit_body_after']
            and current_tags == next_tags
        ):
            raise serializers.ValidationError('Предложение должно изменять заголовок, текст или теги вопроса.')

        if QuestionEditProposal.objects.filter(
            question=question,
            author=user,
            question_edit_is_approved__isnull=True,
        ).exists():
            raise serializers.ValidationError(
                'Пользователь уже предложил ожидающую рассмотрения правку для этого вопроса.'
            )

        return data

    def create(self, validated_data):
        question = validated_data.pop('question')
        validated_data.pop('question_title', None)
        validated_data.pop('question_body', None)
        payload = QuestionChangePayload(
            title=validated_data['question_edit_title_after'],
            body=validated_data['question_edit_body_after'],
            tags=validated_data.get('tags', []),
        )
        return QuestionEditService.create_proposal(
            question=question,
            actor=self.context['request'].user,
            payload=payload,
        )


class QuestionCreateResponseSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = [
            'question_id',
            'user',
            'question_title',
            'question_body',
            'question_status',
            'question_created_at',
            'question_updated_at',
            'tags',
        ]


class EligibleExpertCandidateSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(read_only=True)
    user_name = serializers.CharField(read_only=True)
    user_reputation_score = serializers.IntegerField(read_only=True)
    reputation_level = serializers.ChoiceField(choices=CustomUser.ReputationLevel.choices, read_only=True)
    reputation_level_label = serializers.CharField(read_only=True)
    is_manual_override = serializers.BooleanField(read_only=True)


class EligibleExpertsResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField(read_only=True)
    next = serializers.CharField(read_only=True, allow_null=True)
    previous = serializers.CharField(read_only=True, allow_null=True)
    results = EligibleExpertCandidateSerializer(many=True, read_only=True)
    question_id = serializers.UUIDField(read_only=True)
    max_invites = serializers.IntegerField(read_only=True)
    invited_count = serializers.IntegerField(read_only=True)
    remaining_slots = serializers.IntegerField(read_only=True)
    can_invite = serializers.BooleanField(read_only=True)
    reason_code = serializers.CharField(read_only=True)


class ExpertInvitationCreateRequestSerializer(serializers.Serializer):
    recipient_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=5,
    )


class ExpertInvitationItemSerializer(serializers.Serializer):
    recipient_id = serializers.UUIDField(read_only=True)
    notification_id = serializers.UUIDField(read_only=True)
    dedupe_key = serializers.CharField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)
    payload = serializers.DictField(read_only=True)


class ExpertInvitationCreateResponseSerializer(serializers.Serializer):
    question_id = serializers.UUIDField(read_only=True)
    max_invites = serializers.IntegerField(read_only=True)
    invited_count = serializers.IntegerField(read_only=True)
    remaining_slots = serializers.IntegerField(read_only=True)
    created_count = serializers.IntegerField(read_only=True)
    invitations = ExpertInvitationItemSerializer(many=True, read_only=True)


class ExpertInvitationListItemSerializer(serializers.Serializer):
    recipient_id = serializers.UUIDField(read_only=True)
    recipient_name = serializers.CharField(read_only=True)
    recipient_reputation_score = serializers.IntegerField(read_only=True)
    reputation_level = serializers.ChoiceField(choices=CustomUser.ReputationLevel.choices, read_only=True)
    reputation_level_label = serializers.CharField(read_only=True)
    notification_id = serializers.UUIDField(read_only=True)
    is_read = serializers.BooleanField(read_only=True)
    read_at = serializers.DateTimeField(read_only=True, allow_null=True)
    invitation_status = serializers.CharField(read_only=True)
    protected_window_active = serializers.BooleanField(read_only=True)
    protected_until = serializers.DateTimeField(read_only=True, allow_null=True)


class ExpertInvitationListResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField(read_only=True)
    next = serializers.CharField(read_only=True, allow_null=True)
    previous = serializers.CharField(read_only=True, allow_null=True)
    results = ExpertInvitationListItemSerializer(many=True, read_only=True)
    question_id = serializers.UUIDField(read_only=True)
    invited_count = serializers.IntegerField(read_only=True)


class QuestionEditProposalResponseSerializer(serializers.ModelSerializer):
    question_title = serializers.CharField(source='question.question_title', read_only=True)
    question_author_id = serializers.UUIDField(source='question.user.user_id', read_only=True, allow_null=True)
    question_author_name = serializers.SerializerMethodField()
    user = serializers.UUIDField(source='author.user_id', read_only=True, allow_null=True)
    edit_author_id = serializers.UUIDField(source='author.user_id', read_only=True, allow_null=True)
    edit_author_name = serializers.SerializerMethodField()

    class Meta:
        model = QuestionEditProposal
        fields = [
            'question_edit_id',
            'question',
            'question_title',
            'question_author_id',
            'question_author_name',
            'user',
            'edit_author_id',
            'edit_author_name',
            'author',
            'reviewed_by',
            'question_edit_title_before',
            'question_edit_body_before',
            'question_edit_tags_before',
            'question_edit_title_after',
            'question_edit_body_after',
            'question_edit_tags_after',
            'question_edit_is_approved',
            'question_edit_edited_at',
            'reviewed_at',
        ]

    def get_question_author_name(self, obj: QuestionEditProposal) -> str:
        return obj.question.user.user_name if obj.question.user else 'Автор вопроса'

    def get_edit_author_name(self, obj: QuestionEditProposal) -> str:
        return obj.author.user_name if obj.author else 'Пользователь удалён'


class QuestionEditApprovalSerializer(serializers.Serializer):
    approved = serializers.BooleanField()


class QuestionRevisionSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = QuestionRevision
        fields = [
            'revision_id',
            'question',
            'proposal',
            'source',
            'actor',
            'actor_name',
            'title_before',
            'body_before',
            'tags_before',
            'title_after',
            'body_after',
            'tags_after',
            'tags',
            'created_at',
        ]

    def get_actor_name(self, obj: QuestionRevision) -> str:
        return obj.actor.user_name if obj.actor else 'Пользователь удалён'


class QuestionEditEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = QuestionEditEvent
        fields = [
            'event_id',
            'question',
            'proposal',
            'revision',
            'event_type',
            'actor',
            'actor_name',
            'created_at',
        ]

    def get_actor_name(self, obj: QuestionEditEvent) -> str:
        return obj.actor.user_name if obj.actor else 'Пользователь удалён'

class SolutionListSerializer(serializers.ModelSerializer):
    question_id = serializers.UUIDField(source='question.question_id', read_only=True)
    user_name = serializers.CharField(source='user.user_name', read_only=True)
    upvotes = serializers.IntegerField(source='vote_upvotes', read_only=True)
    downvotes = serializers.IntegerField(source='vote_downvotes', read_only=True)
    score = serializers.IntegerField(source='vote_score', read_only=True)
    user_vote = serializers.ChoiceField(source='user_vote_type', choices=Vote.VoteType.choices, read_only=True, allow_null=True)

    class Meta:
        model = Solution
        fields = ['solution_id', 'user', 'user_name', 'question_id', 'solution_body', 'solution_is_best',
                  'solution_created_at', 'solution_updated_at', 'upvotes', 'downvotes', 'score', 'user_vote']

class SolutionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Solution
        fields = ['question', 'solution_body']

    @staticmethod
    def _raise_protected_newcomer_answer_denied(answer_decision) -> None:
        message = QuestionProtectionService.build_answer_denied_message(answer_decision)
        permission_error = PermissionDenied(detail=message)
        permission_error.detail = {
            'detail': message,
            'code': PROTECTED_NEWCOMER_ANSWER_ERROR_CODE,
        }
        raise permission_error

    def validate(self, data):
        user = self.context.get('request').user
        question = data.get('question')

        if question.user == user:
            raise serializers.ValidationError('Автор вопроса не может публиковать решение к своему вопросу')

        if Solution.objects.filter(user=user, question=question).exists():
            raise serializers.ValidationError('Пользователь уже выложил решение на данный вопрос')

        answer_decision = QuestionProtectionService.get_answer_eligibility(question, user)
        if not answer_decision.allowed:
            self._raise_protected_newcomer_answer_denied(answer_decision)

        return data


class SolutionBestSerializer(serializers.Serializer):
    solution_is_best = serializers.BooleanField()


class SolutionCreateResponseSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.user_name', read_only=True)

    class Meta:
        model = Solution
        fields = [
            'solution_id',
            'user',
            'user_name',
            'question',
            'solution_body',
            'solution_is_best',
            'solution_created_at',
            'solution_updated_at',
        ]

class SolutionEditCreateSerializer(serializers.ModelSerializer):
    solution = serializers.PrimaryKeyRelatedField(
        queryset=Solution.objects.all()
    )

    class Meta:
        model = SolutionEdits
        fields = ['solution', 'solution_edit_body_after']

    def validate(self, data):
        user = self.context.get('request').user
        solution = data.get('solution')

        if SolutionEdits.objects.filter(user=user, solution=solution, solution_edit_is_approved=None).exists():
            raise serializers.ValidationError('Пользователь уже выложил правку на данное решение, '
                                              'которое находится в статусе ожидания')
        return data

    def create(self, validated_data):
        original_solution = validated_data['solution']

        solution_edit = SolutionEdits.objects.create(
            solution_edit_body_before=original_solution.solution_body,
            **validated_data
        )

        return solution_edit


class SolutionEditCreateResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = SolutionEdits
        fields = [
            'solution_edit_id',
            'solution',
            'user',
            'solution_edit_body_before',
            'solution_edit_body_after',
            'solution_edit_is_approved',
            'solution_edit_edited_at',
        ]


def build_solution_excerpt(value: str, limit: int = 180) -> str:
    normalized_value = re.sub(r'\s+', ' ', value).strip()

    if len(normalized_value) <= limit:
        return normalized_value

    return f'{normalized_value[: limit - 3].rstrip()}...'


class SolutionEditHistorySerializer(serializers.ModelSerializer):
    solution_id = serializers.UUIDField(source='solution.solution_id', read_only=True)
    solution_question_id = serializers.UUIDField(source='solution.question.question_id', read_only=True)
    solution_question_title = serializers.CharField(source='solution.question.question_title', read_only=True)
    solution_owner_id = serializers.UUIDField(source='solution.user.user_id', read_only=True, allow_null=True)
    solution_owner_name = serializers.SerializerMethodField()
    edit_author_id = serializers.UUIDField(source='user.user_id', read_only=True, allow_null=True)
    edit_author_name = serializers.SerializerMethodField()
    solution_excerpt = serializers.SerializerMethodField()

    class Meta:
        model = SolutionEdits
        fields = [
            'solution_edit_id',
            'solution',
            'solution_id',
            'solution_question_id',
            'solution_question_title',
            'solution_owner_id',
            'solution_owner_name',
            'user',
            'edit_author_id',
            'edit_author_name',
            'solution_excerpt',
            'solution_edit_body_before',
            'solution_edit_body_after',
            'solution_edit_is_approved',
            'solution_edit_edited_at',
        ]

    def get_solution_owner_name(self, obj: SolutionEdits) -> str:
        return obj.solution.user.user_name if obj.solution.user else 'Автор решения'

    def get_edit_author_name(self, obj: SolutionEdits) -> str:
        return obj.user.user_name if obj.user else 'Пользователь удалён'

    def get_solution_excerpt(self, obj: SolutionEdits) -> str:
        return build_solution_excerpt(obj.solution_edit_body_before)


class CommentListSerializer(serializers.ModelSerializer):
    target_type = serializers.CharField(read_only=True)
    user_name = serializers.CharField(source='user.user_name', read_only=True)
    user_avatar_url = serializers.ImageField(source='user.user_avatar_url', read_only=True)
    parent_id = serializers.UUIDField(source='parent.comment_id', read_only=True)
    target_id = serializers.UUIDField(source='object_id', read_only=True)

    class Meta:
        model = Comment
        fields = ['comment_id', 'user', 'user_name', 'user_avatar_url', 'target_type',
                  'target_id', 'parent_id', 'body', 'created_at']


class CommentCreateSerializer(serializers.ModelSerializer):
    class TargetType(TextChoices):
        QUESTION = 'question', 'Question'
        SOLUTION = 'solution', 'Solution'

    COMMENT_BODY_LIMIT = 800

    target_type = serializers.ChoiceField(choices=TargetType.choices)
    target_id = serializers.UUIDField(write_only=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Comment
        fields = ['target_type', 'target_id', 'parent_id', 'body']

    def validate_body(self, value):
        normalized_value = value.strip()

        if not normalized_value:
            raise serializers.ValidationError('Добавьте текст комментария.')

        if len(normalized_value) > self.COMMENT_BODY_LIMIT:
            raise serializers.ValidationError('Комментарий не должен быть длиннее 800 символов.')

        return normalized_value

    def validate(self, data):
        target_type = data.get('target_type')
        target_id = data.get('target_id')
        parent_id = data.get('parent_id')

        # Проверка существования цели
        if target_type == self.TargetType.QUESTION:
            if not Question.objects.filter(question_id=target_id).exists():
                raise serializers.ValidationError('Вопрос не найден')
        elif target_type == self.TargetType.SOLUTION:
            if not Solution.objects.filter(solution_id=target_id).exists():
                raise serializers.ValidationError('Решение не найдено')

        # Проверка родительского комментария
        if parent_id:
            try:
                parent = Comment.objects.get(comment_id=parent_id)
                # Родительский комментарий должен быть к той же цели
                parent_target_type = 'question' if parent.content_type.model == 'question' else 'solution'
                if parent_target_type != target_type or parent.object_id != target_id:
                    raise serializers.ValidationError(
                        'Родительский комментарий должен относиться к той же цели'
                    )
                if parent.parent_id is not None:
                    raise serializers.ValidationError('Можно отвечать только на корневые комментарии')
            except Comment.DoesNotExist:
                raise serializers.ValidationError('Родительский комментарий не найден')

        return data

    def create(self, validated_data):
        target_type = validated_data.pop('target_type')
        target_id = validated_data.pop('target_id')
        parent_id = validated_data.pop('parent_id', None)
        # Удаляем user из validated_data, если он там есть
        validated_data.pop('user', None)

        # Получаем ContentType для указанного типа
        if target_type == self.TargetType.QUESTION:
            content_type = ContentType.objects.get_for_model(Question)
        elif target_type == self.TargetType.SOLUTION:
            content_type = ContentType.objects.get_for_model(Solution)
        else:
            raise serializers.ValidationError('Неверный тип цели')

        # Устанавливаем content_type и object_id для GenericForeignKey
        validated_data['content_type'] = content_type
        validated_data['object_id'] = target_id

        parent = None
        if parent_id:
            parent = Comment.objects.get(comment_id=parent_id)

        comment = Comment.objects.create(
            parent=parent,
            user=self.context.get('request').user,
            **validated_data
        )
        return comment


class CommentCreateResponseSerializer(serializers.ModelSerializer):
    target_type = serializers.CharField(read_only=True)
    user_name = serializers.CharField(source='user.user_name', read_only=True)
    user_avatar_url = serializers.ImageField(source='user.user_avatar_url', read_only=True)
    parent_id = serializers.UUIDField(source='parent.comment_id', read_only=True)
    target_id = serializers.UUIDField(source='object_id', read_only=True)

    class Meta:
        model = Comment
        fields = ['comment_id', 'user', 'user_name', 'user_avatar_url', 'target_type',
                  'target_id', 'parent_id', 'body', 'created_at']


class CommentDetailSerializer(serializers.ModelSerializer):
    target_type = serializers.CharField(read_only=True)
    user_name = serializers.CharField(source='user.user_name', read_only=True)
    user_avatar_url = serializers.ImageField(source='user.user_avatar_url', read_only=True)
    parent_id = serializers.UUIDField(source='parent.comment_id', read_only=True)
    target_id = serializers.UUIDField(source='object_id', read_only=True)
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ['comment_id', 'user', 'user_name', 'user_avatar_url', 'target_type',
                  'target_id', 'parent_id', 'body', 'created_at', 'replies']

    def get_replies(self, obj):
        """Возвращает список ответов на комментарий"""
        replies = getattr(obj, 'prefetched_replies', None)
        if replies is None:
            replies = Comment.objects.filter(parent=obj).select_related('user', 'content_type').order_by('created_at')
        return CommentListSerializer(replies, many=True).data


class VoteSerializer(serializers.ModelSerializer):
    target_type = serializers.CharField(source='content_type.model', read_only=True)
    target_id = serializers.UUIDField(source='object_id', read_only=True)

    class Meta:
        model = Vote
        fields = ['vote_id', 'user', 'target_type', 'target_id', 'vote_type', 'created_at', 'updated_at']


class SolutionEditApprovalSerializer(serializers.Serializer):
    approved = serializers.BooleanField()


class VoteCreateSerializer(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=[('question', 'Question'), ('solution', 'Solution')])
    target_id = serializers.UUIDField()
    vote_type = serializers.ChoiceField(choices=[('up', 'Upvote'), ('down', 'Downvote')])

    def validate(self, data):
        user = self.context.get('request').user
        target_type = data.get('target_type')
        target_id = data.get('target_id')

        # Проверка существования цели
        target_object = VoteService.get_target_object(target_type, target_id)

        # Проверка: нельзя голосовать за свой контент
        if target_object.user == user:
            raise serializers.ValidationError('Нельзя голосовать за собственный контент')

        return data
