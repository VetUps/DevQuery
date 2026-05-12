from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import KnowledgeConcept, QuestionConceptEdge, UserConceptActivity, UserKnowledgeGraphState
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


class RuleBasedScoringV2OwnerInsightsContractTests(APITestCase):
    """Executable S02 scoring-v2 contract for owner-only insights.

    These tests intentionally pin additive route-level fields before production code exists.
    They exercise the real /knowledge-graph/me/insights/ route and serializers so missing
    service fields, serializer omissions, unsafe evidence, and wrong owner-visible topology
    all fail at the API boundary.
    """

    maxDiff = None

    SCORING_V2_FIELDS = {
        'state_score',
        'strength_score',
        'freshness_score',
        'connectivity_score',
        'diversity_score',
        'confidence_score',
        'confidence_band',
        'owner_graph_degree',
        'owner_visible_related_question_count',
        'activity_types',
        'evidence',
    }
    REQUIRED_LEGACY_FIELDS = {
        'concept_id',
        'slug',
        'name',
        'total_weight',
        'source_count',
        'related_question_count',
        'semantic_state',
        'tone_token',
        'recommendations',
    }
    SAFE_EVIDENCE_FIELDS = {'code', 'label', 'value', 'weight'}
    FORBIDDEN_REDaction_TERMS = [
        'scoring-owner@example.com',
        'scoring-viewer@example.com',
        'global-author@example.com',
        'PRIVATE BODY:',
        'owner secret body',
        'global secret body',
        'source_object_id',
        'source_content_type',
        'idempotency_key',
        'raw-idempotency-key',
        'semantic-provider-raw-output',
        'provider raw output',
        'Traceback',
        'stack trace',
        'sk-live',
        'embedding',
        'vector',
        'token',
    ]

    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='scoring-owner@example.com',
            user_name='scoring-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='scoring-viewer@example.com',
            user_name='scoring-viewer',
            password='not-a-secret',
        )
        self.global_author = CustomUser.objects.create_user(
            user_email='global-author@example.com',
            user_name='global-author',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        self.tag = Tag.objects.create(name='django', questions_count=6)

        self.strong = self.create_concept('django', 'Django', KnowledgeConcept.Source.TAG, 'tag-sync', '1.0000')
        self.diverse = self.create_concept('api-design', 'API Design', KnowledgeConcept.Source.PROVIDER, 'provider-a', '0.9100')
        self.weak = self.create_concept('css-basics', 'CSS Basics', KnowledgeConcept.Source.PROVIDER, 'provider-a', '0.7000')
        self.stale = self.create_concept('legacy-python', 'Legacy Python', KnowledgeConcept.Source.MANUAL, 'curator', '0.8200')
        self.owner_isolated = self.create_concept('globally-connected', 'Globally Connected', KnowledgeConcept.Source.PROVIDER, 'provider-b', '0.8800')
        self.global_neighbour = self.create_concept('global-neighbour', 'Global Neighbour', KnowledgeConcept.Source.PROVIDER, 'provider-b', '0.8800')
        self.activity_only = self.create_concept('activity-only', 'Activity Only', KnowledgeConcept.Source.PROVIDER, 'provider-c', '0.6500')

        self.shared_question = self.create_question(
            self.owner,
            'How do I build owner-visible graph scoring?',
            'PRIVATE BODY: owner secret body with embeddings and provider raw output must not leak.',
        )
        self.second_shared_question = self.create_question(
            self.owner,
            'How do I explain API graph activity?',
            'PRIVATE BODY: owner secret body with source ids must not leak.',
        )
        self.weak_question = self.create_question(
            self.owner,
            'How do I start with CSS?',
            'PRIVATE BODY: weak owner secret body must not leak.',
        )
        self.stale_question = self.create_question(
            self.owner,
            'How did legacy Python work?',
            'PRIVATE BODY: stale owner secret body must not leak.',
        )
        self.owner_isolated_question = self.create_question(
            self.owner,
            'What should a globally connected owner-isolated concept do?',
            'PRIVATE BODY: isolated owner secret body must not leak.',
        )
        self.activity_only_question = self.create_question(
            self.owner,
            'Why does an activity-only concept have no graph topology?',
            'PRIVATE BODY: activity-only owner secret body must not leak.',
        )
        self.global_question = self.create_question(
            self.global_author,
            'How is this concept globally connected?',
            'PRIVATE BODY: global secret body and semantic-provider-raw-output must not leak.',
        )

        self.create_edge(self.shared_question, self.strong, tag=self.tag, source=QuestionConceptEdge.Source.TAG)
        self.create_edge(self.shared_question, self.diverse)
        self.create_edge(self.second_shared_question, self.strong)
        self.create_edge(self.second_shared_question, self.diverse)
        self.create_edge(self.weak_question, self.weak)
        self.create_edge(self.stale_question, self.stale)
        # Global-only topology for owner_isolated: existing S01/M015 code counts these rows globally,
        # but S02 must classify using owner-visible shared-question neighbours only.
        self.create_edge(self.global_question, self.owner_isolated)
        self.create_edge(self.global_question, self.global_neighbour)
        # activity_only intentionally has no QuestionConceptEdge rows at all.

        self.create_activity(self.strong, self.shared_question, UserConceptActivity.ActivityType.AUTHORED_QUESTION, UserConceptActivity.Source.QUESTION, '2.0000', 'strong-authored')
        self.create_activity(self.strong, self.second_shared_question, UserConceptActivity.ActivityType.QUESTION_UPVOTE, UserConceptActivity.Source.REPUTATION_TRANSACTION, '1.5000', 'strong-upvote')
        self.create_activity(self.diverse, self.shared_question, UserConceptActivity.ActivityType.APPROVED_EDIT, UserConceptActivity.Source.APPROVED_EDIT, '0.7000', 'diverse-edit')
        self.create_activity(self.diverse, self.second_shared_question, UserConceptActivity.ActivityType.POSTED_SOLUTION, UserConceptActivity.Source.SOLUTION, '0.7000', 'diverse-solution')
        self.create_activity(self.diverse, self.second_shared_question, UserConceptActivity.ActivityType.BEST_SOLUTION, UserConceptActivity.Source.SOLUTION, '0.6000', 'diverse-best')
        self.create_activity(self.weak, self.weak_question, UserConceptActivity.ActivityType.AUTHORED_QUESTION, UserConceptActivity.Source.QUESTION, '0.1500', 'weak-authored')
        self.create_activity(
            self.stale,
            self.stale_question,
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            UserConceptActivity.Source.SOLUTION,
            '4.5000',
            'stale-strong-but-old',
            created_at=timezone.now() - timedelta(days=120),
        )
        self.create_activity(
            self.owner_isolated,
            self.owner_isolated_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '3.5000',
            'owner-isolated-authored',
        )
        self.create_activity(
            self.activity_only,
            self.activity_only_question,
            UserConceptActivity.ActivityType.APPROVED_EDIT,
            UserConceptActivity.Source.APPROVED_EDIT,
            '0.9000',
            'activity-only-edit',
        )
        UserKnowledgeGraphState.objects.create(user=self.owner, status=UserKnowledgeGraphState.Status.FRESH)

    def create_concept(self, slug, name, source, provider, confidence):
        return KnowledgeConcept.objects.create(
            slug=slug,
            name=name,
            source=source,
            provider=provider,
            confidence=Decimal(confidence),
        )

    def create_question(self, user, title, body):
        return Question.objects.create(user=user, question_title=title, question_body=body)

    def create_edge(self, question, concept, *, tag=None, source=QuestionConceptEdge.Source.PROVIDER):
        return QuestionConceptEdge.objects.create(
            question=question,
            concept=concept,
            tag=tag,
            source=source,
            provider='scoring-v2-fixture',
            confidence=Decimal('1.0000'),
        )

    def create_activity(self, concept, question, activity_type, source, weight, idempotency_suffix, *, created_at=None):
        activity = UserConceptActivity.objects.create(
            user=self.owner,
            concept=concept,
            activity_type=activity_type,
            weight_delta=Decimal(weight),
            source=source,
            provider='activity-rebuild',
            confidence=Decimal('1.0000'),
            source_content_type=self.question_content_type,
            source_object_id=question.pk,
            related_question=question,
            idempotency_key=f'm016:{question.pk}:{idempotency_suffix}:raw-idempotency-key',
        )
        if created_at is not None:
            UserConceptActivity.objects.filter(pk=activity.pk).update(created_at=created_at, updated_at=created_at)
            activity.refresh_from_db()
        return activity

    def assert_payload_is_redacted(self, payload):
        rendered = repr(payload)
        for forbidden in self.FORBIDDEN_REDaction_TERMS:
            self.assertNotIn(forbidden, rendered, f'S02 owner insight payload leaked unsafe term {forbidden!r}: {rendered}')
        for question in [
            self.shared_question,
            self.second_shared_question,
            self.weak_question,
            self.stale_question,
            self.owner_isolated_question,
            self.activity_only_question,
            self.global_question,
        ]:
            self.assertNotIn(str(question.pk), rendered, f'S02 evidence leaked raw question id {question.pk}: {rendered}')

    def assert_v2_scores_are_bounded_numbers(self, concept):
        for field in [
            'state_score',
            'strength_score',
            'freshness_score',
            'connectivity_score',
            'diversity_score',
            'confidence_score',
        ]:
            self.assertIn(field, concept)
            value = float(concept[field])
            self.assertGreaterEqual(value, 0.0, f'{field} must be normalized/bounded for {concept}')
            self.assertLessEqual(value, 1.0, f'{field} must be normalized/bounded for {concept}')

    def assert_safe_evidence(self, concept):
        evidence = concept['evidence']
        self.assertIsInstance(evidence, list)
        self.assertGreaterEqual(len(evidence), 1)
        self.assertLessEqual(len(evidence), 5, f'Evidence must stay bounded for {concept}')
        previous_codes = []
        for entry in evidence:
            self.assertEqual(set(entry), self.SAFE_EVIDENCE_FIELDS)
            self.assertIsInstance(entry['code'], str)
            self.assertIsInstance(entry['label'], str)
            self.assertNotEqual(entry['code'], '')
            self.assertNotEqual(entry['label'], '')
            self.assertGreaterEqual(float(entry['weight']), 0.0)
            self.assertLessEqual(float(entry['weight']), 1.0)
            previous_codes.append(entry['code'])
        self.assertEqual(previous_codes, sorted(previous_codes), f'Evidence ordering must be deterministic for {concept}')

    def score(self, concept, field):
        return Decimal(str(concept[field]))

    def test_owner_insights_exposes_additive_scoring_v2_fields_and_safe_evidence(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))
        self.assertEqual(response.data['viewer'], {'is_owner': True})
        concepts_by_slug = {entry['slug']: entry for entry in response.data['concepts']}
        self.assertEqual(
            set(concepts_by_slug),
            {'django', 'api-design', 'css-basics', 'legacy-python', 'globally-connected', 'activity-only'},
        )

        for concept in concepts_by_slug.values():
            self.assertTrue(self.REQUIRED_LEGACY_FIELDS.issubset(concept), concept)
            self.assertTrue(self.SCORING_V2_FIELDS.issubset(concept), concept)
            self.assert_v2_scores_are_bounded_numbers(concept)
            self.assertIn(concept['confidence_band'], {'high', 'medium', 'low'})
            self.assertIsInstance(concept['owner_graph_degree'], int)
            self.assertGreaterEqual(concept['owner_graph_degree'], 0)
            self.assertIsInstance(concept['owner_visible_related_question_count'], int)
            self.assertGreaterEqual(concept['owner_visible_related_question_count'], 0)
            self.assertEqual(concept['activity_types'], sorted(concept['activity_types']))
            self.assertLessEqual(len(concept['activity_types']), 6)
            self.assert_safe_evidence(concept)

        self.assertEqual(concepts_by_slug['django']['semantic_state'], 'strong')
        self.assertGreaterEqual(self.score(concepts_by_slug['django'], 'state_score'), Decimal('0.7000'))
        self.assertGreaterEqual(concepts_by_slug['django']['owner_graph_degree'], 1)
        self.assertGreaterEqual(concepts_by_slug['django']['owner_visible_related_question_count'], 2)
        self.assertIn('authored_question', concepts_by_slug['django']['activity_types'])
        self.assertIn('question_upvote', concepts_by_slug['django']['activity_types'])

        self.assertEqual(concepts_by_slug['css-basics']['semantic_state'], 'weak')
        self.assertLess(
            self.score(concepts_by_slug['css-basics'], 'strength_score'),
            self.score(concepts_by_slug['django'], 'strength_score'),
        )

        self.assertEqual(concepts_by_slug['legacy-python']['semantic_state'], 'stale')
        self.assertLess(
            self.score(concepts_by_slug['legacy-python'], 'freshness_score'),
            self.score(concepts_by_slug['django'], 'freshness_score'),
        )
        self.assertGreater(
            self.score(concepts_by_slug['legacy-python'], 'strength_score'),
            self.score(concepts_by_slug['css-basics'], 'strength_score'),
        )

        self.assertGreaterEqual(
            self.score(concepts_by_slug['api-design'], 'diversity_score'),
            self.score(concepts_by_slug['django'], 'diversity_score'),
        )
        self.assertEqual(
            concepts_by_slug['api-design']['activity_types'],
            ['approved_edit', 'best_solution', 'posted_solution'],
        )
        self.assert_payload_is_redacted(response.data)

    def test_owner_visible_topology_classifies_global_only_connections_as_isolated(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))
        concepts_by_slug = {entry['slug']: entry for entry in response.data['concepts']}
        globally_connected = concepts_by_slug['globally-connected']
        activity_only = concepts_by_slug['activity-only']

        self.assertEqual(globally_connected['semantic_state'], 'isolated')
        self.assertEqual(globally_connected['owner_graph_degree'], 0)
        self.assertEqual(globally_connected['owner_visible_related_question_count'], 0)
        self.assertEqual(globally_connected['connectivity_score'], '0.0000')
        self.assertIn(
            'owner_visible_isolated',
            {entry['code'] for entry in globally_connected['evidence']},
            'Global QuestionConceptEdge rows must not create owner-visible connectivity evidence.',
        )

        self.assertEqual(activity_only['semantic_state'], 'isolated')
        self.assertEqual(activity_only['owner_graph_degree'], 0)
        self.assertEqual(activity_only['owner_visible_related_question_count'], 0)
        self.assertEqual(activity_only['connectivity_score'], '0.0000')
        self.assert_payload_is_redacted(response.data)

    def test_stale_activity_wins_over_otherwise_strong_component_scores(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))
        stale = {entry['slug']: entry for entry in response.data['concepts']}['legacy-python']
        self.assertEqual(stale['semantic_state'], 'stale')
        self.assertTrue(self.SCORING_V2_FIELDS.issubset(stale), stale)
        self.assertGreaterEqual(self.score(stale, 'strength_score'), Decimal('0.7000'))
        self.assertLessEqual(self.score(stale, 'freshness_score'), Decimal('0.2500'))
        self.assertIn('stale_activity', {entry['code'] for entry in stale['evidence']})
        self.assert_payload_is_redacted(response.data)

    def test_owner_insights_remain_authenticated_only_for_scoring_v2_contract(self):
        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
