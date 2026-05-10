from __future__ import annotations

import ast
import importlib.util
from pathlib import Path

from django.apps import apps
from django.test import SimpleTestCase

from apps.knowledge import urls as knowledge_urls


BACKEND_ROOT = Path(__file__).resolve().parents[3]
PROJECT_ROOT = BACKEND_ROOT.parents[1]


class DeferredKnowledgeGraphScopeContractTests(SimpleTestCase):
    """Executable evidence that M013 intentionally ships only graph foundations."""

    def test_r162_r164_knowledge_urls_expose_only_aggregate_graph_endpoints(self):
        expected_route_names = {
            'own-user-graph',
            'own-user-graph-rebuild',
            'public-user-graph',
            'question-graph',
        }
        actual_route_names = {pattern.name for pattern in knowledge_urls.urlpatterns}
        deferred_route_terms = {
            'recommendation',
            'recommendations',
            'vector',
            'embedding',
            'embeddings',
            'admin',
            'editor',
            'merge',
            'split',
            'expert',
            'expert-matching',
        }

        self.assertEqual(
            actual_route_names,
            expected_route_names,
            'R162-R164: apps.knowledge must expose only aggregate graph endpoints until deferred graph layers are scoped.',
        )
        leaked_route_names = {
            route_name
            for route_name in actual_route_names
            for term in deferred_route_terms
            if term in route_name
        }
        self.assertEqual(
            leaked_route_names,
            set(),
            f'R162-R168: deferred knowledge route surface leaked via route names: {sorted(leaked_route_names)}',
        )

    def test_r162_r168_knowledge_models_remain_foundation_models_only(self):
        expected_model_names = {
            'KnowledgeConcept',
            'ConceptTagMapping',
            'QuestionConceptEdge',
            'UserConceptActivity',
            'UserKnowledgeGraphState',
        }
        knowledge_models = apps.get_app_config('knowledge').get_models()
        actual_model_names = {model.__name__ for model in knowledge_models}
        deferred_model_terms = {
            'embedding',
            'vector',
            'recommendation',
            'expertmatch',
            'expertmatching',
            'merge',
            'split',
            'workflow',
            'diagnostic',
            'admin',
            'editor',
        }

        self.assertEqual(
            actual_model_names,
            expected_model_names,
            'R162-R168: knowledge app models must remain foundation graph models only.',
        )

        leaked_model_names = {
            model_name
            for model_name in actual_model_names
            for term in deferred_model_terms
            if term in model_name.lower()
        }
        self.assertEqual(
            leaked_model_names,
            set(),
            f'R162-R168: deferred knowledge model capability leaked via models: {sorted(leaked_model_names)}',
        )

        for model in knowledge_models:
            field_names = {field.name.lower() for field in model._meta.get_fields()}
            leaked_fields = {
                field_name
                for field_name in field_names
                for term in {'embedding', 'vector', 'recommendation', 'expert_match', 'merge', 'split', 'diagnostic'}
                if term in field_name
            }
            self.assertEqual(
                leaked_fields,
                set(),
                f'R162-R168: {model.__name__} added deferred storage/workflow fields: {sorted(leaked_fields)}',
            )

        # Dormant provider/manual provenance metadata is allowed; shipped admin/editor source-of-truth surfaces are not.
        self.assertIn('source', {field.name for field in apps.get_model('knowledge', 'KnowledgeConcept')._meta.fields})

    def test_r166_r168_no_knowledge_admin_or_editor_source_surface_is_importable(self):
        admin_path = BACKEND_ROOT / 'apps' / 'knowledge' / 'admin.py'
        self.assertFalse(
            admin_path.exists(),
            'R166-R168: apps.knowledge/admin.py would make deferred admin diagnostics/editorial surfaces ambiguous.',
        )

        deferred_modules = [
            'apps.knowledge.admin',
            'apps.knowledge.editor',
            'apps.knowledge.editors',
            'apps.knowledge.admin_views',
            'apps.knowledge.editor_views',
        ]
        importable_modules = [module_name for module_name in deferred_modules if importlib.util.find_spec(module_name)]
        self.assertEqual(
            importable_modules,
            [],
            f'R166-R168: deferred knowledge admin/editor modules are importable: {importable_modules}',
        )

    def test_r165_expert_invitation_sources_do_not_query_knowledge_graph_or_concept_overlap(self):
        expert_source_paths = [
            BACKEND_ROOT / 'apps' / 'qa' / 'services' / 'question_expert_invitation_service.py',
            PROJECT_ROOT / 'src' / 'frontend' / 'src' / 'features' / 'questions' / 'api' / 'questionExpertInvitations.ts',
            PROJECT_ROOT / 'src' / 'frontend' / 'src' / 'features' / 'questions' / 'queries' / 'useEligibleExpertsQuery.ts',
            PROJECT_ROOT / 'src' / 'frontend' / 'src' / 'features' / 'questions' / 'queries' / 'useInvitedExpertInvitationsQuery.ts',
            PROJECT_ROOT / 'src' / 'frontend' / 'src' / 'features' / 'questions' / 'mutations' / 'useCreateExpertInvitationsMutation.ts',
            PROJECT_ROOT / 'src' / 'frontend' / 'src' / 'features' / 'questions' / 'components' / 'QuestionExpertInvitationPanel.vue',
        ]

        for source_path in expert_source_paths:
            self.assertTrue(source_path.exists(), f'R165: expected expert-assistance source file is missing: {source_path}')

        python_tree = ast.parse(expert_source_paths[0].read_text(encoding='utf-8'), filename=str(expert_source_paths[0]))
        forbidden_python_imports = []
        for node in ast.walk(python_tree):
            if isinstance(node, ast.Import):
                forbidden_python_imports.extend(alias.name for alias in node.names if alias.name.startswith('apps.knowledge'))
            elif isinstance(node, ast.ImportFrom) and (node.module or '').startswith('apps.knowledge'):
                forbidden_python_imports.append(node.module or '')
        self.assertEqual(
            forbidden_python_imports,
            [],
            f'R165: expert invitation backend must remain reputation/search based, not knowledge-graph based: {forbidden_python_imports}',
        )

        forbidden_terms_by_path = {}
        forbidden_terms = {
            'apps.knowledge',
            'KnowledgeConcept',
            'ConceptTagMapping',
            'QuestionConceptEdge',
            'UserConceptActivity',
            'concept_edges',
            'concept_activities',
            'knowledgeGraph',
            'knowledge-graph',
            'conceptOverlap',
            'concept overlap',
            'overlap_score',
            'embedding',
            'vector',
        }
        for source_path in expert_source_paths:
            source_text = source_path.read_text(encoding='utf-8')
            present_terms = sorted(term for term in forbidden_terms if term in source_text)
            if present_terms:
                forbidden_terms_by_path[str(source_path.relative_to(PROJECT_ROOT))] = present_terms

        self.assertEqual(
            forbidden_terms_by_path,
            {},
            f'R165: expert assistance must stay reputation/search based; knowledge graph coupling found: {forbidden_terms_by_path}',
        )
