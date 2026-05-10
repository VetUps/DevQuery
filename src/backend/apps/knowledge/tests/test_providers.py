from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from apps.knowledge.providers import (
    ConceptCandidate,
    ConceptExtractionError,
    ConceptExtractionProvider,
    TAG_BASED_PROVIDER,
    TAG_SOURCE,
    TagBasedConceptExtractionProvider,
)
from apps.qa.models import Tag


class TagBasedConceptExtractionProviderTests(TestCase):
    def setUp(self):
        self.provider = TagBasedConceptExtractionProvider()

    def test_provider_matches_explicit_extraction_boundary(self):
        self.assertIsInstance(self.provider, ConceptExtractionProvider)
        self.assertEqual(self.provider.provider_name, TAG_BASED_PROVIDER)

    def test_extracts_existing_tags_with_deterministic_slug_order_and_metadata(self):
        django = Tag.objects.create(name='Django')
        python = Tag.objects.create(name='Python')

        candidates = self.provider.extract([python, django])

        self.assertEqual([candidate.slug for candidate in candidates], ['django', 'python'])
        self.assertEqual(candidates[0].name, 'Django')
        self.assertEqual(candidates[0].source, TAG_SOURCE)
        self.assertEqual(candidates[0].provider, TAG_BASED_PROVIDER)
        self.assertEqual(candidates[0].confidence, Decimal('1.0'))
        self.assertEqual(candidates[0].originating_tag_id, django.pk)
        self.assertEqual(candidates[0].originating_tag_name, 'Django')

    def test_collapses_duplicate_concept_slugs_without_mutating_tags(self):
        first = Tag.objects.create(name='Django REST')
        duplicate = Tag.objects.create(name='django-rest')
        original_names = list(Tag.objects.order_by('pk').values_list('name', flat=True))

        with self.assertNumQueries(0):
            candidates = self.provider.extract([duplicate, first])

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].slug, 'django-rest')
        self.assertEqual(candidates[0].originating_tag_id, duplicate.pk)
        self.assertEqual(list(Tag.objects.order_by('pk').values_list('name', flat=True)), original_names)
        self.assertEqual(Tag.objects.count(), 2)

    def test_extract_accepts_querysets_but_only_reads_existing_tags(self):
        Tag.objects.create(name='Python')
        Tag.objects.create(name='Django')

        with self.assertNumQueries(1):
            candidates = self.provider.extract(Tag.objects.order_by('name'))

        self.assertEqual([candidate.slug for candidate in candidates], ['django', 'python'])
        self.assertEqual(Tag.objects.count(), 2)

    def test_empty_inputs_return_empty_list(self):
        self.assertEqual(self.provider.extract([]), [])
        self.assertEqual(self.provider.extract(Tag.objects.none()), [])

    def test_non_ascii_and_lowercase_names_are_preserved_with_unicode_slug(self):
        tag = Tag.objects.create(name='  Django Фреймворк  ')

        candidates = self.provider.extract([tag])

        self.assertEqual(candidates, [
            ConceptCandidate(
                name='Django Фреймворк',
                slug='django-фреймворк',
                source=TAG_SOURCE,
                provider=TAG_BASED_PROVIDER,
                confidence=Decimal('1.0'),
                originating_tag_id=tag.pk,
                originating_tag_name='Django Фреймворк',
            )
        ])

    def test_rejects_invalid_objects_and_blank_tag_names_safely(self):
        with self.assertRaisesRegex(ConceptExtractionError, 'Tag instances'):
            self.provider.extract([object()])

        blank_tag = Tag(name='   ')
        with self.assertRaisesRegex(ConceptExtractionError, 'tag.name'):
            self.provider.extract([blank_tag])

    def test_candidate_rejects_malformed_data_before_persistence(self):
        invalid_cases = [
            {'name': '', 'slug': 'django', 'source': TAG_SOURCE, 'provider': TAG_BASED_PROVIDER, 'confidence': 1},
            {'name': 'Django', 'slug': '', 'source': TAG_SOURCE, 'provider': TAG_BASED_PROVIDER, 'confidence': 1},
            {'name': 'Django', 'slug': 'django', 'source': '', 'provider': TAG_BASED_PROVIDER, 'confidence': 1},
            {'name': 'Django', 'slug': 'django', 'source': TAG_SOURCE, 'provider': '', 'confidence': 1},
            {'name': 'Django', 'slug': 'django', 'source': TAG_SOURCE, 'provider': TAG_BASED_PROVIDER, 'confidence': '1.5'},
        ]

        for candidate_kwargs in invalid_cases:
            with self.subTest(candidate_kwargs=candidate_kwargs):
                with self.assertRaises(ConceptExtractionError):
                    ConceptCandidate(**candidate_kwargs)

    def test_no_external_ai_keys_or_network_clients_are_required(self):
        tag = Tag.objects.create(name='Django')

        with patch.dict('os.environ', {}, clear=True):
            candidates = self.provider.extract([tag])

        self.assertEqual([candidate.slug for candidate in candidates], ['django'])
