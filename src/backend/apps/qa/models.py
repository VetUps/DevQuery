import uuid

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from ..user.models import CustomUser


class Question(models.Model):
    class Status(models.TextChoices):
        OPEN_STATUS = 'open', 'Open'
        CLOSED_STATUS = 'closed', 'Closed'
        SOLVED_STATUS = 'solved', 'Solved'

    question_id =         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                           help_text='Уникальный идентификатор вопроса')
    user =                models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.SET_NULL,
                                            help_text='Автор вопроса')
    question_title =      models.CharField(max_length=300, blank=False,
                                           help_text='Краткое описание вопроса')
    question_body =       models.TextField(blank=False,
                                           help_text='Тело вопроса (сам текст)')
    question_status =     models.CharField(choices=Status.choices, default=Status.OPEN_STATUS, blank=False, max_length=20,
                                           help_text='Статус вопроса')
    question_created_at = models.DateTimeField(auto_now_add=True, blank=False,
                                               help_text='Дата создания вопроса')
    question_updated_at = models.DateTimeField(auto_now=True, blank=False,
                                               help_text='Дата изменения вопроса')

    class Meta:
        db_table = 'questions'

    def __str__(self):
        return self.question_title

class Solution(models.Model):
    solution_id =         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                           help_text='Уникальный идентификатор решения')
    user =                models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.SET_NULL,
                                            help_text='Автор решения')
    question =            models.ForeignKey(Question, blank=False, on_delete=models.CASCADE,
                                            help_text='Вопрос к которому представлено решение')
    solution_body =       models.TextField(blank=False,
                                           help_text='Тело решения (сам текст)')
    solution_is_best =    models.BooleanField(default=False, blank=False,
                                              help_text='Является ли решение лучшим')
    solution_created_at = models.DateTimeField(auto_now_add=True, blank=False,
                                               help_text='Дата создания решения')
    solution_updated_at = models.DateTimeField(auto_now=True, blank=False,
                                               help_text='Дата изменения решения')

    class Meta:
        db_table = 'solutions'
        constraints = [
            models.UniqueConstraint(fields=['user', 'question'], name='unique_solution_user_pair')
        ]

    def __str__(self):
        return f'{self.solution_id}'

class SolutionEdits(models.Model):
    solution_edit_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                        help_text='Уникальный идентификатор изменения')
    solution = models.ForeignKey(Solution, blank=False, on_delete=models.CASCADE,
                                 help_text='Решение к которому относится изменение')
    user = models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.SET_NULL,
                             help_text='Автор изменений')
    solution_edit_body_before = models.TextField(blank=False,
                                                 help_text='Текст решения до правок')
    solution_edit_body_after = models.TextField(blank=False,
                                                help_text='Новый текст решения')
    solution_edit_is_approved = models.BooleanField(blank=True, null=True,
                                                    help_text='Была ли одобрена правка')
    solution_edit_edited_at = models.DateTimeField(auto_now_add=True, blank=False,
                                                   help_text='Дата и время правки')

    class Meta:
        db_table = 'solution_edits'

    def __str__(self):
        return f'{self.solution_edit_id}'


class Comment(models.Model):
    comment_id =        models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                        help_text='Уникальный идентификатор комментария')
    user =              models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.CASCADE,
                                          help_text='Автор комментария')

    content_type =      models.ForeignKey(ContentType, on_delete=models.CASCADE,
                                          help_text='Тип контента (вопрос или решение)')
    object_id =         models.UUIDField(help_text='ID объекта, к которому оставлен комментарий')
    target =            GenericForeignKey('content_type', 'object_id')

    parent =            models.ForeignKey('self', blank=True, null=True, on_delete=models.CASCADE,
                                          help_text='Родительский комментарий (для вложенных комментариев)')
    body =              models.TextField(blank=False,
                                         help_text='Текст комментария')
    created_at =        models.DateTimeField(auto_now_add=True, blank=False,
                                             help_text='Дата создания комментария')

    class Meta:
        db_table = 'comments'
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['parent']),
        ]

    def __str__(self):
        return f'Comment {self.comment_id} by {self.user.user_name if self.user else "Anonymous"}'

    @property
    def target_type(self):
        return self.content_type.model


class Vote(models.Model):
    class VoteType(models.TextChoices):
        UPVOTE = 'up', 'Upvote'
        DOWNVOTE = 'down', 'Downvote'

    vote_id =           models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                         help_text='Уникальный идентификатор голоса')
    user =              models.ForeignKey(CustomUser, blank=False, null=False, on_delete=models.CASCADE,
                                          help_text='Пользователь, поставивший голос')
    content_type =      models.ForeignKey(ContentType, on_delete=models.CASCADE,
                                          help_text='Тип контента (вопрос или решение)')
    object_id =         models.UUIDField(help_text='ID объекта, к которому поставлен голос')
    target =            GenericForeignKey('content_type', 'object_id')
    vote_type =         models.CharField(choices=VoteType.choices, blank=False, max_length=10,
                                         help_text='Тип голоса (upvote или downvote)')
    created_at =        models.DateTimeField(auto_now_add=True, blank=False,
                                             help_text='Дата создания голоса')
    updated_at =        models.DateTimeField(auto_now=True, blank=False,
                                             help_text='Дата изменения голоса')

    class Meta:
        db_table = 'votes'
        constraints = [
            models.UniqueConstraint(fields=['user', 'content_type', 'object_id'], name='unique_vote_user_target')
        ]
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['user']),
        ]

    def __str__(self):
        return f'{self.vote_type} by {self.user.user_name if self.user else "Anonymous"} on {self.target}'
