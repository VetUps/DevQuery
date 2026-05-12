import logging

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.knowledge.serializers import (
    KnowledgeGraphLayoutSaveSerializer,
    KnowledgeGraphLayoutSerializer,
    QuestionGraphResponseSerializer,
    UserGraphInsightsErrorResponseSerializer,
    UserGraphInsightsResponseSerializer,
    UserGraphRebuildErrorResponseSerializer,
    UserGraphRebuildResponseSerializer,
    UserGraphResponseSerializer,
)
from apps.knowledge.services.api_service import (
    get_question_graph_payload,
    get_rebuild_error_payload,
    get_rebuild_summary_payload,
    get_user_graph_layout_payload,
    get_user_graph_payload,
    reset_user_graph_layout,
    save_user_graph_layout,
)
from apps.knowledge.services.graph_state_service import UserKnowledgeGraphRebuildError, rebuild_user_knowledge_graph
from apps.knowledge.services.insights_service import get_insights_error_payload, get_owner_insights_payload
from apps.qa.models import Question

logger = logging.getLogger(__name__)


class OwnUserGraphView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: UserGraphResponseSerializer},
        description='Return the authenticated user knowledge graph as aggregate concept/state DTOs.',
    )
    def get(self, request):
        payload = get_user_graph_payload(request.user, is_owner=True)
        return Response(UserGraphResponseSerializer(payload).data)


class OwnUserGraphInsightsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: UserGraphInsightsResponseSerializer,
            503: UserGraphInsightsErrorResponseSerializer,
        },
        description=(
            'Return owner-only rule-based knowledge graph insights with semantic states, '
            'tone tokens, recommendation action payloads, and redacted graph-state diagnostics.'
        ),
    )
    def get(self, request):
        try:
            payload = get_owner_insights_payload(request.user)
        except Exception:
            logger.error(
                'knowledge graph insights calculation failed',
                extra={
                    'phase': 'knowledge_graph_insights',
                    'code': 'knowledge_graph_insights_unavailable',
                    'user_id': str(request.user.pk),
                },
            )
            payload = get_insights_error_payload(request.user)
            return Response(UserGraphInsightsErrorResponseSerializer(payload).data, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(UserGraphInsightsResponseSerializer(payload).data, status=status.HTTP_200_OK)


class OwnUserGraphLayoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: KnowledgeGraphLayoutSerializer},
        description='Return the authenticated owner saved knowledge graph layout positions.',
    )
    def get(self, request):
        payload = get_user_graph_layout_payload(request.user)
        return Response(KnowledgeGraphLayoutSerializer(payload).data)

    @extend_schema(
        request=KnowledgeGraphLayoutSaveSerializer,
        responses={200: KnowledgeGraphLayoutSerializer},
        description='Replace the authenticated owner saved knowledge graph layout positions.',
    )
    def put(self, request):
        serializer = KnowledgeGraphLayoutSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = save_user_graph_layout(
            request.user,
            schema_version=serializer.validated_data.get('schema_version', 1),
            positions=serializer.validated_data['positions'],
        )
        return Response(KnowledgeGraphLayoutSerializer(payload).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=None,
        responses={200: KnowledgeGraphLayoutSerializer},
        description='Reset the authenticated owner saved knowledge graph layout positions.',
    )
    def delete(self, request):
        payload = reset_user_graph_layout(request.user)
        return Response(KnowledgeGraphLayoutSerializer(payload).data, status=status.HTTP_200_OK)


class OwnUserGraphRebuildView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={
            200: UserGraphRebuildResponseSerializer,
            503: UserGraphRebuildErrorResponseSerializer,
        },
        description=(
            'Synchronously rebuild the authenticated owner knowledge graph and return aggregate-only '
            'summary/state diagnostics. Request body user identifiers are ignored.'
        ),
    )
    def post(self, request):
        try:
            summary = rebuild_user_knowledge_graph(request.user)
        except UserKnowledgeGraphRebuildError:
            payload = get_rebuild_error_payload(request.user)
            return Response(UserGraphRebuildErrorResponseSerializer(payload).data, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        payload = get_rebuild_summary_payload(summary)
        return Response(UserGraphRebuildResponseSerializer(payload).data, status=status.HTTP_200_OK)


class PublicUserGraphView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses={200: UserGraphResponseSerializer},
        description='Return a public user knowledge graph as aggregate concept/state DTOs without raw activity rows.',
    )
    def get(self, request, user_id):
        user = get_object_or_404(get_user_model(), pk=user_id)
        is_owner = bool(request.user and request.user.is_authenticated and request.user.pk == user.pk)
        payload = get_user_graph_payload(user, is_owner=is_owner)
        return Response(UserGraphResponseSerializer(payload).data)


class QuestionGraphView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses={200: QuestionGraphResponseSerializer},
        description='Return the structural concept graph for one question without private question body content.',
    )
    def get(self, request, question_id):
        question = get_object_or_404(Question, pk=question_id)
        payload = get_question_graph_payload(question)
        return Response(QuestionGraphResponseSerializer(payload).data)
