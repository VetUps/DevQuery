from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from rest_framework import viewsets, status, mixins, pagination
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter

from .models import Question, Solution, SolutionEdits, Comment
from .serializers import (
    QuestionGetSerializer, QuestionListSerializer, QuestionUpdateCreateSerializer,
    QuestionCreateResponseSerializer, SolutionListSerializer, SolutionCreateSerializer,
    SolutionCreateResponseSerializer,
    SolutionEditCreateSerializer, SolutionEditHistorySerializer,
    CommentListSerializer, CommentCreateSerializer, CommentDetailSerializer,
    VoteSerializer, VoteCreateSerializer, SolutionEditApprovalSerializer,
)
from .services.solution_edits_service import SolutionEditService
from .services.comment_service import CommentService
from .services.vote_service import VoteService

class QuestionViewSet(mixins.ListModelMixin,
                      mixins.RetrieveModelMixin,
                      mixins.CreateModelMixin,
                      mixins.UpdateModelMixin,
                      viewsets.GenericViewSet):
    serializer_class = QuestionGetSerializer
    lookup_field = 'question_id'
    pagination_class = pagination.PageNumberPagination

    question_get_serializer = QuestionGetSerializer
    question_list_serializer = QuestionListSerializer
    question_create_serializer = QuestionUpdateCreateSerializer
    question_create_response_serializer = QuestionCreateResponseSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return self.question_list_serializer
        if self.action == 'retrieve':
            return self.question_get_serializer
        if self.action in ['create', 'update', 'partial_update']:
            return self.question_create_serializer
        return self.serializer_class

    def get_permissions(self):
        if self.action == 'create':
            permission_classes = [IsAuthenticated]
        elif self.action in ['update', 'partial_update']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [AllowAny]

        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = Question.objects.select_related('user')

        if self.action == 'retrieve':
            user = self.request.user
            queryset = VoteService.annotate_votes(queryset, Question, user)

        return queryset

    def get_object(self):
        obj = super().get_object()
        if self.action in ['update', 'partial_update'] and obj.user != self.request.user:
            self.permission_denied(self.request)
        return obj

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        serializer.save()

    @extend_schema(
        request=QuestionUpdateCreateSerializer,
        responses={201: QuestionCreateResponseSerializer},
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        response_serializer = self.question_create_response_serializer(serializer.instance)
        headers = self.get_success_headers(response_serializer.data)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class SolutionViewSet(mixins.ListModelMixin,
                      mixins.CreateModelMixin,
                      viewsets.GenericViewSet):
    pagination_class = pagination.PageNumberPagination

    solution_list_serializer = SolutionListSerializer
    solution_create_serializer = SolutionCreateSerializer
    solution_create_response_serializer = SolutionCreateResponseSerializer

    def get_queryset(self):
        base_queryset = Solution.objects.select_related('user', 'question')
        
        if self.action == 'list':
            queryset = base_queryset.filter(question__question_id=self.request.query_params.get('question_id'))
            user = self.request.user
            queryset = VoteService.annotate_votes(queryset, Solution, user)
        else:
            queryset = base_queryset

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return self.solution_list_serializer
        if self.action == 'create':
            return self.solution_create_serializer
        return self.serializer_class

    def get_permissions(self):
        if self.action in ['create']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [AllowAny]

        return [permission() for permission in permission_classes]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @extend_schema(
        request=SolutionCreateSerializer,
        responses={201: SolutionCreateResponseSerializer},
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        response_serializer = self.solution_create_response_serializer(serializer.instance)
        headers = self.get_success_headers(response_serializer.data)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                'question_id', OpenApiTypes.UUID,
                      location='query', required=True, description='ID вопроса'
            ),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

class SolutionEditsViewSet(mixins.CreateModelMixin,
                           viewsets.GenericViewSet):
    serializer_class = SolutionEditHistorySerializer
    solution_edit_create_serializer = SolutionEditCreateSerializer

    def get_queryset(self):
        return SolutionEdits.objects.select_related('solution', 'user')

    def get_serializer_class(self):
        if self.action == 'create':
            return self.solution_edit_create_serializer
        return self.serializer_class

    def get_permissions(self):
        if self.action in ['create', 'approve', 'disapprove', 'not_approved']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [AllowAny]

        return [permission() for permission in permission_classes]

    def perform_create(self, serializer):
        solution = serializer.validated_data['solution']
        user = self.request.user
        is_author = solution.user == user

        serializer.save(
            user=self.request.user,
            solution_edit_is_approved=True if is_author else None
        )

        if is_author:
            solution.solution_body = serializer.validated_data['solution_edit_body_after']
            solution.save(update_fields=['solution_body', 'solution_updated_at'])

    @action(detail=False, methods=['get'], url_path='history/(?P<solution_id>[^/.]+)')
    @extend_schema(responses=SolutionEditHistorySerializer(many=True))
    def history(self, request, solution_id):
        result = SolutionEditService.history(solution_id)
        serializer = SolutionEditHistorySerializer(result, many=True)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], url_path='not_approved/(?P<solution_id>[^/.]+)')
    @extend_schema(responses=SolutionEditHistorySerializer(many=True))
    def not_approved(self, request, solution_id):
        user = request.user
        result = SolutionEditService.not_approved(solution_id, user)
        serializer = SolutionEditHistorySerializer(result, many=True)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['patch'], url_path='approve/(?P<solution_edit_id>[^/.]+)')
    @extend_schema(responses=SolutionEditApprovalSerializer)
    def approve(self, request, solution_edit_id):
        user = request.user
        SolutionEditService.change_approve(solution_edit_id, True, user)

        return Response(
            {'approved': True},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['patch'], url_path='disapprove/(?P<solution_edit_id>[^/.]+)')
    @extend_schema(responses=SolutionEditApprovalSerializer)
    def disapprove(self, request, solution_edit_id):
        user = request.user
        SolutionEditService.change_approve(solution_edit_id, False, user)

        return Response(
            {'approved': False},
            status=status.HTTP_200_OK
        )


class CommentViewSet(mixins.ListModelMixin,
                     mixins.CreateModelMixin,
                     mixins.DestroyModelMixin,
                     viewsets.GenericViewSet):
    """
    ViewSet для управления комментариями.

    Endpoints:
    - GET /comment/?target_type=question&target_id=<uuid> - список комментариев к цели
    - POST /comment/ - создание комментария
    - DELETE /comment/{id}/ - удаление комментария
    """
    serializer_class = CommentDetailSerializer
    lookup_field = 'comment_id'
    pagination_class = pagination.PageNumberPagination

    comment_list_serializer = CommentListSerializer
    comment_create_serializer = CommentCreateSerializer
    comment_detail_serializer = CommentDetailSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='target_type',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Тип цели комментария (например, "question" или "solution")',
                required=True
            ),
            OpenApiParameter(
                name='target_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='UUID цели комментария',
                required=True
            ),
            OpenApiParameter(
                name='parent_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='UUID родительского комментария (для ответов)',
                required=False
            ),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=CommentCreateSerializer
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        target_type = self.request.query_params.get('target_type')
        target_id = self.request.query_params.get('target_id')
        parent_id = self.request.query_params.get('parent_id')

        base_queryset = CommentService.get_comments_for_target(target_type, target_id, parent_id)
        base_queryset = base_queryset.select_related('user', 'parent', 'content_type')

        # Предзагрузка ответов для CommentDetailSerializer.get_replies()
        if self.action in ['list', 'retrieve']:
            replies_prefetch = Prefetch(
                'comment_set',
                queryset=Comment.objects.select_related('user', 'content_type').order_by('created_at'),
                to_attr='prefetched_replies'
            )
            base_queryset = base_queryset.prefetch_related(replies_prefetch)

        return base_queryset

    def get_object(self):
        """Для destroy действия получаем объект напрямую по ID"""
        if self.action == 'destroy':
            queryset = Comment.objects.all()
        else:
            queryset = self.get_queryset()

        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        filter_kwargs = {self.lookup_field: self.kwargs[lookup_url_kwarg]}
        obj = get_object_or_404(queryset, **filter_kwargs)

        self.check_object_permissions(self.request, obj)
        return obj

    def get_serializer_class(self):
        if self.action == 'list':
            return self.comment_list_serializer
        if self.action == 'create':
            return self.comment_create_serializer
        if self.action == 'retrieve':
            return self.comment_detail_serializer
        return self.serializer_class

    def get_permissions(self):
        if self.action in ['create', 'destroy']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [AllowAny]
        return [permission() for permission in permission_classes]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        user = self.request.user
        CommentService.validate_delete_permission(instance, user)

        CommentService.delete_comment(instance)


class VoteViewSet(viewsets.ViewSet):
    """
    ViewSet для управления голосами

    Endpoints:
    - POST /vote/cast/ - поставить или изменить голос
    - DELETE /vote/remove/ - снять голос
    - GET /vote/stats/{target_type}/{target_id}/ - получить статистику голосов
    - GET /vote/my/{target_type}/{target_id}/ - получить голос текущего пользователя
    """

    serializer_class = VoteCreateSerializer

    def get_permissions(self):
        if self.action in ['cast_vote', 'remove_vote']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [AllowAny]
        return [permission() for permission in permission_classes]

    @extend_schema(
        request=VoteCreateSerializer,
        responses={200: VoteSerializer, 201: VoteSerializer}
    )
    @action(detail=False, methods=['post'], url_path='cast')
    def cast_vote(self, request):
        """
        Поставить или изменить голос за объект.
        Повторный запрос с тем же типом голоса не меняет состояние.
        """
        serializer = VoteCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        target_type = serializer.validated_data['target_type']
        target_id = serializer.validated_data['target_id']
        vote_type = serializer.validated_data['vote_type']

        vote, created = VoteService.cast_vote(target_type, target_id, vote_type, request.user)
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(VoteSerializer(vote).data, status=response_status)

    @extend_schema(
        parameters=[
            OpenApiParameter('target_type', str, 'query', required=True, description='Тип цели (question или solution)'),
            OpenApiParameter('target_id', str, 'query', required=True, description='UUID цели'),
        ],
        responses={204: None}
    )
    @action(detail=False, methods=['delete'], url_path='remove')
    def remove_vote(self, request):
        """
        Снять голос пользователя за объект.
        """
        target_type = request.query_params.get('target_type')
        target_id = request.query_params.get('target_id')

        if not target_type or not target_id:
            return Response(
                {'detail': 'Параметры target_type и target_id обязательны'},
                status=status.HTTP_400_BAD_REQUEST
            )

        VoteService.remove_vote(target_type, target_id, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        parameters=[
            OpenApiParameter('target_type', str, 'path', required=True, description='Тип цели (question или solution)'),
            OpenApiParameter('target_id', str, 'path', required=True, description='UUID цели'),
        ],
        responses={200: {'type': 'object', 'properties': {
            'upvotes': {'type': 'integer'},
            'downvotes': {'type': 'integer'},
            'score': {'type': 'integer'}
        }}}
    )
    @action(detail=False, methods=['get'], url_path='stats/(?P<target_type>[^/.]+)/(?P<target_id>[^/.]+)')
    def get_stats(self, request, target_type, target_id):
        """
        Получить статистику голосов для объекта.
        """
        stats = VoteService.get_vote_stats(target_type, target_id)
        return Response(stats, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[
            OpenApiParameter('target_type', str, 'path', required=True, description='Тип цели (question или solution)'),
            OpenApiParameter('target_id', str, 'path', required=True, description='UUID цели'),
        ],
        responses={200: {'type': 'object', 'properties': {'user_vote': {'type': 'string', 'enum': ['up', 'down', None]}}}}
    )
    @action(detail=False, methods=['get'], url_path='my/(?P<target_type>[^/.]+)/(?P<target_id>[^/.]+)')
    def get_my_vote(self, request, target_type, target_id):
        """
        Получить голос текущего пользователя за объект.
        """
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'user_vote': None}, status=status.HTTP_200_OK)

        user_vote = VoteService.get_user_vote(target_type, target_id, user)
        return Response({'user_vote': user_vote}, status=status.HTTP_200_OK)
