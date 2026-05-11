from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.knowledge.models import ConceptTagMapping, KnowledgeConcept, QuestionConceptEdge
from apps.knowledge.providers import ConceptCandidate, TAG_BASED_PROVIDER, TAG_SOURCE
from apps.knowledge.services import KnowledgeGraphBuildError, build_question_graph
from apps.qa.models import Question, Tag


class StaticProvider:
    provider_name = 'static-test-provider'

    def __init__(self, candidates):
        self.candidates = candidates

    def extract(self, tags):
        return list(self.candidates)


class FailingProvider:
    provider_name = 'failing-test-provider'

    def extract(self, tags):
        raise RuntimeError('unsafe provider detail')


class KnowledgeGraphServiceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='graph-asker@example.com',
            user_name='graph-asker',
            password='not-a-secret',
        )
        self.question = Question.objects.create(
            user=self.user,
            question_title='How do Django tags become concepts?',
            question_body='I need concept graph rows for my tagged question.',
        )

    def tag_question(self, *names):
        tags = [Tag.objects.create(name=name) for name in names]
        self.question.tags.set(tags)
        return tags

    def test_first_build_persists_concepts_mappings_edges_and_provenance(self):
        django, python = self.tag_question('Django', 'Python')

        summary = build_question_graph(self.question)

        self.assertEqual(summary.created_concepts, 2)
        self.assertEqual(summary.created_mappings, 2)
        self.assertEqual(summary.created_edges, 2)
        self.assertEqual(summary.updated_concepts, 0)
        self.assertEqual(summary.removed_edges, 0)
        self.assertEqual(KnowledgeConcept.objects.count(), 2)
        self.assertEqual(ConceptTagMapping.objects.count(), 2)
        self.assertEqual(QuestionConceptEdge.objects.count(), 2)

        django_concept = KnowledgeConcept.objects.get(slug='django')
        django_mapping = ConceptTagMapping.objects.get(tag=django, concept=django_concept)
        django_edge = QuestionConceptEdge.objects.get(question=self.question, concept=django_concept)

        self.assertEqual(django_concept.name, 'Django')
        self.assertEqual(django_concept.source, TAG_SOURCE)
        self.assertEqual(django_concept.provider, TAG_BASED_PROVIDER)
        self.assertEqual(django_concept.confidence, Decimal('1.0000'))
        self.assertEqual(django_mapping.source, TAG_SOURCE)
        self.assertEqual(django_mapping.provider, TAG_BASED_PROVIDER)
        self.assertEqual(django_mapping.confidence, Decimal('1.0000'))
        self.assertEqual(django_edge.tag, django)
        self.assertEqual(django_edge.tag_mapping, django_mapping)
        self.assertEqual(django_edge.source, TAG_SOURCE)
        self.assertEqual(django_edge.provider, TAG_BASED_PROVIDER)
        self.assertEqual(django_edge.confidence, Decimal('1.0000'))
        self.assertTrue(QuestionConceptEdge.objects.filter(tag=python).exists())

    def test_repeat_build_keeps_row_counts_stable(self):
        self.tag_question('Django', 'Python')
        build_question_graph(self.question)

        summary = build_question_graph(self.question)

        self.assertEqual(summary.created_concepts, 0)
        self.assertEqual(summary.updated_concepts, 0)
        self.assertEqual(summary.created_mappings, 0)
        self.assertEqual(summary.updated_mappings, 0)
        self.assertEqual(summary.created_edges, 0)
        self.assertEqual(summary.updated_edges, 0)
        self.assertEqual(summary.removed_edges, 0)
        self.assertEqual(KnowledgeConcept.objects.count(), 2)
        self.assertEqual(ConceptTagMapping.objects.count(), 2)
        self.assertEqual(QuestionConceptEdge.objects.count(), 2)

    def test_changed_tags_replace_stale_edges_with_current_tag_edges(self):
        django, python = self.tag_question('Django', 'Python')
        build_question_graph(self.question)
        python_edge_id = QuestionConceptEdge.objects.get(tag=python).pk
        drf = Tag.objects.create(name='Django REST')
        self.question.tags.set([django, drf])

        summary = build_question_graph(self.question)

        self.assertEqual(summary.created_concepts, 1)
        self.assertEqual(summary.created_mappings, 1)
        self.assertEqual(summary.created_edges, 1)
        self.assertEqual(summary.removed_edge_ids, [python_edge_id])
        self.assertEqual(
            list(QuestionConceptEdge.objects.filter(question=self.question).order_by('concept__slug').values_list('concept__slug', flat=True)),
            ['django', 'django-rest'],
        )
        self.assertEqual(
            set(QuestionConceptEdge.objects.filter(question=self.question).values_list('tag__name', flat=True)),
            {'Django', 'Django REST'},
        )
        self.assertFalse(QuestionConceptEdge.objects.filter(tag=python).exists())
        self.assertTrue(KnowledgeConcept.objects.filter(slug='python').exists())
        self.assertTrue(ConceptTagMapping.objects.filter(tag=python).exists())

    def test_empty_tags_create_no_rows_and_remove_existing_question_edges(self):
        self.tag_question('Django')
        build_question_graph(self.question)
        self.question.tags.clear()

        summary = build_question_graph(self.question)

        self.assertEqual(summary.created_concepts, 0)
        self.assertEqual(summary.created_mappings, 0)
        self.assertEqual(summary.created_edges, 0)
        self.assertEqual(summary.removed_edges, 1)
        self.assertEqual(QuestionConceptEdge.objects.filter(question=self.question).count(), 0)

    def test_duplicate_candidates_are_collapsed_before_upsert(self):
        (tag,) = self.tag_question('Django')
        provider = StaticProvider([
            ConceptCandidate(
                name='Django',
                slug='django',
                source=TAG_SOURCE,
                provider='static-test-provider',
                confidence=Decimal('0.9000'),
                originating_tag_id=tag.pk,
                originating_tag_name='Django',
            ),
            ConceptCandidate(
                name='Django duplicate',
                slug='django',
                source=TAG_SOURCE,
                provider='static-test-provider',
                confidence=Decimal('0.7000'),
                originating_tag_id=tag.pk,
                originating_tag_name='Django',
            ),
        ])

        summary = build_question_graph(self.question, provider=provider)

        self.assertEqual(summary.created_concepts, 1)
        self.assertEqual(summary.created_mappings, 1)
        self.assertEqual(summary.created_edges, 1)
        self.assertEqual(KnowledgeConcept.objects.count(), 1)
        self.assertEqual(ConceptTagMapping.objects.count(), 1)
        self.assertEqual(QuestionConceptEdge.objects.count(), 1)
        self.assertEqual(KnowledgeConcept.objects.get().name, 'Django')

    def test_provider_failure_rolls_back_without_leaking_internal_error_text(self):
        self.tag_question('Django')

        with self.assertRaisesRegex(KnowledgeGraphBuildError, 'concept extraction failed') as context:
            build_question_graph(self.question, provider=FailingProvider())

        self.assertNotIn('unsafe provider detail', str(context.exception))
        self.assertEqual(KnowledgeConcept.objects.count(), 0)
        self.assertEqual(ConceptTagMapping.objects.count(), 0)
        self.assertEqual(QuestionConceptEdge.objects.count(), 0)

    def test_malformed_candidates_are_rejected_before_partial_persistence(self):
        self.tag_question('Django')
        provider = StaticProvider([object()])

        with self.assertRaisesRegex(KnowledgeGraphBuildError, 'invalid candidates'):
            build_question_graph(self.question, provider=provider)

        self.assertEqual(KnowledgeConcept.objects.count(), 0)
        self.assertEqual(ConceptTagMapping.objects.count(), 0)
        self.assertEqual(QuestionConceptEdge.objects.count(), 0)

    def test_database_constraint_failure_rolls_back_graph_write_safely(self):
        (tag,) = self.tag_question('Django')
        KnowledgeConcept.objects.create(slug='existing-django', name='Django')
        provider = StaticProvider([
            ConceptCandidate(
                name='Django',
                slug='django',
                source=TAG_SOURCE,
                provider='static-test-provider',
                confidence=Decimal('0.9000'),
                originating_tag_id=tag.pk,
                originating_tag_name='Django',
            )
        ])

        with self.assertRaisesRegex(KnowledgeGraphBuildError, 'rolled back'):
            build_question_graph(self.question, provider=provider)

        self.assertEqual(KnowledgeConcept.objects.count(), 1)
        self.assertEqual(ConceptTagMapping.objects.count(), 0)
        self.assertEqual(QuestionConceptEdge.objects.count(), 0)
