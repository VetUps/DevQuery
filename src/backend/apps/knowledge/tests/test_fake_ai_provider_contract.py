from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.knowledge.models import ConceptTagMapping, KnowledgeConcept, QuestionConceptEdge
from apps.knowledge.providers import ConceptCandidate
from apps.knowledge.services import KnowledgeGraphBuildError, build_question_graph
from apps.qa.models import Question, Tag


ML_SOURCE = 'provider'
ML_PROVIDER = 'fake-ml-provider'


class FakeMlProvider:
    provider_name = ML_PROVIDER

    def __init__(self, candidates):
        self.candidates = candidates
        self.extract_calls = 0

    def extract(self, tags):
        self.extract_calls += 1
        return list(self.candidates)


class LazyInvalidCandidateProvider:
    provider_name = ML_PROVIDER

    def __init__(self, candidate_kwargs):
        self.candidate_kwargs = candidate_kwargs

    def extract(self, tags):
        return [ConceptCandidate(**self.candidate_kwargs)]


class UnsafeFailingProvider:
    provider_name = ML_PROVIDER

    def extract(self, tags):
        raise RuntimeError('secret-token=abc123 stack trace provider internals')


class FakeAiProviderGraphContractTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='fake-ml-asker@example.com',
            user_name='fake-ml-asker',
            password='not-a-secret',
        )
        self.question = Question.objects.create(
            user=self.user,
            question_title='How do embeddings identify Django knowledge?',
            question_body='I want future ML candidates to become graph concepts safely.',
        )
        self.django = Tag.objects.create(name='Django')
        self.python = Tag.objects.create(name='Python')
        self.question.tags.set([self.django, self.python])

    def ml_candidate(self, **overrides):
        kwargs = {
            'name': 'Async Django Patterns',
            'slug': 'async-django-patterns',
            'source': ML_SOURCE,
            'provider': ML_PROVIDER,
            'confidence': Decimal('0.8125'),
            'originating_tag_id': None,
            'originating_tag_name': None,
        }
        kwargs.update(overrides)
        return ConceptCandidate(**kwargs)

    def assert_graph_counts(self, *, concepts=0, mappings=0, edges=0):
        self.assertEqual(KnowledgeConcept.objects.count(), concepts)
        self.assertEqual(ConceptTagMapping.objects.count(), mappings)
        self.assertEqual(QuestionConceptEdge.objects.count(), edges)

    def test_no_originating_tag_ml_candidate_creates_concept_and_question_edge_without_tag_mapping(self):
        provider = FakeMlProvider([self.ml_candidate()])

        summary = build_question_graph(self.question, provider=provider)

        self.assertEqual(provider.extract_calls, 1)
        self.assertEqual(summary.created_concepts, 1)
        self.assertEqual(summary.created_mappings, 0)
        self.assertEqual(summary.created_edges, 1)
        self.assert_graph_counts(concepts=1, mappings=0, edges=1)

        concept = KnowledgeConcept.objects.get(slug='async-django-patterns')
        self.assertEqual(concept.name, 'Async Django Patterns')
        self.assertEqual(concept.source, ML_SOURCE)
        self.assertEqual(concept.provider, ML_PROVIDER)
        self.assertEqual(concept.confidence, Decimal('0.8125'))

        edge = QuestionConceptEdge.objects.get(question=self.question, concept=concept)
        self.assertIsNone(edge.tag)
        self.assertIsNone(edge.tag_mapping)
        self.assertEqual(edge.source, ML_SOURCE)
        self.assertEqual(edge.provider, ML_PROVIDER)
        self.assertEqual(edge.confidence, Decimal('0.8125'))

    def test_duplicate_ml_slugs_are_deduplicated_and_repeat_builds_are_idempotent(self):
        provider = FakeMlProvider([
            self.ml_candidate(name='Async Django Patterns', slug='async-django-patterns', confidence=Decimal('0.8125')),
            self.ml_candidate(name='Duplicate Async Django', slug='async-django-patterns', confidence=Decimal('0.6000')),
            self.ml_candidate(name='Python Embeddings', slug='python-embeddings', confidence=Decimal('0.7000')),
        ])

        first_summary = build_question_graph(self.question, provider=provider)
        second_summary = build_question_graph(self.question, provider=provider)

        self.assertEqual(first_summary.created_concepts, 2)
        self.assertEqual(first_summary.created_edges, 2)
        self.assertEqual(first_summary.created_mappings, 0)
        self.assertEqual(second_summary.created_concepts, 0)
        self.assertEqual(second_summary.updated_concepts, 0)
        self.assertEqual(second_summary.created_edges, 0)
        self.assertEqual(second_summary.updated_edges, 0)
        self.assertEqual(second_summary.removed_edges, 0)
        self.assert_graph_counts(concepts=2, mappings=0, edges=2)
        self.assertEqual(
            list(KnowledgeConcept.objects.order_by('slug').values_list('slug', 'name')),
            [('async-django-patterns', 'Async Django Patterns'), ('python-embeddings', 'Python Embeddings')],
        )

    def test_originating_tag_outside_question_rejects_candidate_and_rolls_back_partial_graph_writes(self):
        outside_tag = Tag.objects.create(name='Outside')
        preexisting = KnowledgeConcept.objects.create(
            slug='preexisting-concept',
            name='Preexisting Concept',
            source=ML_SOURCE,
            provider=ML_PROVIDER,
            confidence=Decimal('0.5000'),
        )
        provider = FakeMlProvider([
            self.ml_candidate(name='First Valid ML Concept', slug='first-valid-ml-concept'),
            self.ml_candidate(
                name='Foreign Tag Concept',
                slug='foreign-tag-concept',
                originating_tag_id=outside_tag.pk,
                originating_tag_name=outside_tag.name,
            ),
        ])

        with self.assertRaisesRegex(KnowledgeGraphBuildError, 'rolled back'):
            build_question_graph(self.question, provider=provider)

        self.assertEqual(list(KnowledgeConcept.objects.values_list('pk', flat=True)), [preexisting.pk])
        self.assertFalse(KnowledgeConcept.objects.filter(slug='first-valid-ml-concept').exists())
        self.assert_graph_counts(concepts=1, mappings=0, edges=0)

    def test_malformed_provider_outputs_are_rejected_without_partial_persistence(self):
        malformed_providers = [
            FakeMlProvider([object()]),
            LazyInvalidCandidateProvider({
                'name': 'Blank Source',
                'slug': 'blank-source',
                'source': ' ',
                'provider': ML_PROVIDER,
                'confidence': Decimal('0.5000'),
            }),
            LazyInvalidCandidateProvider({
                'name': 'Blank Provider',
                'slug': 'blank-provider',
                'source': ML_SOURCE,
                'provider': ' ',
                'confidence': Decimal('0.5000'),
            }),
            LazyInvalidCandidateProvider({
                'name': 'Bad Confidence',
                'slug': 'bad-confidence',
                'source': ML_SOURCE,
                'provider': ML_PROVIDER,
                'confidence': Decimal('1.1000'),
            }),
        ]

        for provider in malformed_providers:
            with self.subTest(provider=provider.__class__.__name__):
                with self.assertRaisesRegex(KnowledgeGraphBuildError, 'invalid candidates'):
                    build_question_graph(self.question, provider=provider)
                self.assert_graph_counts(concepts=0, mappings=0, edges=0)

    def test_unsafe_provider_failures_are_redacted_and_leave_no_graph_rows(self):
        with self.assertRaisesRegex(KnowledgeGraphBuildError, 'concept extraction failed') as context:
            build_question_graph(self.question, provider=UnsafeFailingProvider())

        safe_message = str(context.exception)
        self.assertNotIn('secret-token', safe_message)
        self.assertNotIn('stack trace provider internals', safe_message)
        self.assert_graph_counts(concepts=0, mappings=0, edges=0)
