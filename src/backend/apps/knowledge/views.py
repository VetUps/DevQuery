from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.knowledge.serializers import (
    QuestionGraphResponseSerializer,
    UserGraphRebuildErrorResponseSerializer,
    UserGraphRebuildResponseSerializer,
    UserGraphResponseSerializer,
)
from apps.knowledge.services.api_service import (
    get_question_graph_payload,
    get_rebuild_error_payload,
    get_rebuild_summary_payload,
    get_user_graph_payload,
)
from apps.knowledge.services.graph_state_service import UserKnowledgeGraphRebuildError, rebuild_user_knowledge_graph
from apps.qa.models import Question


class OwnUserGraphView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: UserGraphResponseSerializer},
        description='Return the authenticated user knowledge graph as aggregate concept/state DTOs.',
    )
    def get(self, request):
        payload = get_user_graph_payload(request.user, is_owner=True)
        return Response(UserGraphResponseSerializer(payload).data)


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
