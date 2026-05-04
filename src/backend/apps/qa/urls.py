from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import QuestionViewSet, SolutionViewSet, SolutionEditsViewSet, CommentViewSet, VoteViewSet, TagViewSet

app_name = 'qa'

router = DefaultRouter()
router.register('tag', TagViewSet, basename='tag')
router.register('question', QuestionViewSet, basename='question')
router.register('solution', SolutionViewSet, basename='solution')
router.register('solution_edits', SolutionEditsViewSet, basename='solution_edits')
router.register('comment', CommentViewSet, basename='comment')
router.register('vote', VoteViewSet, basename='vote')

urlpatterns = [
    path('', include(router.urls)),
]