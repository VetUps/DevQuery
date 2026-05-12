from __future__ import annotations

import ast
import importlib.util
from decimal import Decimal
from pathlib import Path

from django.apps import apps
from django.db import models
from django.test import SimpleTestCase

from apps.knowledge import urls as knowledge_urls
from apps.knowledge.services import insights_service


BACKEND_ROOT = Path(__file__).resolve().parents[3]
KNOWLEDGE_ROOT = BACKEND_ROOT / 'apps' / 'knowledge'
INSIGHTS_SOURCE_FILES = [
    KNOWLEDGE_ROOT / 'views.py',
    KNOWLEDGE_ROOT / 'serializers.py',
    KNOWLEDGE_ROOT / 'services' / 'insights_service.py',
]
RESPONSE_FACING_SOURCE_FILES = [
    KNOWLEDGE_ROOT / 'views.py',
    KNOWLEDGE_ROOT / 'serializers.py',
]
MANAGEMENT_COMMAND_SOURCE_FILES = [
    KNOWLEDGE_ROOT / 'management' / 'commands' / 'rebuild_knowledge_graph.py',
    KNOWLEDGE_ROOT / 'management' / 'commands' / 'rebuild_user_concept_activity.py',
]
MODEL_AND_ROUTE_SOURCE_FILES = [
    KNOWLEDGE_ROOT / 'models.py',
    KNOWLEDGE_ROOT / 'urls.py',
    *RESPONSE_FACING_SOURCE_FILES,
    *MANAGEMENT_COMMAND_SOURCE_FILES,
]


class M015RuleBasedInsightsBoundaryTests(SimpleTestCase):
    """Executable boundary for the M015 owner-only, rule-based insights surface."""

    maxDiff = None

    def test_only_owner_me_insights_route_is_added_to_graph_surface(self):
        routes = {pattern.name: str(pattern.pattern) for pattern in knowledge_urls.urlpatterns}

        self.assertEqual(
            routes,
            {
                'own-user-graph': 'me/',
                'own-user-graph-insights': 'me/insights/',
                'own-user-graph-layout': 'me/layout/',
                'own-user-graph-rebuild': 'me/rebuild/',
                'public-user-graph': 'users/<uuid:user_id>/',
                'question-graph': 'questions/<uuid:question_id>/',
            },
            'M015 may add only the owner-only /knowledge-graph/me/insights/ route to the graph surface.',
        )

        forbidden_public_terms = {
            'recommendation',
            'recommendations',
            'expert',
            'expert-matching',
            'expert_matching',
            'admin',
            'editor',
            'manual',
            'vector',
            'embedding',
            'embeddings',
            'ai',
        }
        leaked_public_routes = {}
        for route_name, route_path in routes.items():
            if route_name == 'own-user-graph-insights' and route_path == 'me/insights/':
                continue
            route_surface = f'{route_name}:{route_path}'.lower()
            leaked_terms = sorted(term for term in forbidden_public_terms if term in route_surface)
            if leaked_terms:
                leaked_public_routes[route_name] = leaked_terms

        self.assertEqual(
            leaked_public_routes,
            {},
            f'M015 insights must remain owner-only; forbidden public/deferred route terms leaked: {leaked_public_routes}',
        )

    def test_rule_based_insights_do_not_add_persistence_models_or_storage_fields(self):
        expected_model_names = {
            'KnowledgeConcept',
            'ConceptTagMapping',
            'QuestionConceptEdge',
            'UserConceptActivity',
            'UserKnowledgeGraphLayout',
            'UserKnowledgeGraphState',
        }
        knowledge_models = list(apps.get_app_config('knowledge').get_models())
        actual_model_names = {model.__name__ for model in knowledge_models}

        self.assertEqual(
            actual_model_names,
            expected_model_names,
            'M015 insights must be computed on demand and R211 permits only the existing single owner layout model.',
        )

        forbidden_storage_terms = {
            'insight',
            'recommendation',
            'recommendations',
            'semantic_state',
            'tone_token',
            'action_payload',
            'embedding',
            'embeddings',
            'vector',
            'expert_match',
            'expertmatching',
            'manual_editor',
        }
        leaked_fields_by_model = {}
        for model in knowledge_models:
            leaked_fields = sorted(
                field.name
                for field in model._meta.get_fields()
                if any(term in field.name.lower() for term in forbidden_storage_terms)
            )
            if leaked_fields:
                leaked_fields_by_model[model.__name__] = leaked_fields

        self.assertEqual(
            leaked_fields_by_model,
            {},
            f'M015 insights added forbidden persistent insight/recommendation fields: {leaked_fields_by_model}',
        )

    def test_saved_layout_model_remains_single_owner_only_and_unnamed(self):
        layout_model = apps.get_model('knowledge', 'UserKnowledgeGraphLayout')
        user_field = layout_model._meta.get_field('user')
        actual_field_names = {field.name for field in layout_model._meta.get_fields()}

        self.assertIsInstance(
            user_field,
            models.OneToOneField,
            'R211 permits one unnamed persisted graph layout per owner, not multiple saved layout rows per user.',
        )
        self.assertEqual(user_field.remote_field.on_delete, models.CASCADE)
        self.assertEqual(user_field.remote_field.related_name, 'knowledge_graph_layout')
        self.assertFalse(
            {'name', 'title', 'slug', 'is_default'} & actual_field_names,
            f'R211 forbids named/default saved graph layouts; found fields: {actual_field_names}',
        )

    def test_saved_layout_routes_remain_single_owner_me_layout_endpoint(self):
        route_pairs = {(pattern.name, str(pattern.pattern)) for pattern in knowledge_urls.urlpatterns}
        layout_routes = sorted(
            (route_name, route_path)
            for route_name, route_path in route_pairs
            if 'layout' in route_name.lower() or 'layout' in route_path.lower()
        )

        self.assertEqual(
            layout_routes,
            [('own-user-graph-layout', 'me/layout/')],
            f'R211 permits only the single owner /knowledge-graph/me/layout/ endpoint; found: {layout_routes}',
        )

        forbidden_layout_route_terms = {'layouts/', '<uuid:layout_id>', '<int:layout_id>', '<slug:slug>', '<str:name>'}
        leaked_layout_route_terms = {
            route_path: sorted(term for term in forbidden_layout_route_terms if term in route_path.lower())
            for _, route_path in route_pairs
        }
        leaked_layout_route_terms = {path: terms for path, terms in leaked_layout_route_terms.items() if terms}
        self.assertEqual(
            leaked_layout_route_terms,
            {},
            f'R211 forbids named/list/detail saved-layout routes; found: {leaked_layout_route_terms}',
        )

    def test_model_route_and_command_sources_do_not_add_future_scope_capabilities(self):
        forbidden_future_scope_terms = {
            'expert_matching',
            'expert matching',
            'expertmatch',
            'graph overlap',
            'overlap matchmaking',
            'matchmaking',
            'admin editor',
            'manual editor',
            'manual graph',
            'manual_edit',
            'manual edit',
            'merge concept',
            'split concept',
            'concept authority',
            'embedding',
            'embeddings',
            'vector',
            'vectors',
            'openai',
            'anthropic',
            'llm',
            'prompt',
        }
        leaked_terms_by_path = {}
        for source_path in MODEL_AND_ROUTE_SOURCE_FILES:
            self.assertTrue(source_path.exists(), f'M015 expected bounded source file is missing: {source_path}')
            lowered_source = source_path.read_text(encoding='utf-8').lower()
            leaked_terms = sorted(term for term in forbidden_future_scope_terms if term in lowered_source)
            if leaked_terms:
                leaked_terms_by_path[str(source_path.relative_to(BACKEND_ROOT))] = leaked_terms

        self.assertEqual(
            leaked_terms_by_path,
            {},
            'M015 permits only owner-only rule-based insights; bounded model/route/view/serializer/management '
            f'sources leaked future-scope expert matching, admin/manual graph editing, AI/vector, or merge/split terms: {leaked_terms_by_path}',
        )

    def test_deferred_knowledge_capability_modules_are_not_importable(self):
        forbidden_modules = [
            'apps.knowledge.admin',
            'apps.knowledge.editor',
            'apps.knowledge.editors',
            'apps.knowledge.admin_views',
            'apps.knowledge.editor_views',
            'apps.knowledge.manual_editor',
            'apps.knowledge.expert_matching',
            'apps.knowledge.matchmaking',
            'apps.knowledge.overlap_matchmaking',
            'apps.knowledge.recommendation_models',
            'apps.knowledge.persistent_recommendations',
            'apps.knowledge.embeddings',
            'apps.knowledge.vectors',
            'apps.knowledge.ai',
            'apps.knowledge.ml',
            'apps.knowledge.concept_authority',
            'apps.knowledge.merge_split',
        ]
        importable_modules = [module_name for module_name in forbidden_modules if importlib.util.find_spec(module_name)]

        self.assertEqual(
            importable_modules,
            [],
            'M015 permits only owner-only rule-based insights; forbidden future-scope knowledge modules are importable: '
            f'{importable_modules}',
        )

    def test_insights_source_has_no_ai_vector_expert_or_admin_dependencies(self):
        forbidden_import_roots = (
            'openai',
            'anthropic',
            'langchain',
            'llama_index',
            'sentence_transformers',
            'transformers',
            'numpy',
            'sklearn',
            'pgvector',
            'apps.ai',
            'apps.experts',
            'apps.knowledge.admin',
            'apps.knowledge.editor',
            'apps.knowledge.editors',
            'apps.knowledge.expert_matching',
            'apps.knowledge.recommendations',
        )
        forbidden_text_terms = {
            'embedding',
            'embeddings',
            'vector',
            'semantic search',
            'expert_matching',
            'expert matching',
            'admin editor',
            'manual editor',
            'openai',
            'anthropic',
            'llm',
            'prompt',
        }

        import_leaks: dict[str, list[str]] = {}
        text_leaks: dict[str, list[str]] = {}
        for source_path in INSIGHTS_SOURCE_FILES:
            self.assertTrue(source_path.exists(), f'M015 expected insights source file is missing: {source_path}')
            source_text = source_path.read_text(encoding='utf-8')
            python_tree = ast.parse(source_text, filename=str(source_path))

            imports = []
            for node in ast.walk(python_tree):
                if isinstance(node, ast.Import):
                    imports.extend(alias.name for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    imports.append(node.module)
            leaked_imports = sorted(
                module_name
                for module_name in imports
                if any(module_name == root or module_name.startswith(f'{root}.') for root in forbidden_import_roots)
            )
            if leaked_imports:
                import_leaks[str(source_path.relative_to(BACKEND_ROOT))] = leaked_imports

            lowered_source = source_text.lower()
            leaked_terms = sorted(term for term in forbidden_text_terms if term in lowered_source)
            if leaked_terms:
                text_leaks[str(source_path.relative_to(BACKEND_ROOT))] = leaked_terms

        self.assertEqual(
            import_leaks,
            {},
            f'M015 insights must stay rule-based and must not import AI/vector/expert/admin modules: {import_leaks}',
        )
        self.assertEqual(
            text_leaks,
            {},
            f'M015 insights source contains forbidden AI/vector/expert/admin implementation terms: {text_leaks}',
        )

    def test_concept_state_threshold_constants_are_explicit_and_classify_state_has_no_magic_literals(self):
        self.assertEqual(insights_service.CONCEPT_STATE_STALE_AFTER_DAYS, 90)
        self.assertEqual(insights_service.CONCEPT_STATE_STRONG_MIN_TOTAL_WEIGHT, Decimal('3.0000'))
        self.assertEqual(insights_service.CONCEPT_STATE_GROWING_MIN_TOTAL_WEIGHT, Decimal('1.0000'))
        self.assertEqual(insights_service.CONCEPT_STATE_MIN_MULTI_SOURCE_COUNT, 2)

        source_text = (KNOWLEDGE_ROOT / 'services' / 'insights_service.py').read_text(encoding='utf-8')
        python_tree = ast.parse(source_text)
        classify_function = next(
            node for node in ast.walk(python_tree) if isinstance(node, ast.FunctionDef) and node.name == '_classify_state'
        )
        constants_in_classifier = [node.value for node in ast.walk(classify_function) if isinstance(node, ast.Constant)]

        self.assertNotIn(
            '3.0000',
            constants_in_classifier,
            'M015 strong concept-state weight threshold must be named, not hidden inline in _classify_state.',
        )
        self.assertNotIn(
            '1.0000',
            constants_in_classifier,
            'M015 growing concept-state weight threshold must be named, not hidden inline in _classify_state.',
        )
        self.assertNotIn(
            90,
            constants_in_classifier,
            'M015 stale concept-state age threshold must be named, not hidden inline in _classify_state.',
        )
        self.assertNotIn(
            2,
            constants_in_classifier,
            'M015 multi-source concept-state threshold must be named, not hidden inline in _classify_state.',
        )

    def test_response_facing_sources_do_not_serialize_raw_activity_or_source_identifiers(self):
        forbidden_response_terms = {
            'UserConceptActivity',
            'source_object_id',
            'source_content_type',
            'idempotency_key',
            'question_body',
            'traceback',
            'prompt',
        }
        leaked_terms_by_path = {}
        for source_path in RESPONSE_FACING_SOURCE_FILES:
            source_text = source_path.read_text(encoding='utf-8')
            present_terms = sorted(term for term in forbidden_response_terms if term in source_text)
            if present_terms:
                leaked_terms_by_path[str(source_path.relative_to(BACKEND_ROOT))] = present_terms

        self.assertEqual(
            leaked_terms_by_path,
            {},
            f'M015 response-facing views/serializers must not expose raw activity/source/error terms: {leaked_terms_by_path}',
        )
