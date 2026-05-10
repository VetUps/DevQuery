from decimal import Decimal

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
