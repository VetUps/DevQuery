from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase

from apps.knowledge.models import UserKnowledgeGraphState
from apps.knowledge.services import (
    get_user_graph_state,
    mark_user_graph_failed,
    mark_user_graph_fresh,
    mark_user_graph_rebuilding,
    mark_user_graph_stale,
)


class UserKnowledgeGraphStateTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='graph-state-owner@example.com',
            user_name='graph-state-owner',
            password='not-a-secret',
        )

    def test_get_user_graph_state_creates_default_fresh_row_once(self):
        first = get_user_graph_state(self.user)
        second = get_user_graph_state(self.user.pk)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(UserKnowledgeGraphState.objects.count(), 1)
        self.assertEqual(first.user, self.user)
        self.assertEqual(first.status, UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(first.stale_reason, '')
        self.assertEqual(first.last_error_message, '')
        self.assertEqual(first.last_failed_phase, '')
        self.assertIsNone(first.last_rebuild_started_at)
        self.assertIsNone(first.last_rebuild_finished_at)
        self.assertTrue(first.created_at)
        self.assertTrue(first.updated_at)

    def test_one_user_has_at_most_one_graph_state_row(self):
        get_user_graph_state(self.user)

        with self.assertRaises(IntegrityError):
            UserKnowledgeGraphState.objects.create(user=self.user)

    def test_status_choices_are_exact_public_contract(self):
        self.assertEqual(
            {choice.value for choice in UserKnowledgeGraphState.Status},
            {'fresh', 'stale', 'rebuilding', 'failed'},
        )

    def test_invalid_status_and_reason_are_rejected_by_validation(self):
        state = UserKnowledgeGraphState(
            user=self.user,
            status='mystery',
            stale_reason='raw unreviewed reason',
        )

        with self.assertRaises(ValidationError) as context:
            state.full_clean()

        self.assertIn('status', context.exception.message_dict)
        self.assertIn('stale_reason', context.exception.message_dict)

    def test_stale_and_failed_transitions_are_idempotent_and_redact_exception_details(self):
        unsafe_message = (
            'activity payload for private@example.com body="secret question body" '
            'Authorization: Bearer sk-live-token raw_events=[{"event":"question.created"}]'
        )

        stale = mark_user_graph_stale(
            self.user,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
            phase='question_authoring',
            error=RuntimeError(unsafe_message),
        )
        failed = mark_user_graph_failed(
            self.user.pk,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED,
            phase='activity_rebuild',
            error=ValueError(unsafe_message),
        )
        repeated = mark_user_graph_failed(
            self.user,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED,
            phase='activity_rebuild',
            error=ValueError('different private@example.com token'),
        )

        self.assertEqual(stale.pk, failed.pk)
        self.assertEqual(failed.pk, repeated.pk)
        self.assertEqual(UserKnowledgeGraphState.objects.count(), 1)
        repeated.refresh_from_db()
        self.assertEqual(repeated.status, UserKnowledgeGraphState.Status.FAILED)
        self.assertEqual(repeated.stale_reason, UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED)
        self.assertEqual(repeated.last_failed_phase, 'activity_rebuild')
        self.assertEqual(repeated.last_error_message, 'Graph activity rebuild failed during activity_rebuild.')
        self.assertNotIn('private@example.com', repeated.last_error_message)
        self.assertNotIn('secret question body', repeated.last_error_message)
        self.assertNotIn('sk-live-token', repeated.last_error_message)
        self.assertNotIn('raw_events', repeated.last_error_message)
        self.assertNotIn('different', repeated.last_error_message)

    def test_rebuilding_and_fresh_transitions_manage_timestamps(self):
        rebuilding = mark_user_graph_rebuilding(self.user, phase='owner_rebuild')

        self.assertEqual(rebuilding.status, UserKnowledgeGraphState.Status.REBUILDING)
        self.assertEqual(rebuilding.last_failed_phase, 'owner_rebuild')
        self.assertIsNotNone(rebuilding.last_rebuild_started_at)
        self.assertIsNone(rebuilding.last_rebuild_finished_at)

        fresh = mark_user_graph_fresh(self.user, phase='owner_rebuild')

        self.assertEqual(fresh.pk, rebuilding.pk)
        self.assertEqual(UserKnowledgeGraphState.objects.count(), 1)
        self.assertEqual(fresh.status, UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(fresh.stale_reason, '')
        self.assertEqual(fresh.last_error_message, '')
        self.assertEqual(fresh.last_failed_phase, 'owner_rebuild')
        self.assertEqual(fresh.last_rebuild_started_at, rebuilding.last_rebuild_started_at)
        self.assertIsNotNone(fresh.last_rebuild_finished_at)
        self.assertGreaterEqual(fresh.last_rebuild_finished_at, fresh.last_rebuild_started_at)
