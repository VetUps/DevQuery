from django.urls import path

from apps.knowledge.views import (
    OwnUserGraphInsightsView,
    OwnUserGraphLayoutView,
    OwnUserGraphRebuildView,
    OwnUserGraphView,
    PublicUserGraphView,
    QuestionGraphView,
)

app_name = 'knowledge'

urlpatterns = [
    path('me/', OwnUserGraphView.as_view(), name='own-user-graph'),
    path('me/insights/', OwnUserGraphInsightsView.as_view(), name='own-user-graph-insights'),
    path('me/layout/', OwnUserGraphLayoutView.as_view(), name='own-user-graph-layout'),
    path('me/rebuild/', OwnUserGraphRebuildView.as_view(), name='own-user-graph-rebuild'),
    path('users/<uuid:user_id>/', PublicUserGraphView.as_view(), name='public-user-graph'),
    path('questions/<uuid:question_id>/', QuestionGraphView.as_view(), name='question-graph'),
]
