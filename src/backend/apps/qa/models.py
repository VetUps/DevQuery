import uuid

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from ..user.models import CustomUser


class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True, db_index=True)
    questions_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'tags'

    def __str__(self):
        return self.name


class Question(models.Model):
    class Status(models.TextChoices):
        OPEN_STATUS = 'open', 'Open'
        CLOSED_STATUS = 'closed', 'Closed'
        SOLVED_STATUS = 'solved', 'Solved'

    question_id =         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                           help_text='Уникальный идентификатор вопроса')
    user =                models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.SET_NULL,
                                            help_text='Автор вопроса')
    tags =                models.ManyToManyField(Tag, related_name='questions', blank=True,
                                            help_text='Теги вопроса')
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


class QuestionFavorite(models.Model):
    favorite_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                   help_text='Уникальный идентификатор избранного вопроса')
    user = models.ForeignKey(CustomUser, blank=False, null=False, on_delete=models.CASCADE,
                             related_name='question_favorites', help_text='Пользователь, добавивший вопрос в избранное')
    question = models.ForeignKey(Question, blank=False, null=False, on_delete=models.CASCADE,
                                 related_name='favorites', help_text='Вопрос, добавленный в избранное')
    created_at = models.DateTimeField(auto_now_add=True, blank=False,
                                      help_text='Дата добавления вопроса в избранное')

    class Meta:
        db_table = 'question_favorites'
        constraints = [
            models.UniqueConstraint(fields=['user', 'question'], name='unique_question_favorite_user_question')
        ]
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['question']),
        ]

    def __str__(self):
        return f'{self.user.user_name if self.user else "Anonymous"} favorited {self.question_id}'


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


class QuestionEditProposal(models.Model):
    question_edit_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                        help_text='Уникальный идентификатор правки вопроса')
    question = models.ForeignKey(Question, blank=False, on_delete=models.CASCADE,
                                 related_name='edit_proposals', help_text='Вопрос, к которому относится правка')
    author = models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.SET_NULL,
                               related_name='question_edit_proposals', help_text='Автор предложенной правки')
    reviewed_by = models.ForeignKey(CustomUser, blank=True, null=True, on_delete=models.SET_NULL,
                                    related_name='question_edit_reviews', help_text='Кто рассмотрел правку')
    question_edit_title_before = models.CharField(max_length=300, blank=False,
                                                  help_text='Заголовок вопроса до правок')
    question_edit_body_before = models.TextField(blank=False,
                                                 help_text='Текст вопроса до правок')
    question_edit_tags_before = models.JSONField(default=list, blank=True,
                                                 help_text='Нормализованные теги вопроса до правок')
    question_edit_title_after = models.CharField(max_length=300, blank=False,
                                                 help_text='Заголовок вопроса после правок')
    question_edit_body_after = models.TextField(blank=False,
                                                help_text='Текст вопроса после правок')
    question_edit_tags_after = models.JSONField(default=list, blank=True,
                                                help_text='Нормализованные теги вопроса после правок')
    question_edit_is_approved = models.BooleanField(blank=True, null=True,
                                                    help_text='Была ли одобрена правка вопроса')
    question_edit_edited_at = models.DateTimeField(auto_now_add=True, blank=False,
                                                   help_text='Дата и время создания предложенной правки')
    reviewed_at = models.DateTimeField(blank=True, null=True,
                                       help_text='Дата и время рассмотрения правки')

    class Meta:
        db_table = 'question_edit_proposals'
        indexes = [
            models.Index(fields=['question', 'question_edit_is_approved']),
            models.Index(fields=['author']),
        ]

    def __str__(self):
        return f'{self.question_edit_id}'


class QuestionRevision(models.Model):
    class Source(models.TextChoices):
        DIRECT_EDIT = 'direct_edit', 'Direct edit'
        APPROVED_PROPOSAL = 'approved_proposal', 'Approved proposal'

    revision_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                   help_text='Уникальный идентификатор ревизии вопроса')
    question = models.ForeignKey(Question, blank=False, on_delete=models.CASCADE,
                                 related_name='revisions', help_text='Вопрос, для которого сохранена ревизия')
    actor = models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.SET_NULL,
                              related_name='question_revisions', help_text='Пользователь, инициировавший ревизию')
    proposal = models.ForeignKey(QuestionEditProposal, blank=True, null=True, on_delete=models.SET_NULL,
                                 related_name='revisions', help_text='Предложенная правка, если ревизия возникла из approval flow')
    source = models.CharField(max_length=30, choices=Source.choices, blank=False,
                              help_text='Источник ревизии вопроса')
    title_before = models.CharField(max_length=300, blank=False,
                                    help_text='Заголовок вопроса до применения изменений')
    body_before = models.TextField(blank=False,
                                   help_text='Текст вопроса до применения изменений')
    tags_before = models.JSONField(default=list, blank=True,
                                   help_text='Нормализованные теги до применения изменений')
    title_after = models.CharField(max_length=300, blank=False,
                                   help_text='Заголовок вопроса после применения изменений')
    body_after = models.TextField(blank=False,
                                  help_text='Текст вопроса после применения изменений')
    tags_after = models.JSONField(default=list, blank=True,
                                  help_text='Нормализованные теги после применения изменений')
    tags = models.ManyToManyField(Tag, related_name='question_revisions', blank=True,
                                  help_text='Финальный набор тегов после ревизии')
    created_at = models.DateTimeField(auto_now_add=True, blank=False,
                                      help_text='Дата создания ревизии')

    class Meta:
        db_table = 'question_revisions'
        indexes = [
            models.Index(fields=['question', 'created_at']),
            models.Index(fields=['source']),
        ]

    def __str__(self):
        return f'{self.revision_id}'


class QuestionEditEvent(models.Model):
    class EventType(models.TextChoices):
        DIRECT_EDITED = 'direct_edited', 'Direct edited'
        PROPOSED = 'proposed', 'Proposed'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    event_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                help_text='Уникальный идентификатор события жизненного цикла вопроса')
    question = models.ForeignKey(Question, blank=False, on_delete=models.CASCADE,
                                 related_name='edit_events', help_text='Вопрос, к которому относится событие')
    actor = models.ForeignKey(CustomUser, blank=False, null=True, on_delete=models.SET_NULL,
                              related_name='question_edit_events', help_text='Пользователь, вызвавший событие')
    proposal = models.ForeignKey(QuestionEditProposal, blank=True, null=True, on_delete=models.SET_NULL,
                                 related_name='events', help_text='Связанная предложенная правка вопроса')
    revision = models.ForeignKey(QuestionRevision, blank=True, null=True, on_delete=models.SET_NULL,
                                 related_name='events', help_text='Связанная ревизия вопроса')
    event_type = models.CharField(max_length=30, choices=EventType.choices, blank=False,
                                  help_text='Тип события жизненного цикла вопроса')
    created_at = models.DateTimeField(auto_now_add=True, blank=False,
                                      help_text='Дата создания события')

    class Meta:
        db_table = 'question_edit_events'
        indexes = [
            models.Index(fields=['question', 'created_at']),
            models.Index(fields=['event_type']),
        ]

    def __str__(self):
        return f'{self.event_id}'


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
