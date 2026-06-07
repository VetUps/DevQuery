import sys
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.contenttypes.models import ContentType
from django.test import SimpleTestCase, TestCase, override_settings

from apps.knowledge.models import (
    KnowledgeConcept,
    UserConceptActivity,
    UserKnowledgeGraphEmbeddingSnapshot,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticState,
)
from apps.knowledge.semantic_providers import (
    DeepSeekKnowledgeGraphGroupingProvider,
    GigaChatKnowledgeGraphEmbeddingProvider,
    KnowledgeGraphEmbeddingConfig,
    KnowledgeGraphEmbeddingRequest,
    KnowledgeGraphGroupingConfig,
    KnowledgeGraphGroupingRequest,
    KnowledgeGraphProviderMalformedResponse,
    KnowledgeGraphProviderTimeout,
    KnowledgeGraphProviderConfigurationError,
)
from apps.knowledge.services.semantic_rebuild_service import (
    create_grouping_provider,
    create_source_provider,
    run_owner_semantic_boundary,
)
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


class _FakeGigaChatClient:
    calls = []
    response = None
    error = None

    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def embeddings(self, texts, model=None):
        self.__class__.calls.append({'texts': list(texts), 'model': model, 'kwargs': self.kwargs})
        if self.__class__.error:
            raise self.__class__.error
        return self.__class__.response


class _FakeDeepSeekCompletions:
    calls = []
    response = None
    error = None

    def create(self, **kwargs):
        self.__class__.calls.append(kwargs)
        if self.__class__.error:
            raise self.__class__.error
        return self.__class__.response


class _ProviderAPIError(Exception):
    status_code = 401
    code = 'Unauthorized'
    type = 'authentication_error'
    request_id = 'req_safe_123'
    body = {
        'code': 'invalid_client',
        'type': 'auth_error',
        'message': 'Bad credentials for user@example.com token sk-live-secret',
    }


class _FakeOpenAIClient:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.chat = SimpleNamespace(completions=_FakeDeepSeekCompletions())


class LiveSemanticProviderAdapterTests(SimpleTestCase):
    def setUp(self):
        _FakeGigaChatClient.calls = []
        _FakeGigaChatClient.response = None
        _FakeGigaChatClient.error = None
        _FakeDeepSeekCompletions.calls = []
        _FakeDeepSeekCompletions.response = None
        _FakeDeepSeekCompletions.error = None

    def embedding_config(self, **overrides):
        values = {
            'api_key': 'test-key',
            'base_url': 'https://gigachat.devices.sberbank.ru/api/v1',
            'model': 'Embeddings',
            'dimensions': 3,
            'timeout_seconds': 7.0,
            'price_per_1k_tokens': 0.0,
            'provider': 'gigachat',
        }
        values.update(overrides)
        return KnowledgeGraphEmbeddingConfig(**values)

    def grouping_config(self, **overrides):
        values = {
            'api_key': 'test-key',
            'base_url': 'https://api.deepseek.com',
            'model': 'deepseek-v4-flash',
            'timeout_seconds': 9.0,
            'price_per_1k_tokens': 0.0,
            'provider': 'deepseek',
        }
        values.update(overrides)
        return KnowledgeGraphGroupingConfig(**values)

    def test_gigachat_embedding_provider_returns_validated_vectors_and_safe_metadata(self):
        _FakeGigaChatClient.response = SimpleNamespace(
            data=[
                SimpleNamespace(embedding=[0.1, 0.2, 0.3]),
                SimpleNamespace(embedding=[0.4, 0.5, 0.6]),
            ]
        )
        with patch.dict(sys.modules, {'gigachat': SimpleNamespace(GigaChat=_FakeGigaChatClient)}):
            result = GigaChatKnowledgeGraphEmbeddingProvider(self.embedding_config()).embed(
                KnowledgeGraphEmbeddingRequest(texts=['Django graph', 'Python graph'])
            )

        self.assertEqual(result.vectors, [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        self.assertEqual(result.metadata.provider, 'gigachat')
        self.assertEqual(result.metadata.model, 'Embeddings')
        self.assertEqual(_FakeGigaChatClient.calls[0]['model'], 'Embeddings')
        self.assertEqual(_FakeGigaChatClient.calls[0]['kwargs']['credentials'], 'test-key')

    def test_blank_optional_gigachat_auth_settings_do_not_override_sdk_defaults(self):
        _FakeGigaChatClient.response = SimpleNamespace(data=[SimpleNamespace(embedding=[0.1, 0.2, 0.3])])
        with self.settings(
            KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER='gigachat',
            KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='test-key',
            KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://gigachat.devices.sberbank.ru/api/v1',
            KNOWLEDGE_GRAPH_EMBEDDING_MODEL='Embeddings',
            KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
            KNOWLEDGE_GRAPH_GIGACHAT_AUTH_URL='',
            KNOWLEDGE_GRAPH_GIGACHAT_CA_BUNDLE_FILE='',
        ), patch.dict(sys.modules, {'gigachat': SimpleNamespace(GigaChat=_FakeGigaChatClient)}):
            config = KnowledgeGraphEmbeddingConfig.from_django_settings()
            GigaChatKnowledgeGraphEmbeddingProvider(config).embed(KnowledgeGraphEmbeddingRequest(texts=['Django graph']))

        self.assertNotIn('auth_url', _FakeGigaChatClient.calls[0]['kwargs'])
        self.assertNotIn('ca_bundle_file', _FakeGigaChatClient.calls[0]['kwargs'])

    def test_gigachat_embedding_provider_rejects_wrong_dimensions_without_raw_payload(self):
        _FakeGigaChatClient.response = SimpleNamespace(data=[SimpleNamespace(embedding=[0.1, 0.2])])
        with patch.dict(sys.modules, {'gigachat': SimpleNamespace(GigaChat=_FakeGigaChatClient)}):
            with self.assertRaises(KnowledgeGraphProviderMalformedResponse) as context:
                GigaChatKnowledgeGraphEmbeddingProvider(self.embedding_config()).embed(
                    KnowledgeGraphEmbeddingRequest(texts=['Django graph'])
                )
        self.assertNotIn('0.1', str(context.exception))

    def test_gigachat_timeout_maps_to_safe_timeout_error(self):
        _FakeGigaChatClient.error = TimeoutError('raw timeout with sk_live_secret and user@example.com')
        with patch.dict(sys.modules, {'gigachat': SimpleNamespace(GigaChat=_FakeGigaChatClient)}):
            with self.assertRaises(KnowledgeGraphProviderTimeout) as context:
                GigaChatKnowledgeGraphEmbeddingProvider(self.embedding_config()).embed(
                    KnowledgeGraphEmbeddingRequest(texts=['Django graph'])
                )
        self.assertNotIn('sk_live_secret', str(context.exception))
        self.assertEqual(context.exception.phase, 'embedding')

    def test_gigachat_dependency_error_logs_sanitized_provider_details(self):
        _FakeGigaChatClient.error = _ProviderAPIError('401 Unauthorized for user@example.com token sk-live-secret')
        with patch.dict(sys.modules, {'gigachat': SimpleNamespace(GigaChat=_FakeGigaChatClient)}), patch(
            'apps.knowledge.semantic_providers.logger.warning'
        ) as warning_log:
            with self.assertRaises(Exception):
                GigaChatKnowledgeGraphEmbeddingProvider(self.embedding_config()).embed(
                    KnowledgeGraphEmbeddingRequest(texts=['Django graph'])
                )

        extra = warning_log.call_args.kwargs['extra']
        self.assertEqual(extra['event'], 'knowledge_graph_embedding_provider_dependency_failed')
        self.assertEqual(extra['error_type'], '_ProviderAPIError')
        self.assertEqual(extra['provider_error_hint'], 'authentication_failed')
        self.assertEqual(extra['provider_status_code'], '401')
        self.assertEqual(extra['provider_error_code'], 'Unauthorized')
        self.assertEqual(extra['provider_error_type'], 'authentication_error')
        self.assertEqual(extra['provider_body_code'], 'invalid_client')
        self.assertEqual(extra['provider_body_type'], 'auth_error')
        rendered_extra = repr(extra)
        self.assertNotIn('provider_error_message', extra)
        self.assertNotIn('provider_body_message', extra)
        self.assertNotIn('user@example.com', rendered_extra)
        self.assertNotIn('sk-live-secret', rendered_extra)

    def test_deepseek_grouping_provider_parses_strict_json_groups(self):
        _FakeDeepSeekCompletions.response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='{"groups":[{"group_key":"backend","label":"Backend","concept_slugs":["django","drf"],"rationale":"Related backend concepts.","confidence":0.9}]}'
                    )
                )
            ]
        )
        with patch.dict(sys.modules, {'openai': SimpleNamespace(OpenAI=_FakeOpenAIClient)}):
            result = DeepSeekKnowledgeGraphGroupingProvider(self.grouping_config()).group(
                KnowledgeGraphGroupingRequest(concepts=[{'slug': 'django'}, {'slug': 'drf'}])
            )

        self.assertEqual(result.metadata.provider, 'deepseek')
        self.assertEqual(result.groups[0].group_key, 'backend')
        self.assertEqual(result.groups[0].concept_slugs, ['django', 'drf'])
        self.assertEqual(_FakeDeepSeekCompletions.calls[0]['response_format'], {'type': 'json_object'})

    def test_deepseek_dependency_error_logs_sanitized_provider_details(self):
        _FakeDeepSeekCompletions.error = _ProviderAPIError('429 rate limited for Bearer abcdefghijklmnopqrstuvwxyz1234567890')
        with patch.dict(sys.modules, {'openai': SimpleNamespace(OpenAI=_FakeOpenAIClient)}), patch(
            'apps.knowledge.semantic_providers.logger.warning'
        ) as warning_log:
            with self.assertRaises(Exception):
                DeepSeekKnowledgeGraphGroupingProvider(self.grouping_config()).group(
                    KnowledgeGraphGroupingRequest(concepts=[{'slug': 'django'}])
                )

        extra = warning_log.call_args.kwargs['extra']
        self.assertEqual(extra['event'], 'knowledge_graph_grouping_provider_dependency_failed')
        self.assertEqual(extra['error_type'], '_ProviderAPIError')
        self.assertEqual(extra['provider_status_code'], '401')
        self.assertEqual(extra['provider_error_code'], 'Unauthorized')
        self.assertEqual(extra['provider_body_code'], 'invalid_client')
        self.assertEqual(extra['provider_error_hint'], 'authentication_failed')
        rendered_extra = repr(extra)
        self.assertNotIn('provider_error_message', extra)
        self.assertNotIn('provider_body_message', extra)
        self.assertNotIn('Bearer abcdefghijklmnopqrstuvwxyz1234567890', rendered_extra)
        self.assertNotIn('user@example.com', rendered_extra)
        self.assertNotIn('sk-live-secret', rendered_extra)

    def test_deepseek_grouping_provider_rejects_malformed_json_safely(self):
        _FakeDeepSeekCompletions.response = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='sk_live_secret user@example.com not json'))]
        )
        with patch.dict(sys.modules, {'openai': SimpleNamespace(OpenAI=_FakeOpenAIClient)}):
            with self.assertRaises(KnowledgeGraphProviderMalformedResponse) as context:
                DeepSeekKnowledgeGraphGroupingProvider(self.grouping_config()).group(
                    KnowledgeGraphGroupingRequest(concepts=[{'slug': 'django'}])
                )
        self.assertNotIn('sk_live_secret', str(context.exception))
        self.assertNotIn('user@example.com', str(context.exception))

    def test_live_provider_config_rejects_unsupported_hosts_and_production_tls_disable(self):
        with self.assertRaisesRegex(KnowledgeGraphProviderConfigurationError, 'host'):
            self.embedding_config(base_url='https://attacker.example.com/api/v1').validate(enabled=True)
        with self.assertRaisesRegex(KnowledgeGraphProviderConfigurationError, 'HTTPS'):
            self.grouping_config(base_url='http://api.deepseek.com').validate(enabled=True)
        with self.settings(DEBUG=False):
            with self.assertRaisesRegex(KnowledgeGraphProviderConfigurationError, 'TLS verification'):
                self.embedding_config(gigachat_verify_ssl_certs=False).validate(enabled=True)

    def test_factories_select_live_and_explicit_fake_providers(self):
        self.assertIsInstance(create_source_provider(self.embedding_config()), GigaChatKnowledgeGraphEmbeddingProvider)
        self.assertIsInstance(create_grouping_provider(self.grouping_config()), DeepSeekKnowledgeGraphGroupingProvider)
        self.assertEqual(create_source_provider(self.embedding_config(provider='fake')).metadata.provider, 'fake-knowledge-graph-embedding')
        self.assertEqual(create_grouping_provider(self.grouping_config(provider='fake')).metadata.provider, 'fake-knowledge-graph-grouping')


@override_settings(DJANGO_TEST_SQLITE=True)
class LiveSemanticBoundaryFactoryTests(TestCase):
    def setUp(self):
        _FakeGigaChatClient.calls = []
        _FakeGigaChatClient.error = None
        _FakeDeepSeekCompletions.calls = []
        _FakeDeepSeekCompletions.error = None
        self.owner = CustomUser.objects.create_user(
            user_email='live-semantic-owner@example.com',
            user_name='live-semantic-owner',
            password='not-a-secret',
        )
        django_tag = Tag.objects.create(name='owner@example.com')
        python_tag = Tag.objects.create(name='python')
        self.q1 = Question.objects.create(
            user=self.owner,
            question_title='How do Django graph embeddings work?',
            question_body='PRIVATE BODY sk_live_secret sk-live-secret Bearer abcdefghijklmnopqrstuvwxyz1234567890 AKIA1234567890ABCDEF mysql://user:pass@host/db owner@example.com must not leak.',
        )
        self.q1.tags.add(django_tag)
        self.q2 = Question.objects.create(
            user=self.owner,
            question_title='How do Python services group knowledge?',
            question_body='PRIVATE BODY Traceback provider raw output must not leak.',
        )
        self.q2.tags.add(python_tag)
        self.django = KnowledgeConcept.objects.create(slug='django', name='Django')
        self.python = KnowledgeConcept.objects.create(slug='python', name='Python')
        question_type = ContentType.objects.get_for_model(Question)
        for index, (question, concept) in enumerate(((self.q1, self.django), (self.q2, self.python)), start=1):
            UserConceptActivity.objects.create(
                user=self.owner,
                concept=concept,
                activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
                weight_delta=Decimal('1.0000'),
                source=UserConceptActivity.Source.QUESTION,
                provider='test-activity',
                confidence=Decimal('1.0000'),
                source_content_type=question_type,
                source_object_id=question.pk,
                related_question=question,
                idempotency_key=f'live-boundary:{index}',
            )

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER='gigachat',
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://gigachat.example.test/api/v1',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='Embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_PROVIDER='deepseek',
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://api.deepseek.com',
        KNOWLEDGE_GRAPH_CHAT_MODEL='deepseek-v4-flash',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_enabled_rebuild_uses_live_factories_under_mocked_sdks_and_persists_semantics(self):
        _FakeGigaChatClient.response = SimpleNamespace(
            data=[
                SimpleNamespace(embedding=[1.0, 0.1, 0.2]),
                SimpleNamespace(embedding=[1.0, 0.2, 0.3]),
            ]
        )
        _FakeDeepSeekCompletions.response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='{"groups":[{"group_key":"backend-python","label":"Backend Python","concept_slugs":["django","python"],"rationale":"Concepts share semantic neighbour evidence.","confidence":0.88}]}'
                    )
                )
            ]
        )

        with patch.dict(
            sys.modules,
            {
                'gigachat': SimpleNamespace(GigaChat=_FakeGigaChatClient),
                'openai': SimpleNamespace(OpenAI=_FakeOpenAIClient),
            },
        ):
            state = run_owner_semantic_boundary(self.owner)

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(state['phase'], 'grouping')
        self.assertEqual(len(_FakeGigaChatClient.calls), 1)
        provider_text = '\n'.join(_FakeGigaChatClient.calls[0]['texts'])
        for forbidden in ['sk_live_secret', 'sk-live-secret', 'Bearer ', 'AKIA1234567890ABCDEF', 'mysql://', 'owner@example.com']:
            self.assertNotIn(forbidden, provider_text)
        self.assertEqual(len(_FakeDeepSeekCompletions.calls), 1)
        self.assertEqual(UserKnowledgeGraphEmbeddingSnapshot.objects.filter(user=self.owner, provider='gigachat').count(), 2)
        self.assertEqual(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner, provider='deepseek').count(), 1)
        rendered_state = repr(state)
        self.assertNotIn('sk_live_secret', rendered_state)
        self.assertNotIn('PRIVATE BODY', rendered_state)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER='gigachat',
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://gigachat.example.test/api/v1',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='Embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_PROVIDER='deepseek',
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://api.deepseek.com',
        KNOWLEDGE_GRAPH_CHAT_MODEL='deepseek-v4-flash',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_grouping_output_with_secret_like_text_is_rejected_safely(self):
        _FakeGigaChatClient.response = SimpleNamespace(
            data=[
                SimpleNamespace(embedding=[1.0, 0.1, 0.2]),
                SimpleNamespace(embedding=[1.0, 0.2, 0.3]),
            ]
        )
        _FakeDeepSeekCompletions.response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='{"groups":[{"group_key":"unsafe","label":"Bearer abcdefghijklmnopqrstuvwxyz1234567890","concept_slugs":["django","python"],"rationale":"mysql://user:pass@host/db","confidence":0.88}]}'
                    )
                )
            ]
        )

        with patch.dict(
            sys.modules,
            {
                'gigachat': SimpleNamespace(GigaChat=_FakeGigaChatClient),
                'openai': SimpleNamespace(OpenAI=_FakeOpenAIClient),
            },
        ):
            state = run_owner_semantic_boundary(self.owner)

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.MALFORMED_RESPONSE)
        self.assertEqual(state['reason_code'], 'malformed_response')
        self.assertEqual(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).count(), 0)
        self.assertNotIn('Bearer', repr(state))
        self.assertNotIn('mysql://', repr(state))

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=True,
        KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER='gigachat',
        KNOWLEDGE_GRAPH_CHAT_PROVIDER='deepseek',
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://gigachat.example.test/api/v1',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='Embeddings',
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://api.deepseek.com',
        KNOWLEDGE_GRAPH_CHAT_MODEL='deepseek-v4-flash',
    )
    def test_dry_run_does_not_import_or_instantiate_live_sdks(self):
        with patch.dict(sys.modules, {'gigachat': None, 'openai': None}):
            state = run_owner_semantic_boundary(self.owner)

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.DRY_RUN)
        self.assertEqual(_FakeGigaChatClient.calls, [])
        self.assertEqual(_FakeDeepSeekCompletions.calls, [])
