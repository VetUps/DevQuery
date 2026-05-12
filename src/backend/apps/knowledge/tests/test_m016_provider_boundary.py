import socket
from pathlib import Path

from django.test import SimpleTestCase, override_settings

from apps.knowledge.semantic_providers import (
    FakeKnowledgeGraphEmbeddingProvider,
    FakeKnowledgeGraphGroupingProvider,
    KnowledgeGraphEmbeddingConfig,
    KnowledgeGraphEmbeddingRequest,
    KnowledgeGraphGroupingConfig,
    KnowledgeGraphGroupingRequest,
    KnowledgeGraphProviderConfigurationError,
    KnowledgeGraphProviderError,
    KnowledgeGraphProviderMalformedResponse,
    KnowledgeGraphProviderTimeout,
    KnowledgeGraphSemanticConfig,
    parse_grouping_response,
    validate_embedding_vectors,
)


class KnowledgeGraphProviderBoundaryTests(SimpleTestCase):
    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=False,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=True,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY=None,
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL=None,
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL=None,
        KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=1536,
        KNOWLEDGE_GRAPH_EMBEDDING_TIMEOUT_SECONDS=10.0,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY=None,
        KNOWLEDGE_GRAPH_CHAT_BASE_URL=None,
        KNOWLEDGE_GRAPH_CHAT_MODEL=None,
        KNOWLEDGE_GRAPH_CHAT_TIMEOUT_SECONDS=20.0,
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_config_defaults_are_disabled_dry_run_and_secret_free(self):
        semantic = KnowledgeGraphSemanticConfig.from_django_settings()
        embedding = KnowledgeGraphEmbeddingConfig.from_django_settings()
        grouping = KnowledgeGraphGroupingConfig.from_django_settings()

        self.assertFalse(semantic.enabled)
        self.assertTrue(semantic.dry_run)
        self.assertEqual(semantic.rebuild_budget_cap, 0.0)
        self.assertIsNone(embedding.api_key)
        self.assertIsNone(embedding.base_url)
        self.assertIsNone(embedding.model)
        self.assertEqual(embedding.dimensions, 1536)
        self.assertEqual(embedding.timeout_seconds, 10.0)
        self.assertEqual(embedding.price_per_1k_tokens, 0.0)
        self.assertIsNone(grouping.api_key)
        self.assertIsNone(grouping.base_url)
        self.assertIsNone(grouping.model)
        self.assertEqual(grouping.timeout_seconds, 20.0)
        self.assertEqual(grouping.price_per_1k_tokens, 0.0)

        embedding.validate(enabled=semantic.enabled)
        grouping.validate(enabled=semantic.enabled)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY=' ',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL=None,
        KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=1536,
        KNOWLEDGE_GRAPH_EMBEDDING_TIMEOUT_SECONDS=10.0,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY=None,
        KNOWLEDGE_GRAPH_CHAT_BASE_URL=' ',
        KNOWLEDGE_GRAPH_CHAT_MODEL='',
        KNOWLEDGE_GRAPH_CHAT_TIMEOUT_SECONDS=20.0,
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_missing_config_when_enabled_raises_safe_configuration_errors(self):
        semantic = KnowledgeGraphSemanticConfig.from_django_settings()

        with self.assertRaisesRegex(KnowledgeGraphProviderConfigurationError, 'embedding API key') as embedding_error:
            KnowledgeGraphEmbeddingConfig.from_django_settings().validate(enabled=semantic.enabled)
        with self.assertRaisesRegex(KnowledgeGraphProviderConfigurationError, 'grouping API key') as grouping_error:
            KnowledgeGraphGroupingConfig.from_django_settings().validate(enabled=semantic.enabled)

        self.assertEqual(embedding_error.exception.code, 'configuration_error')
        self.assertEqual(grouping_error.exception.phase, 'configuration')

    def test_zero_or_negative_config_values_are_rejected_safely(self):
        bad_embedding = KnowledgeGraphEmbeddingConfig(
            api_key='key',
            base_url='https://example.test/embeddings',
            model='embedding-model',
            dimensions=0,
            timeout_seconds=-1,
            price_per_1k_tokens=-0.01,
        )
        bad_grouping = KnowledgeGraphGroupingConfig(
            api_key='key',
            base_url='https://example.test/chat',
            model='chat-model',
            timeout_seconds=0,
            price_per_1k_tokens=-0.01,
        )

        with self.assertRaisesRegex(KnowledgeGraphProviderConfigurationError, 'dimensions'):
            bad_embedding.validate(enabled=True)
        with self.assertRaisesRegex(KnowledgeGraphProviderConfigurationError, 'timeout'):
            bad_grouping.validate(enabled=True)

    def test_strict_grouping_schema_rejects_non_json_oversized_wrong_shape_and_extra_fields(self):
        unsafe_raw = 'sk_live_abc user@example.com Traceback question body'
        malformed_payloads = [
            unsafe_raw,
            '{"groups": []' + (' ' * (65 * 1024)),
            {'groups': [{'group_key': 'g', 'label': 'Label', 'concept_slugs': [], 'rationale': 'why', 'confidence': 1.0}]},
            {'groups': [{'group_key': 'g', 'label': 'Label', 'concept_slugs': ['a'], 'rationale': 'why', 'confidence': 1.0, 'raw': unsafe_raw}]},
            {'groups': [{'group_key': 'g', 'label': 'Label', 'concept_slugs': ['a'], 'rationale': 'why', 'confidence': 1.1}]},
        ]

        for payload in malformed_payloads:
            with self.subTest(payload_type=type(payload).__name__):
                with self.assertRaises(KnowledgeGraphProviderMalformedResponse) as context:
                    parse_grouping_response(payload)
                safe_message = str(context.exception)
                self.assertNotIn('sk_live_', safe_message)
                self.assertNotIn('user@example.com', safe_message)
                self.assertNotIn('question body', safe_message)
                self.assertNotIn('Traceback', safe_message)

    def test_fake_providers_happy_path_is_deterministic_and_exposes_metadata(self):
        embedding_provider = FakeKnowledgeGraphEmbeddingProvider(dimensions=4)
        grouping_provider = FakeKnowledgeGraphGroupingProvider()

        first = embedding_provider.embed(KnowledgeGraphEmbeddingRequest(texts=['Django graph', 'Python graph']))
        second = embedding_provider.embed(KnowledgeGraphEmbeddingRequest(texts=['Django graph', 'Python graph']))
        grouping = grouping_provider.group(KnowledgeGraphGroupingRequest(concepts=[
            {'slug': 'python'},
            {'slug': 'django'},
            {'slug': 'python'},
        ]))

        self.assertEqual(first.vectors, second.vectors)
        self.assertEqual(len(first.vectors), 2)
        self.assertEqual(len(first.vectors[0]), 4)
        self.assertEqual(first.metadata.provider, 'fake-knowledge-graph-embedding')
        self.assertEqual(first.metadata.model, 'fake-embedding-v1')
        self.assertGreater(first.estimated_tokens, 0)
        self.assertEqual(grouping.metadata.provider, 'fake-knowledge-graph-grouping')
        self.assertEqual(grouping.groups[0].concept_slugs, ['django', 'python'])
        self.assertEqual(grouping.groups[0].confidence, 1.0)

    def test_malformed_embedding_dimensions_and_value_types_are_rejected_without_raw_values(self):
        unsafe_value = 'sk_live_abc user@example.com question body Traceback'
        malformed_vectors = [
            'not-a-list',
            [[0.1, 0.2]],
            [[0.1, unsafe_value, 0.3]],
        ]

        for vectors in malformed_vectors:
            with self.subTest(vectors=vectors):
                with self.assertRaises(KnowledgeGraphProviderMalformedResponse) as context:
                    validate_embedding_vectors(vectors, expected_count=1, expected_dimensions=3)
                safe_message = str(context.exception)
                self.assertNotIn('sk_live_', safe_message)
                self.assertNotIn('user@example.com', safe_message)
                self.assertNotIn('question body', safe_message)
                self.assertNotIn('Traceback', safe_message)

    def test_timeout_and_provider_errors_are_redacted_and_expose_safe_diagnostics(self):
        unsafe_raw = 'sk_live_abc user@example.com question body Traceback'
        timeout_error = KnowledgeGraphProviderTimeout(
            'Knowledge graph embedding provider timed out.',
            provider='provider-a',
            model='model-a',
            phase='embedding',
        )
        provider_error = KnowledgeGraphProviderError(
            'Knowledge graph provider request failed.',
            provider='provider-b',
            model='model-b',
            phase='grouping',
        )

        self.assertIsInstance(socket.timeout('socket timed out'), OSError)
        for error in [timeout_error, provider_error]:
            safe_message = str(error)
            self.assertNotIn(unsafe_raw, safe_message)
            self.assertNotIn('sk_live_', safe_message)
            self.assertIn('code', error.diagnostics)
            self.assertIn('phase', error.diagnostics)
            self.assertIn('provider', error.diagnostics)
            self.assertIn('model', error.diagnostics)

    def test_source_code_is_isolated_from_question_draft_assistant_namespace(self):
        knowledge_root = Path(__file__).resolve().parents[1]
        source_paths = [
            knowledge_root / 'semantic_providers.py',
            knowledge_root / 'services' / 'semantic_rebuild_service.py',
        ]
        forbidden_terms = {
            'QUESTION_DRAFT_ASSISTANT',
            'question_draft_assistant_service',
            'question_draft_assistant_provider',
            'DraftAssistant',
        }

        leaks_by_path = {}
        for source_path in source_paths:
            with source_path.open(encoding='utf-8') as module_file:
                source = module_file.read()
            leaked_terms = sorted(term for term in forbidden_terms if term in source)
            if leaked_terms:
                leaks_by_path[str(source_path.relative_to(knowledge_root))] = leaked_terms

        self.assertEqual(
            leaks_by_path,
            {},
            f'M016 knowledge graph providers must not import or reuse draft-assistant services/settings: {leaks_by_path}',
        )
