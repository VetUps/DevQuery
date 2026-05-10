from decimal import Decimal

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.qa.models import Question, Tag


class KnowledgeConcept(models.Model):
    class Source(models.TextChoices):
        TAG = 'tag', 'Tag'
        MANUAL = 'manual', 'Manual'
        PROVIDER = 'provider', 'Provider'

    slug = models.SlugField(max_length=160, unique=True, db_index=True)
    name = models.CharField(max_length=255, unique=True)
    source = models.CharField(max_length=30, choices=Source.choices, default=Source.TAG)
    provider = models.CharField(max_length=128, blank=True, default='')
    confidence = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal('1.0000'),
        validators=[MinValueValidator(Decimal('0.0000')), MaxValueValidator(Decimal('1.0000'))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'knowledge_concepts'
        indexes = [
            models.Index(fields=['slug'], name='knowledge_concept_slug_idx'),
        ]

    def __str__(self):
        return self.name


class ConceptTagMapping(models.Model):
    class Source(models.TextChoices):
        TAG = 'tag', 'Tag'
        MANUAL = 'manual', 'Manual'
        PROVIDER = 'provider', 'Provider'

    tag = models.ForeignKey(Tag, on_delete=models.PROTECT, related_name='knowledge_mappings')
    concept = models.ForeignKey(KnowledgeConcept, on_delete=models.PROTECT, related_name='tag_mappings')
    source = models.CharField(max_length=30, choices=Source.choices, default=Source.TAG)
    provider = models.CharField(max_length=128, blank=True, default='')
    confidence = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal('1.0000'),
        validators=[MinValueValidator(Decimal('0.0000')), MaxValueValidator(Decimal('1.0000'))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'concept_tag_mappings'
        constraints = [
            models.UniqueConstraint(fields=['tag', 'concept'], name='unique_concept_tag_mapping'),
        ]
        indexes = [
            models.Index(fields=['tag', 'concept'], name='kmap_tag_concept_idx'),
            models.Index(fields=['concept'], name='concept_mapping_concept_idx'),
        ]

    def __str__(self):
        return f'{self.tag} -> {self.concept}'


class QuestionConceptEdge(models.Model):
    class Source(models.TextChoices):
        TAG = 'tag', 'Tag'
        MANUAL = 'manual', 'Manual'
        PROVIDER = 'provider', 'Provider'

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='concept_edges')
    concept = models.ForeignKey(KnowledgeConcept, on_delete=models.PROTECT, related_name='question_edges')
    tag = models.ForeignKey(
        Tag,
        blank=True,
        null=True,
        on_delete=models.PROTECT,
        related_name='question_concept_edges',
    )
    tag_mapping = models.ForeignKey(
        ConceptTagMapping,
        blank=True,
        null=True,
        on_delete=models.PROTECT,
        related_name='question_edges',
    )
    source = models.CharField(max_length=30, choices=Source.choices, default=Source.TAG)
    provider = models.CharField(max_length=128, blank=True, default='')
    confidence = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal('1.0000'),
        validators=[MinValueValidator(Decimal('0.0000')), MaxValueValidator(Decimal('1.0000'))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'question_concept_edges'
        constraints = [
            models.UniqueConstraint(fields=['question', 'concept'], name='unique_question_concept_edge'),
        ]
        indexes = [
            models.Index(fields=['question', 'concept'], name='qedge_question_concept_idx'),
            models.Index(fields=['concept'], name='question_edge_concept_idx'),
            models.Index(fields=['tag'], name='question_edge_tag_idx'),
        ]

    def __str__(self):
        return f'{self.question_id} -> {self.concept}'


class UserKnowledgeGraphState(models.Model):
    class Status(models.TextChoices):
        FRESH = 'fresh', 'Fresh'
        STALE = 'stale', 'Stale'
        REBUILDING = 'rebuilding', 'Rebuilding'
        FAILED = 'failed', 'Failed'

    class StaleReason(models.TextChoices):
        ACTIVITY_SYNC_FAILED = 'activity_sync_failed', 'Activity sync failed'
        ACTIVITY_REBUILD_FAILED = 'activity_rebuild_failed', 'Activity rebuild failed'
        MANUAL_REBUILD_REQUESTED = 'manual_rebuild_requested', 'Manual rebuild requested'
        UNKNOWN = 'unknown', 'Unknown'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='knowledge_graph_state',
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FRESH)
    stale_reason = models.CharField(max_length=64, choices=StaleReason.choices, blank=True, default='')
    last_error_message = models.CharField(max_length=255, blank=True, default='')
    last_failed_phase = models.CharField(max_length=80, blank=True, default='')
    last_rebuild_started_at = models.DateTimeField(blank=True, null=True)
    last_rebuild_finished_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_knowledge_graph_states'
        indexes = [
            models.Index(fields=['user'], name='ukgstate_user_idx'),
            models.Index(fields=['status'], name='ukgstate_status_idx'),
        ]

    def __str__(self):
        return f'{self.user_id} graph {self.status}'


class UserConceptActivity(models.Model):
    class ActivityType(models.TextChoices):
        AUTHORED_QUESTION = 'authored_question', 'Authored question'
        POSTED_SOLUTION = 'posted_solution', 'Posted solution'
        BEST_SOLUTION = 'best_solution', 'Best solution'
        APPROVED_EDIT = 'approved_edit', 'Approved edit'
        QUESTION_UPVOTE = 'question_upvote', 'Question upvote'
        SOLUTION_UPVOTE = 'solution_upvote', 'Solution upvote'

    class Source(models.TextChoices):
        QUESTION = 'question', 'Question'
        SOLUTION = 'solution', 'Solution'
        BEST_SOLUTION = 'best_solution', 'Best solution'
        APPROVED_EDIT = 'approved_edit', 'Approved edit'
        REPUTATION_TRANSACTION = 'reputation_transaction', 'Reputation transaction'
        REBUILD = 'rebuild', 'Rebuild'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='concept_activities',
    )
    concept = models.ForeignKey(
        KnowledgeConcept,
        on_delete=models.PROTECT,
        related_name='user_activities',
    )
    activity_type = models.CharField(max_length=40, choices=ActivityType.choices)
    weight_delta = models.DecimalField(max_digits=8, decimal_places=4)
    source = models.CharField(max_length=40, choices=Source.choices)
    provider = models.CharField(max_length=128, blank=True, default='')
    confidence = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal('1.0000'),
        validators=[MinValueValidator(Decimal('0.0000')), MaxValueValidator(Decimal('1.0000'))],
    )
    source_content_type = models.ForeignKey(ContentType, on_delete=models.PROTECT)
    source_object_id = models.UUIDField()
    source_object = GenericForeignKey('source_content_type', 'source_object_id')
    related_question = models.ForeignKey(
        Question,
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name='user_concept_activities',
    )
    idempotency_key = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_concept_activities'
        indexes = [
            models.Index(fields=['user', 'concept'], name='ucact_user_concept_idx'),
            models.Index(fields=['user', 'activity_type'], name='ucact_user_type_idx'),
            models.Index(fields=['concept', 'activity_type'], name='ucact_concept_type_idx'),
            models.Index(fields=['source_content_type', 'source_object_id'], name='ucact_source_object_idx'),
        ]

    def __str__(self):
        return f'{self.user_id} {self.activity_type} {self.concept_id}'
