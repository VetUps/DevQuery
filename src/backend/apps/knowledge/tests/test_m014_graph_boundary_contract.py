from __future__ import annotations

import ast
import importlib.util
from pathlib import Path

from django.apps import apps
from django.test import SimpleTestCase

from apps.knowledge import urls as knowledge_urls


BACKEND_ROOT = Path(__file__).resolve().parents[3]
KNOWLEDGE_ROOT = BACKEND_ROOT / 'apps' / 'knowledge'
QA_EXPERT_INVITATION_SOURCE = BACKEND_ROOT / 'apps' / 'qa' / 'services' / 'question_expert_invitation_service.py'


class M014KnowledgeGraphBoundaryContractTests(SimpleTestCase):
    """Executable R187/R188 proof that M014 stays visualization/explainability-only."""

    def test_r187_r188_knowledge_urls_expose_only_existing_aggregate_graph_routes(self):
        expected_route_names = {
            'own-user-graph',
            'own-user-graph-insights',
            'own-user-graph-layout',
            'own-user-graph-rebuild',
            'public-user-graph',
            'question-graph',
        }
        actual_route_names = {pattern.name for pattern in knowledge_urls.urlpatterns}

        self.assertEqual(
            actual_route_names,
            expected_route_names,
            'R187/R188: apps.knowledge URL surface must stay limited to aggregate graph endpoints plus the M015 owner-only insights endpoint.',
        )

        route_terms_by_route = {}
        forbidden_route_terms = {
            'recommendation',
            'recommendations',
            'expert-matching',
            'expert_matching',
            'expertmatch',
            'overlap',
            'admin',
            'editor',
            'manual-edit',
            'manual_edit',
            'manual-editor',
            'manual_editor',
            'merge',
            'split',
            'vector',
            'embedding',
            'embeddings',
        }
        for pattern in knowledge_urls.urlpatterns:
            route_surface = f'{pattern.name}:{pattern.pattern}'.lower()
            leaked_terms = sorted(term for term in forbidden_route_terms if term in route_surface)
            if leaked_terms:
                route_terms_by_route[pattern.name] = leaked_terms

        self.assertEqual(
            route_terms_by_route,
            {},
            f'R187/R188: graph boundary leaked recommendation/expert/admin route terms: {route_terms_by_route}',
        )

    def test_r187_r188_knowledge_models_remain_foundation_storage_only(self):
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
            'R187/R188: knowledge app registry must contain only foundation graph models.',
        )

        forbidden_name_terms = {
            'recommendation',
            'recommendations',
            'expertmatch',
            'expertmatching',
            'expert_match',
            'expert_matching',
            'overlap',
            'overlapscore',
            'overlap_score',
            'admin',
            'editor',
            'manualedit',
            'manual_edit',
            'manualeditor',
            'manual_editor',
            'merge',
            'split',
            'vector',
            'embedding',
            'embeddings',
        }
        leaked_model_names = {
            model_name: sorted(term for term in forbidden_name_terms if term in model_name.lower())
            for model_name in actual_model_names
            if any(term in model_name.lower() for term in forbidden_name_terms)
        }
        self.assertEqual(
            leaked_model_names,
            {},
            f'R187/R188: forbidden graph recommendation/expert/admin models leaked: {leaked_model_names}',
        )

        leaked_fields_by_model = {}
        for model in knowledge_models:
            leaked_fields = []
            for field in model._meta.get_fields():
                field_name = field.name.lower()
                leaked_terms = sorted(term for term in forbidden_name_terms if term in field_name)
                if leaked_terms:
                    leaked_fields.append(f'{field.name} -> {leaked_terms}')
            if leaked_fields:
                leaked_fields_by_model[model.__name__] = leaked_fields

        self.assertEqual(
            leaked_fields_by_model,
            {},
            f'R187/R188: foundation graph models added forbidden recommendation/expert/admin storage fields: '
            f'{leaked_fields_by_model}',
        )

        concept_fields = {field.name for field in apps.get_model('knowledge', 'KnowledgeConcept')._meta.fields}
        self.assertIn(
            'source',
            concept_fields,
            'R187/R188: dormant provenance fields such as source/provider are allowed and should remain inspectable.',
        )
        self.assertIn(
            'provider',
            concept_fields,
            'R187/R188: dormant provenance fields such as source/provider are allowed and should remain inspectable.',
        )

    def test_r188_no_knowledge_admin_manual_editor_or_matching_modules_are_importable(self):
        admin_path = KNOWLEDGE_ROOT / 'admin.py'
        self.assertFalse(
            admin_path.exists(),
            f'R188: knowledge admin/manual graph editor source surface was added at {admin_path}',
        )

        forbidden_modules = [
            'apps.knowledge.admin',
            'apps.knowledge.editor',
            'apps.knowledge.editors',
            'apps.knowledge.admin_views',
            'apps.knowledge.editor_views',
            'apps.knowledge.manual_editor',
            'apps.knowledge.recommendations',
            'apps.knowledge.expert_matching',
        ]
        importable_modules = [module_name for module_name in forbidden_modules if importlib.util.find_spec(module_name)]

        self.assertEqual(
            importable_modules,
            [],
            f'R188: forbidden knowledge admin/manual-editor/recommendation modules are importable: {importable_modules}',
        )

    def test_r187_expert_invitation_service_has_no_knowledge_graph_coupling(self):
        self.assertTrue(
            QA_EXPERT_INVITATION_SOURCE.exists(),
            f'R187: expected expert-assistance source file is missing: {QA_EXPERT_INVITATION_SOURCE}',
        )

        source_text = QA_EXPERT_INVITATION_SOURCE.read_text(encoding='utf-8')
        python_tree = ast.parse(source_text, filename=str(QA_EXPERT_INVITATION_SOURCE))

        forbidden_imports = []
        for node in ast.walk(python_tree):
            if isinstance(node, ast.Import):
                forbidden_imports.extend(alias.name for alias in node.names if alias.name.startswith('apps.knowledge'))
            elif isinstance(node, ast.ImportFrom) and (node.module or '').startswith('apps.knowledge'):
                forbidden_imports.append(node.module or '')

        self.assertEqual(
            forbidden_imports,
            [],
            f'R187: expert invitation backend must not import knowledge graph modules: {forbidden_imports}',
        )

        forbidden_source_terms = {
            'KnowledgeConcept',
            'QuestionConceptEdge',
            'UserConceptActivity',
            'concept_overlap',
            'overlap_score',
            'knowledge_graph',
            'knowledge-graph',
            'embedding',
            'vector',
        }
        present_terms = sorted(term for term in forbidden_source_terms if term in source_text)
        self.assertEqual(
            present_terms,
            [],
            f'R187: expert invitation source must stay reputation/search based; graph-coupling terms found in '
            f'{QA_EXPERT_INVITATION_SOURCE}: {present_terms}',
        )
