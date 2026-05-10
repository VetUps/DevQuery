from decimal import Decimal
import uuid

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from apps.knowledge.models import ConceptTagMapping, KnowledgeConcept, QuestionConceptEdge
from apps.qa.models import Question, Tag


class KnowledgeGraphModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='asker@example.com',
            user_name='asker',
            password='not-a-secret',
        )
        self.tag = Tag.objects.create(name='django')
        self.question = Question.objects.create(
            user=self.user,
            question_title='How do Django migrations work?',
            question_body='I need to understand migration dependencies.',
        )
        self.question.tags.add(self.tag)

    def test_concept_persists_identity_source_provider_confidence_and_timestamps(self):
        concept = KnowledgeConcept.objects.create(
            slug='django',
            name='Django',
            source=KnowledgeConcept.Source.TAG,
            provider='tag-provider-v1',
            confidence=Decimal('0.9500'),
        )

        self.assertEqual(concept.slug, 'django')
        self.assertEqual(concept.name, 'Django')
        self.assertEqual(concept.source, KnowledgeConcept.Source.TAG)
        self.assertEqual(concept.provider, 'tag-provider-v1')
        self.assertEqual(concept.confidence, Decimal('0.9500'))
        self.assertIsNotNone(concept.created_at)
        self.assertIsNotNone(concept.updated_at)

    def test_concept_slug_and_name_are_unique(self):
        KnowledgeConcept.objects.create(slug='django', name='Django')

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                KnowledgeConcept.objects.create(slug='django', name='Django framework')

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                KnowledgeConcept.objects.create(slug='django-framework', name='Django')

    def test_mapping_links_tag_to_concept_and_rejects_duplicates(self):
        concept = KnowledgeConcept.objects.create(slug='django', name='Django')
        mapping = ConceptTagMapping.objects.create(
            tag=self.tag,
            concept=concept,
            source=ConceptTagMapping.Source.TAG,
            provider='tag-provider-v1',
            confidence=Decimal('0.8750'),
        )

        self.assertEqual(mapping.tag, self.tag)
        self.assertEqual(mapping.concept, concept)
        self.assertEqual(mapping.source, ConceptTagMapping.Source.TAG)
        self.assertEqual(mapping.provider, 'tag-provider-v1')
        self.assertEqual(mapping.confidence, Decimal('0.8750'))

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ConceptTagMapping.objects.create(tag=self.tag, concept=concept)

    def test_question_edge_links_question_to_concept_with_optional_tag_mapping_provenance(self):
        concept = KnowledgeConcept.objects.create(slug='django', name='Django')
        mapping = ConceptTagMapping.objects.create(tag=self.tag, concept=concept)
        edge = QuestionConceptEdge.objects.create(
            question=self.question,
            concept=concept,
            tag=self.tag,
            tag_mapping=mapping,
            source=QuestionConceptEdge.Source.TAG,
            provider='tag-provider-v1',
            confidence=Decimal('0.8000'),
        )

        self.assertEqual(edge.question, self.question)
        self.assertEqual(edge.concept, concept)
        self.assertEqual(edge.tag, self.tag)
        self.assertEqual(edge.tag_mapping, mapping)
        self.assertEqual(edge.source, QuestionConceptEdge.Source.TAG)
        self.assertEqual(edge.provider, 'tag-provider-v1')
        self.assertEqual(edge.confidence, Decimal('0.8000'))

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                QuestionConceptEdge.objects.create(question=self.question, concept=concept)

    def test_question_delete_cascades_edges_without_deleting_concepts_or_mappings(self):
        concept = KnowledgeConcept.objects.create(slug='django', name='Django')
        mapping = ConceptTagMapping.objects.create(tag=self.tag, concept=concept)
        QuestionConceptEdge.objects.create(
            question=self.question,
            concept=concept,
            tag=self.tag,
            tag_mapping=mapping,
        )

        self.question.delete()

        self.assertFalse(QuestionConceptEdge.objects.exists())
        self.assertTrue(KnowledgeConcept.objects.filter(pk=concept.pk).exists())
        self.assertTrue(ConceptTagMapping.objects.filter(pk=mapping.pk).exists())

    def test_missing_related_objects_are_rejected_by_foreign_key_constraints(self):
        concept = KnowledgeConcept.objects.create(slug='django', name='Django')

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ConceptTagMapping.objects.create(tag_id=999999, concept=concept)
                connection.check_constraints()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ConceptTagMapping.objects.create(tag=self.tag, concept_id=999999)
                connection.check_constraints()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                QuestionConceptEdge.objects.create(question_id=uuid.uuid4(), concept=concept)
                connection.check_constraints()

    def test_related_tag_and_concept_deletes_are_protected_from_orphaning_graph_rows(self):
        concept = KnowledgeConcept.objects.create(slug='django', name='Django')
        ConceptTagMapping.objects.create(tag=self.tag, concept=concept)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.tag.delete()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                concept.delete()
