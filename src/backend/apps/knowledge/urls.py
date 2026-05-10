from django.urls import path

from apps.knowledge.views import OwnUserGraphRebuildView, OwnUserGraphView, PublicUserGraphView, QuestionGraphView

app_name = 'knowledge'

urlpatterns = [
    path('me/', OwnUserGraphView.as_view(), name='own-user-graph'),
    path('me/rebuild/', OwnUserGraphRebuildView.as_view(), name='own-user-graph-rebuild'),
    path('users/<uuid:user_id>/', PublicUserGraphView.as_view(), name='public-user-graph'),
    path('questions/<uuid:question_id>/', QuestionGraphView.as_view(), name='question-graph'),
]
