from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.db.models import QuerySet
from rest_framework.exceptions import PermissionDenied, NotFound

from ..models import Comment, Question, Solution
from ...user.models import CustomUser


class CommentService:
    @staticmethod
    def get_comment(comment_id: str) -> Comment:
        """
        Возвращает комментарий по его ID
        :param comment_id: ID комментария
        :return:
        """
        try:
            comment = Comment.objects.get(comment_id=comment_id)
            return comment
        except Comment.DoesNotExist:
            raise NotFound('Такого комментария не существует')

    @staticmethod
    def get_comments_for_target(
        target_type: str,
        target_id: str,
        parent_id: str | None = None,
    ) -> QuerySet[Comment]:
        """
        Возвращает комментарии для указанной цели (вопрос или решение)
        :param target_type: Тип цели ('question' или 'solution')
        :param target_id: ID цели
        :param parent_id: ID родительского комментария (для вложенных комментариев)
        :return:
        """
        queryset = Comment.objects.all().order_by('created_at')

        # Получаем ContentType
        if target_type == 'question':
            content_type = ContentType.objects.get_for_model(Question)
        elif target_type == 'solution':
            content_type = ContentType.objects.get_for_model(Solution)
        else:
            return Comment.objects.none()

        queryset = queryset.filter(content_type=content_type, object_id=target_id)

        # Если указан parent_id, возвращаем только ответы на этот комментарий
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        else:
            # Если parent_id не указан, возвращаем только корневые комментарии
            queryset = queryset.filter(parent__isnull=True)

        return queryset

    @staticmethod
    def validate_delete_permission(comment: Comment, user: CustomUser) -> bool:
        """
        Проверяет права пользователя на удаление комментария
        :param comment: Комментарий
        :param user: Пользователь
        :return: True если права валидны
        :raises PermissionDenied: если пользователь не имеет прав
        """

        if user != comment.user and user.user_role != CustomUser.Roles.ADMIN_ROLE:
            raise PermissionDenied('Вы не можете удалить этот комментарий')
        return True

    @staticmethod
    def delete_comment(comment: Comment) -> None:
        """
        Удаляет комментарий и все вложенные комментарии
        :param comment: Комментарий для удаления
        :return:
        """
        comment.delete()
