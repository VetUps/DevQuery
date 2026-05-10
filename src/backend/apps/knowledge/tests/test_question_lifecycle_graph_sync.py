from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import QuestionConceptEdge
from apps.knowledge.services import KnowledgeGraphBuildError, sync_question_graph
from apps.qa.models import Question, QuestionEditEvent, QuestionEditProposal, QuestionRevision, Tag
from apps.qa.services.question_edit_service import QuestionChangePayload, QuestionEditService
from apps.user.models import CustomUser, ReputationTransaction


class QuestionLifecycleGraphSyncTests(APITestCase):
    def setUp(self):
        self.author = CustomUser.objects.create_user(
            user_email='graph-author@example.com',
            user_name='graph-author',
            password='not-a-secret',
        )
        self.editor = CustomUser.objects.create_user(
            user_email='graph-editor@example.com',
            user_name='graph-editor',
            password='not-a-secret',
        )

    def _create_question_with_graph(self, *tag_names: str) -> Question:
        question = Question.objects.create(
            user=self.author,
            question_title='How do lifecycle graph tests start?',
            question_body='Body text is intentionally generic and not used in diagnostics.',
        )
        for tag_name in tag_names:
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            question.tags.add(tag)
            Tag.objects.filter(pk=tag.pk).update(questions_count=tag.questions_count + 1)
        sync_question_graph(question)
        question.refresh_from_db()
        return question

    def _edge_tag_names(self, question: Question) -> set[str]:
        return set(
            QuestionConceptEdge.objects.filter(question=question).values_list('tag__name', flat=True)
        )

    def test_question_create_builds_graph_edges_in_create_transaction(self):
        self.client.force_authenticate(self.author)

        response = self.client.post(
            '/question/',
            {
                'question_title': 'How do I sync graph on create?',
                'question_body': 'Need durable edges after the question is saved.',
                'tags': ['django', 'rest'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        question = Question.objects.get(question_id=response.data['question_id'])
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django', 'rest'})
        self.assertEqual(self._edge_tag_names(question), {'django', 'rest'})

    def test_invalid_create_tags_reject_before_graph_rows_are_written(self):
        self.client.force_authenticate(self.author)

        response = self.client.post(
            '/question/',
            {
                'question_title': 'Invalid graph create tags',
                'question_body': 'This request should fail validation before persistence.',
                'tags': ['bad tag'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Question.objects.exists())
        self.assertFalse(QuestionConceptEdge.objects.exists())

    def test_graph_failure_rolls_back_question_create(self):
        self.client.force_authenticate(self.author)
        self.client.raise_request_exception = False

        with patch(
            'apps.qa.serializers.sync_question_graph',
            side_effect=KnowledgeGraphBuildError('concept extraction failed'),
        ):
            response = self.client.post(
                '/question/',
                {
                    'question_title': 'Create should roll back',
                    'question_body': 'Graph failure must abort the question write.',
                    'tags': ['django'],
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertFalse(Question.objects.exists())
        self.assertFalse(Tag.objects.filter(name='django', questions_count__gt=0).exists())
        self.assertFalse(QuestionConceptEdge.objects.exists())

    def test_direct_edit_rebuilds_edges_and_removes_stale_edges(self):
        question = self._create_question_with_graph('django', 'python')
        self.client.force_authenticate(self.author)

        response = self.client.put(
            f'/question/{question.question_id}/',
            {
                'question_title': 'How do I sync graph on edit?',
                'question_body': 'Need stale edges removed during the edit transaction.',
                'tags': ['django', 'rest'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        question.refresh_from_db()
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django', 'rest'})
        self.assertEqual(self._edge_tag_names(question), {'django', 'rest'})
        self.assertFalse(QuestionConceptEdge.objects.filter(question=question, tag__name='python').exists())

    def test_graph_failure_rolls_back_direct_edit_revision_and_event(self):
        question = self._create_question_with_graph('django')
        self.client.force_authenticate(self.author)
        self.client.raise_request_exception = False

        with patch(
            'apps.qa.services.question_edit_service.sync_question_graph',
            side_effect=KnowledgeGraphBuildError('concept extraction failed'),
        ):
            response = self.client.put(
                f'/question/{question.question_id}/',
                {
                    'question_title': 'Direct edit should roll back',
                    'question_body': 'Graph failure must abort direct edit side effects.',
                    'tags': ['rest'],
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        question.refresh_from_db()
        self.assertEqual(question.question_title, 'How do lifecycle graph tests start?')
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django'})
        self.assertEqual(self._edge_tag_names(question), {'django'})
        self.assertFalse(QuestionRevision.objects.exists())
        self.assertFalse(QuestionEditEvent.objects.exists())

    def test_accepted_tag_proposal_rebuilds_edges_before_approval_commits(self):
        question = self._create_question_with_graph('django')
        proposal = QuestionEditService.create_proposal(
            question=question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Approved lifecycle proposal',
                body='Approved proposal body.',
                tags=['django', 'rest'],
            ),
        )

        QuestionEditService.change_proposal_approval(
            proposal_id=str(proposal.question_edit_id),
            actor=self.author,
            approved=True,
        )

        question.refresh_from_db()
        proposal.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertTrue(proposal.question_edit_is_approved)
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django', 'rest'})
        self.assertEqual(self._edge_tag_names(question), {'django', 'rest'})
        self.assertEqual(QuestionRevision.objects.filter(proposal=proposal).count(), 1)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.editor).count(), 1)

    def test_rejected_proposal_does_not_touch_graph_structure(self):
        question = self._create_question_with_graph('django')
        existing_edge_ids = set(QuestionConceptEdge.objects.filter(question=question).values_list('pk', flat=True))
        proposal = QuestionEditService.create_proposal(
            question=question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Rejected lifecycle proposal',
                body='Rejected proposal body.',
                tags=['rest'],
            ),
        )

        with patch('apps.qa.services.question_edit_service.sync_question_graph') as sync_mock:
            QuestionEditService.change_proposal_approval(
                proposal_id=str(proposal.question_edit_id),
                actor=self.author,
                approved=False,
            )

        sync_mock.assert_not_called()
        question.refresh_from_db()
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django'})
        self.assertEqual(set(QuestionConceptEdge.objects.filter(question=question).values_list('pk', flat=True)), existing_edge_ids)
        self.assertEqual(self._edge_tag_names(question), {'django'})
        self.assertFalse(QuestionRevision.objects.filter(proposal=proposal).exists())

    def test_graph_failure_rolls_back_approval_side_effects(self):
        question = self._create_question_with_graph('django')
        proposal = QuestionEditService.create_proposal(
            question=question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Approval should roll back',
                body='Graph failure must abort proposal approval.',
                tags=['rest'],
            ),
        )

        with patch(
            'apps.qa.services.question_edit_service.sync_question_graph',
            side_effect=KnowledgeGraphBuildError('concept extraction failed'),
        ):
            with self.assertRaisesMessage(KnowledgeGraphBuildError, 'concept extraction failed'):
                QuestionEditService.change_proposal_approval(
                    proposal_id=str(proposal.question_edit_id),
                    actor=self.author,
                    approved=True,
                )

        question.refresh_from_db()
        proposal.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertIsNone(proposal.question_edit_is_approved)
        self.assertEqual(question.question_title, 'How do lifecycle graph tests start?')
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django'})
        self.assertEqual(self._edge_tag_names(question), {'django'})
        self.assertFalse(QuestionRevision.objects.exists())
        self.assertEqual(
            list(QuestionEditEvent.objects.filter(question=question).values_list('event_type', flat=True)),
            [QuestionEditEvent.EventType.PROPOSED],
        )
        self.assertEqual(self.editor.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())

    def test_approving_non_tag_change_proposal_is_idempotent_for_edges(self):
        question = self._create_question_with_graph('django')
        existing_edge_ids = set(QuestionConceptEdge.objects.filter(question=question).values_list('pk', flat=True))
        proposal = QuestionEditService.create_proposal(
            question=question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Title-only proposal',
                body=question.question_body,
                tags=['django'],
            ),
        )

        QuestionEditService.change_proposal_approval(
            proposal_id=str(proposal.question_edit_id),
            actor=self.author,
            approved=True,
        )

        question.refresh_from_db()
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django'})
        self.assertEqual(self._edge_tag_names(question), {'django'})
        self.assertEqual(QuestionConceptEdge.objects.filter(question=question).count(), 1)
        self.assertEqual(set(QuestionConceptEdge.objects.filter(question=question).values_list('pk', flat=True)), existing_edge_ids)
