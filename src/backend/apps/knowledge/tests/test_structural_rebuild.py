from io import StringIO
from uuid import uuid4
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.knowledge.models import ConceptTagMapping, KnowledgeConcept, QuestionConceptEdge
from apps.knowledge.services import KnowledgeGraphBuildError, rebuild_structural_graph, sync_question_graph
from apps.qa.models import Question, Tag


class StructuralGraphRebuildTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='structural-rebuild@example.com',
            user_name='structural-rebuild',
            password='not-a-secret',
        )

    def create_question(self, title, *tag_names):
        question = Question.objects.create(
            user=self.user,
            question_title=title,
            question_body='Body text intentionally not asserted in rebuild diagnostics.',
        )
        tags = [Tag.objects.create(name=name) for name in tag_names]
        question.tags.set(tags)
        return question, tags

    def test_rebuild_structural_graph_is_idempotent_for_multiple_questions(self):
        self.create_question('How do I use Django models?', 'Django', 'Python')
        self.create_question('How do I use React state?', 'React', 'JavaScript')

        first = rebuild_structural_graph()
        second = rebuild_structural_graph()

        self.assertEqual(first.processed_questions, 2)
        self.assertEqual(first.created_concepts, 4)
        self.assertEqual(first.created_mappings, 4)
        self.assertEqual(first.created_edges, 4)
        self.assertEqual(second.processed_questions, 2)
        self.assertEqual(second.created_concepts, 0)
        self.assertEqual(second.created_mappings, 0)
        self.assertEqual(second.created_edges, 0)
        self.assertEqual(second.updated_concepts, 0)
        self.assertEqual(second.updated_mappings, 0)
        self.assertEqual(second.updated_edges, 0)
        self.assertEqual(second.removed_edges, 0)
        self.assertEqual(KnowledgeConcept.objects.count(), 4)
        self.assertEqual(ConceptTagMapping.objects.count(), 4)
        self.assertEqual(QuestionConceptEdge.objects.count(), 4)

    def test_rebuild_repairs_stale_question_edges_after_tag_changes(self):
        question, tags = self.create_question('How do stale graph edges repair?', 'Django', 'Python')
        rebuild_structural_graph(Question.objects.filter(pk=question.pk))
        removed_edge_id = QuestionConceptEdge.objects.get(question=question, tag=tags[1]).pk
        replacement = Tag.objects.create(name='Django REST')
        question.tags.set([tags[0], replacement])

        summary = rebuild_structural_graph(Question.objects.filter(pk=question.pk))

        self.assertEqual(summary.processed_questions, 1)
        self.assertEqual(summary.created_concepts, 1)
        self.assertEqual(summary.created_mappings, 1)
        self.assertEqual(summary.created_edges, 1)
        self.assertEqual(summary.removed_edge_ids, [removed_edge_id])
        self.assertEqual(
            set(QuestionConceptEdge.objects.filter(question=question).values_list('tag__name', flat=True)),
            {'Django', 'Django REST'},
        )
        self.assertFalse(QuestionConceptEdge.objects.filter(question=question, tag=tags[1]).exists())

    def test_empty_queryset_reports_zero_processed_questions(self):
        summary = rebuild_structural_graph(Question.objects.none())

        self.assertEqual(summary.processed_questions, 0)
        self.assertEqual(summary.created_concepts, 0)
        self.assertEqual(summary.created_mappings, 0)
        self.assertEqual(summary.created_edges, 0)
        self.assertEqual(KnowledgeConcept.objects.count(), 0)
        self.assertEqual(QuestionConceptEdge.objects.count(), 0)

    def test_sync_question_graph_reuses_existing_question_validation(self):
        with self.assertRaisesRegex(KnowledgeGraphBuildError, 'Question instance'):
            sync_question_graph(object())

    def test_management_command_outputs_aggregate_counts_only(self):
        question, _ = self.create_question('How do command summaries stay safe?', 'Django')
        out = StringIO()

        call_command('rebuild_knowledge_graph', question_id=str(question.pk), stdout=out)

        output = out.getvalue()
        self.assertIn('processed=1', output)
        self.assertIn('created_concepts=1', output)
        self.assertIn('created_mappings=1', output)
        self.assertIn('created_edges=1', output)
        self.assertIn('removed_edges=0', output)
        self.assertNotIn(question.question_body, output)
        self.assertNotIn(self.user.user_email, output)

    def test_management_command_rejects_unknown_question_id(self):
        out = StringIO()

        with self.assertRaisesRegex(CommandError, 'Question not found'):
            call_command('rebuild_knowledge_graph', question_id=str(uuid4()), stdout=out)

        self.assertEqual(out.getvalue(), '')

    def test_management_command_wraps_graph_failures_without_success_output(self):
        self.create_question('How do command failures stay safe?', 'Django')
        out = StringIO()

        with mock.patch(
            'apps.knowledge.management.commands.rebuild_knowledge_graph.rebuild_structural_graph',
            side_effect=KnowledgeGraphBuildError('concept extraction failed'),
        ):
            with self.assertRaisesRegex(CommandError, 'Knowledge graph rebuild failed'):
                call_command('rebuild_knowledge_graph', stdout=out)

        self.assertNotIn('processed=', out.getvalue())
