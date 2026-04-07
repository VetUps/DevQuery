from django.contrib.contenttypes.models import ContentType
from django.db.models import TextChoices
from rest_framework import serializers
from .models import Question, Solution, SolutionEdits, Comment, Vote
from .services.vote_service import VoteService


class QuestionGetSerializer(serializers.ModelSerializer):
    upvotes = serializers.IntegerField(source='vote_upvotes', read_only=True)
    downvotes = serializers.IntegerField(source='vote_downvotes', read_only=True)
    score = serializers.IntegerField(source='vote_score', read_only=True)
    user_vote = serializers.ChoiceField(source='user_vote_type', choices=Vote.VoteType.choices, read_only=True, allow_null=True)

    class Meta:
        model = Question
        fields = '__all__'

class QuestionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['question_id', 'user', 'question_title', 'question_status', 'question_created_at', 'question_updated_at']

class QuestionUpdateCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['question_title', 'question_body']

class QuestionCreateResponseSerializer(serializers.ModelSerializer):
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
        ]

class SolutionListSerializer(serializers.ModelSerializer):
    question_id = serializers.UUIDField(write_only=True)
    upvotes = serializers.IntegerField(source='vote_upvotes', read_only=True)
    downvotes = serializers.IntegerField(source='vote_downvotes', read_only=True)
    score = serializers.IntegerField(source='vote_score', read_only=True)
    user_vote = serializers.ChoiceField(source='user_vote_type', choices=Vote.VoteType.choices, read_only=True, allow_null=True)

    class Meta:
        model = Solution
        fields = ['solution_id', 'user', 'question_id', 'solution_body', 'solution_is_best',
                  'solution_created_at', 'solution_updated_at', 'upvotes', 'downvotes', 'score', 'user_vote']

class SolutionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Solution
        fields = ['question', 'solution_body']

    def validate(self, data):
        user = self.context.get('request').user
        question = data.get('question')

        if Solution.objects.filter(user=user, question=question).exists():
            raise serializers.ValidationError('Пользователь уже выложил решение на данный вопрос')
        return data

class SolutionCreateResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Solution
        fields = [
            'solution_id',
            'user',
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

class SolutionEditHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SolutionEdits
        fields = '__all__'


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
    
    target_type = serializers.ChoiceField(choices=TargetType.choices)
    target_id = serializers.UUIDField(write_only=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Comment
        fields = ['target_type', 'target_id', 'parent_id', 'body']

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
