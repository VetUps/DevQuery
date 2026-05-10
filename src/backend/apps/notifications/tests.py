from datetime import timedelta
import uuid

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.notifications.services import NotificationNotFound, NotificationService
from apps.qa.models import Question
from apps.qa.services.question_expert_invitation_service import QuestionExpertInvitationService
from apps.user.models import CustomUser, ReputationPolicyConfig


class NotificationServiceTests(TestCase):
    def setUp(self):
        self.recipient = CustomUser.objects.create_user(
            user_email='recipient@example.com',
            user_name='recipient',
            password='password123',
        )
        self.other_recipient = CustomUser.objects.create_user(
            user_email='other-recipient@example.com',
            user_name='other_recipient',
            password='password123',
        )
        self.question = Question.objects.create(
            user=self.recipient,
            question_title='Notification source question',
            question_body='Question body for notification context.',
        )

    def test_create_notification_persists_recipient_scoped_row(self):
        notification = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Expert invitation',
            message='Please review this question.',
            payload={'question_id': str(self.question.pk)},
            source_question=self.question,
            expires_at=timezone.now() + timedelta(days=2),
        )

        self.assertIsNotNone(notification.notification_id)
        self.assertEqual(notification.recipient, self.recipient)
        self.assertEqual(notification.notification_type, Notification.NotificationType.EXPERT_INVITATION)
        self.assertEqual(notification.title, 'Expert invitation')
        self.assertEqual(notification.payload, {'question_id': str(self.question.pk)})
        self.assertEqual(notification.source_question, self.question)
        self.assertIsNone(notification.read_at)
        self.assertIsNotNone(notification.created_at)
        self.assertIsNotNone(notification.expires_at)

    def test_create_notification_defaults_payload_only_when_omitted(self):
        notification = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Default payload',
            message='Payload omitted.',
        )

        self.assertEqual(notification.payload, {})

    def test_create_notification_rejects_non_dict_payload(self):
        with self.assertRaises(ValidationError):
            NotificationService.create_notification(
                recipient=self.recipient,
                notification_type=Notification.NotificationType.EXPERT_INVITATION,
                title='Invalid payload',
                message='Payload must remain structured.',
                payload=['not', 'a', 'dict'],
            )

    def test_create_notification_dedupes_same_recipient_type_and_key(self):
        first = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='First title',
            message='First message',
            dedupe_key='question-1:expert-1',
        )
        second = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Second title ignored',
            message='Second message ignored',
            dedupe_key='question-1:expert-1',
        )

        self.assertEqual(second.pk, first.pk)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.recipient,
                notification_type=Notification.NotificationType.EXPERT_INVITATION,
                dedupe_key='question-1:expert-1',
            ).count(),
            1,
        )
        second.refresh_from_db()
        self.assertEqual(second.title, 'First title')

    def test_create_notification_allows_same_dedupe_key_for_different_recipients(self):
        first = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='First recipient',
            message='Same dedupe key.',
            dedupe_key='shared-key',
        )
        second = NotificationService.create_notification(
            recipient=self.other_recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Second recipient',
            message='Same dedupe key.',
            dedupe_key='shared-key',
        )

        self.assertNotEqual(second.pk, first.pk)
        self.assertEqual(Notification.objects.filter(dedupe_key='shared-key').count(), 2)

    def test_list_for_user_returns_only_recipient_notifications_newest_first(self):
        older = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Older',
            message='Older message.',
        )
        newer = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Newer',
            message='Newer message.',
            expires_at=timezone.now() - timedelta(days=1),
        )
        NotificationService.create_notification(
            recipient=self.other_recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Foreign',
            message='Foreign message.',
        )

        notifications = list(NotificationService.list_for_user(self.recipient))

        self.assertEqual([notification.pk for notification in notifications], [newer.pk, older.pk])
        self.assertEqual(notifications[0].expires_at.date(), (timezone.now() - timedelta(days=1)).date())

    def test_list_for_user_returns_empty_queryset_for_user_without_notifications(self):
        self.assertEqual(list(NotificationService.list_for_user(self.other_recipient)), [])

    def test_mark_read_sets_read_at_for_recipient_notification(self):
        notification = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Unread',
            message='Unread message.',
        )

        marked = NotificationService.mark_read(notification.notification_id, self.recipient)

        self.assertEqual(marked.pk, notification.pk)
        self.assertIsNotNone(marked.read_at)
        notification.refresh_from_db()
        self.assertEqual(notification.read_at, marked.read_at)

    def test_mark_read_is_idempotent_for_already_read_notification(self):
        notification = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Already read',
            message='Already read message.',
        )
        first = NotificationService.mark_read(notification.notification_id, self.recipient)

        second = NotificationService.mark_read(notification.notification_id, self.recipient)

        self.assertEqual(second.pk, first.pk)
        self.assertEqual(second.read_at, first.read_at)

    def test_mark_read_for_foreign_notification_raises_not_found(self):
        notification = NotificationService.create_notification(
            recipient=self.other_recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Foreign',
            message='Foreign message.',
        )

        with self.assertRaises(NotificationNotFound):
            NotificationService.mark_read(notification.notification_id, self.recipient)

    def test_mark_read_for_missing_notification_raises_not_found(self):
        with self.assertRaises(NotificationNotFound):
            NotificationService.mark_read(uuid.uuid4(), self.recipient)

    def test_mark_all_read_updates_only_recipient_unread_rows_and_returns_counters(self):
        first = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='First unread',
            message='First unread message.',
        )
        second = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Second unread',
            message='Second unread message.',
        )
        already_read = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Already read',
            message='Already read message.',
        )
        NotificationService.mark_read(already_read.notification_id, self.recipient)
        foreign = NotificationService.create_notification(
            recipient=self.other_recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Foreign unread',
            message='Foreign unread message.',
        )

        result = NotificationService.mark_all_read(self.recipient)

        self.assertEqual(result, {'marked_count': 2, 'unread_count': 0})
        for notification in [first, second, already_read]:
            notification.refresh_from_db()
            self.assertIsNotNone(notification.read_at)
        foreign.refresh_from_db()
        self.assertIsNone(foreign.read_at)

    def test_mark_all_read_is_idempotent_when_nothing_is_unread(self):
        notification = NotificationService.create_notification(
            recipient=self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Only unread',
            message='Only unread message.',
        )
        first_result = NotificationService.mark_all_read(self.recipient)
        notification.refresh_from_db()
        first_read_at = notification.read_at

        second_result = NotificationService.mark_all_read(self.recipient)

        notification.refresh_from_db()
        self.assertEqual(first_result, {'marked_count': 1, 'unread_count': 0})
        self.assertEqual(second_result, {'marked_count': 0, 'unread_count': 0})
        self.assertEqual(notification.read_at, first_read_at)


class NotificationApiTests(APITestCase):
    EXPECTED_NOTIFICATION_KEYS = {
        'notification_id',
        'notification_type',
        'title',
        'message',
        'payload',
        'source_question_id',
        'created_at',
        'read_at',
        'expires_at',
        'is_read',
        'is_expired',
        'invitation_status',
        'protected_window_active',
        'protected_window_ended',
        'protected_until',
        'cta_url',
    }

    def setUp(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=6)
        self.recipient = CustomUser.objects.create_user(
            user_email='api-recipient@example.com',
            user_name='api_recipient',
            password='password123',
        )
        self.other_recipient = CustomUser.objects.create_user(
            user_email='api-other-recipient@example.com',
            user_name='api_other_recipient',
            password='password123',
        )
        self.question = Question.objects.create(
            user=self.recipient,
            question_title='API notification source question',
            question_body='Question body for API notification context.',
        )
        Question.objects.filter(pk=self.question.pk).update(question_created_at=timezone.now() - timedelta(hours=1))
        self.question.refresh_from_db()

    def create_question(self, *, created_at, author=None):
        question = Question.objects.create(
            user=author or self.recipient,
            question_title='API notification source question',
            question_body='Question body for API notification context.',
        )
        Question.objects.filter(pk=question.pk).update(question_created_at=created_at)
        question.refresh_from_db()
        return question

    def notification_payloads(self, response):
        if isinstance(response.data, dict) and 'results' in response.data:
            return response.data['results']
        return response.data

    def assert_notification_contract(self, payload):
        self.assertEqual(set(payload.keys()), self.EXPECTED_NOTIFICATION_KEYS)
        self.assertNotIn('recipient', payload)
        self.assertNotIn('recipient_id', payload)
        self.assertNotIn('user_email', payload)
        self.assertNotIn('email', payload)

    def assert_paginated_list_contract(self, response):
        self.assertEqual(set(response.data.keys()), {'count', 'next', 'previous', 'results'})
        self.assertIsInstance(response.data['results'], list)

    def assert_summary_contract(self, response):
        self.assertEqual(set(response.data.keys()), {'unread_count', 'latest'})
        self.assertIsInstance(response.data['unread_count'], int)
        self.assertIsInstance(response.data['latest'], list)
        for payload in response.data['latest']:
            self.assert_notification_contract(payload)

    def assert_invitation_state(
        self,
        payload,
        *,
        notification,
        invitation_status,
        is_expired,
        protected_window_active,
        protected_window_ended,
        protected_until,
        cta_url,
    ):
        self.assert_notification_contract(payload)
        self.assertEqual(payload['notification_id'], str(notification.notification_id))
        self.assertEqual(payload['invitation_status'], invitation_status)
        self.assertIsInstance(payload['invitation_status'], str)
        self.assertEqual(payload['is_expired'], is_expired)
        self.assertIsInstance(payload['is_expired'], bool)
        self.assertEqual(payload['protected_window_active'], protected_window_active)
        self.assertIsInstance(payload['protected_window_active'], bool)
        self.assertEqual(payload['protected_window_ended'], protected_window_ended)
        self.assertIsInstance(payload['protected_window_ended'], bool)
        self.assertEqual(payload['protected_until'], protected_until)
        if protected_until is None:
            self.assertIsNone(payload['protected_until'])
        else:
            self.assertIsInstance(payload['protected_until'], str)
        self.assertEqual(payload['cta_url'], cta_url)
        if cta_url is None:
            self.assertIsNone(payload['cta_url'])
        else:
            self.assertIsInstance(payload['cta_url'], str)

    def create_notification(
        self,
        *,
        recipient=None,
        title='API notification',
        expires_at=None,
        source_question_marker='default',
        payload_marker='default',
    ):
        source_question = self.question if source_question_marker == 'default' else source_question_marker
        if payload_marker == 'default':
            payload = {'question_id': str(source_question.pk)} if source_question is not None else {}
        else:
            payload = payload_marker
        if payload is None:
            payload = {}
        return NotificationService.create_notification(
            recipient=recipient or self.recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title=title,
            message=f'{title} message.',
            payload=payload,
            source_question=source_question,
            expires_at=expires_at,
        )

    def test_unauthenticated_list_returns_401(self):
        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, 401, response.data)

    def test_authenticated_list_returns_only_current_user_notifications(self):
        own_notification = self.create_notification(title='Own notification')
        self.create_notification(recipient=self.other_recipient, title='Foreign notification')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_paginated_list_contract(response)
        payloads = self.notification_payloads(response)
        self.assertEqual(len(payloads), 1)
        self.assert_notification_contract(payloads[0])
        self.assertEqual(payloads[0]['notification_id'], str(own_notification.notification_id))
        self.assertEqual(payloads[0]['notification_type'], Notification.NotificationType.EXPERT_INVITATION)
        self.assertEqual(payloads[0]['title'], 'Own notification')
        self.assertEqual(payloads[0]['payload'], {'question_id': str(self.question.pk)})
        self.assertEqual(payloads[0]['source_question_id'], str(self.question.pk))
        self.assertFalse(payloads[0]['is_read'])
        self.assertFalse(payloads[0]['is_expired'])
        self.assertEqual(payloads[0]['invitation_status'], 'active')
        self.assertTrue(payloads[0]['protected_window_active'])
        self.assertFalse(payloads[0]['protected_window_ended'])
        self.assertEqual(payloads[0]['protected_until'], (self.question.question_created_at + timedelta(hours=6)).isoformat())
        self.assertEqual(payloads[0]['cta_url'], f'/questions/{self.question.pk}')
        self.assertIn('created_at', payloads[0])
        self.assertIn('read_at', payloads[0])
        self.assertIn('expires_at', payloads[0])

    def test_authenticated_list_returns_empty_results_for_user_without_notifications(self):
        self.create_notification(recipient=self.other_recipient, title='Foreign notification')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_paginated_list_contract(response)
        self.assertEqual(self.notification_payloads(response), [])

    def test_expired_notification_serializes_is_expired_true(self):
        notification = self.create_notification(
            title='Expired notification',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_paginated_list_contract(response)
        payloads = self.notification_payloads(response)
        self.assertEqual(payloads[0]['notification_id'], str(notification.notification_id))
        self.assertTrue(payloads[0]['is_expired'])
        self.assertEqual(payloads[0]['invitation_status'], 'expired')
        self.assertTrue(payloads[0]['protected_window_active'])
        self.assertFalse(payloads[0]['protected_window_ended'])

    def test_active_invitation_ignores_untrusted_payload_status_claims(self):
        notification = self.create_notification(
            title='Payload lies',
            payload_marker={
                'question_id': str(self.question.pk),
                'invitation_status': 'expired',
                'protected_window_ended': True,
                'cta_url': '/questions/untrusted',
            },
            expires_at=timezone.now() + timedelta(hours=10),
        )
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, 200, response.data)
        payload = self.notification_payloads(response)[0]
        self.assertEqual(payload['notification_id'], str(notification.notification_id))
        self.assertEqual(payload['payload']['invitation_status'], 'expired')
        self.assertEqual(payload['invitation_status'], 'active')
        self.assertTrue(payload['protected_window_active'])
        self.assertFalse(payload['protected_window_ended'])
        self.assertEqual(payload['cta_url'], f'/questions/{self.question.pk}')

    def test_ttl_active_invitation_serializes_protected_window_ended_status(self):
        ended_question = self.create_question(created_at=timezone.now() - timedelta(hours=7))
        notification = self.create_notification(
            title='Protection ended notification',
            source_question_marker=ended_question,
            expires_at=timezone.now() + timedelta(hours=5),
        )
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, 200, response.data)
        payload = self.notification_payloads(response)[0]
        self.assertEqual(payload['notification_id'], str(notification.notification_id))
        self.assertFalse(payload['is_expired'])
        self.assertEqual(payload['invitation_status'], 'protected_ended')
        self.assertFalse(payload['protected_window_active'])
        self.assertTrue(payload['protected_window_ended'])
        self.assertEqual(payload['protected_until'], (ended_question.question_created_at + timedelta(hours=6)).isoformat())
        self.assertEqual(payload['cta_url'], f'/questions/{ended_question.pk}')

    def test_no_source_invitation_serializes_conservative_unavailable_metadata(self):
        notification = self.create_notification(
            title='No source notification',
            source_question_marker=None,
            payload_marker={},
            expires_at=timezone.now() + timedelta(hours=5),
        )
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, 200, response.data)
        payload = self.notification_payloads(response)[0]
        self.assertEqual(payload['notification_id'], str(notification.notification_id))
        self.assertFalse(payload['is_expired'])
        self.assertEqual(payload['source_question_id'], None)
        self.assertEqual(payload['invitation_status'], 'unavailable')
        self.assertFalse(payload['protected_window_active'])
        self.assertFalse(payload['protected_window_ended'])
        self.assertIsNone(payload['protected_until'])
        self.assertIsNone(payload['cta_url'])

    def test_list_and_summary_derive_all_invitation_states_from_server_fields(self):
        now = timezone.now()
        active_question = self.create_question(created_at=now - timedelta(hours=1))
        expired_question = self.create_question(created_at=now - timedelta(hours=1))
        protection_ended_question = self.create_question(created_at=now - timedelta(hours=7))
        active = self.create_notification(
            title='Active invitation',
            source_question_marker=active_question,
            payload_marker={
                'question_id': str(active_question.pk),
                'invitation_status': 'expired',
                'protected_window_active': False,
                'protected_window_ended': True,
                'cta_url': '/questions/forged-active',
            },
            expires_at=now + timedelta(hours=5),
        )
        expired = self.create_notification(
            title='Expired invitation',
            source_question_marker=expired_question,
            payload_marker={
                'question_id': str(expired_question.pk),
                'invitation_status': 'active',
                'protected_window_active': True,
                'cta_url': '/questions/forged-expired',
            },
            expires_at=now - timedelta(minutes=1),
        )
        protection_ended = self.create_notification(
            title='Protection ended invitation',
            source_question_marker=protection_ended_question,
            payload_marker={
                'question_id': str(protection_ended_question.pk),
                'invitation_status': 'active',
                'protected_window_active': True,
                'protected_window_ended': False,
                'cta_url': '/questions/forged-ended',
            },
            expires_at=now + timedelta(hours=5),
        )
        unavailable = self.create_notification(
            title='Unavailable invitation',
            source_question_marker=None,
            payload_marker={
                'question_id': str(uuid.uuid4()),
                'invitation_status': 'active',
                'protected_window_active': True,
                'protected_window_ended': False,
                'cta_url': '/questions/forged-unavailable',
            },
            expires_at=now + timedelta(hours=5),
        )
        for index, notification in enumerate([active, expired, protection_ended, unavailable]):
            Notification.objects.filter(pk=notification.pk).update(created_at=now - timedelta(minutes=index))
        self.client.force_authenticate(user=self.recipient)

        list_response = self.client.get('/notifications/')
        summary_response = self.client.get('/notifications/summary/')

        self.assertEqual(list_response.status_code, 200, list_response.data)
        self.assert_paginated_list_contract(list_response)
        self.assertEqual(list_response.data['count'], 4)
        self.assertEqual(summary_response.status_code, 200, summary_response.data)
        self.assert_summary_contract(summary_response)
        self.assertEqual(summary_response.data['unread_count'], 4)
        self.assertEqual(len(summary_response.data['latest']), 4)
        expected_by_title = {
            'Active invitation': {
                'notification': active,
                'invitation_status': 'active',
                'is_expired': False,
                'protected_window_active': True,
                'protected_window_ended': False,
                'protected_until': (active_question.question_created_at + timedelta(hours=6)).isoformat(),
                'cta_url': f'/questions/{active_question.pk}',
            },
            'Expired invitation': {
                'notification': expired,
                'invitation_status': 'expired',
                'is_expired': True,
                'protected_window_active': True,
                'protected_window_ended': False,
                'protected_until': (expired_question.question_created_at + timedelta(hours=6)).isoformat(),
                'cta_url': f'/questions/{expired_question.pk}',
            },
            'Protection ended invitation': {
                'notification': protection_ended,
                'invitation_status': 'protected_ended',
                'is_expired': False,
                'protected_window_active': False,
                'protected_window_ended': True,
                'protected_until': (protection_ended_question.question_created_at + timedelta(hours=6)).isoformat(),
                'cta_url': f'/questions/{protection_ended_question.pk}',
            },
            'Unavailable invitation': {
                'notification': unavailable,
                'invitation_status': 'unavailable',
                'is_expired': False,
                'protected_window_active': False,
                'protected_window_ended': False,
                'protected_until': None,
                'cta_url': None,
            },
        }
        for response_payloads in [self.notification_payloads(list_response), summary_response.data['latest']]:
            payloads_by_title = {payload['title']: payload for payload in response_payloads}
            self.assertEqual(set(payloads_by_title), set(expected_by_title))
            for title, expected in expected_by_title.items():
                self.assert_invitation_state(payloads_by_title[title], **expected)
        list_payloads_by_title = {payload['title']: payload for payload in self.notification_payloads(list_response)}
        self.assertEqual(list_payloads_by_title['Active invitation']['payload']['cta_url'], '/questions/forged-active')
        self.assertEqual(list_payloads_by_title['Active invitation']['invitation_status'], 'active')
        self.assertEqual(list_payloads_by_title['Unavailable invitation']['payload']['cta_url'], '/questions/forged-unavailable')
        self.assertIsNone(list_payloads_by_title['Unavailable invitation']['cta_url'])

    def test_unauthenticated_summary_returns_401(self):
        response = self.client.get('/notifications/summary/')

        self.assertEqual(response.status_code, 401, response.data)

    def test_summary_returns_unread_count_and_bounded_latest_for_current_user_only(self):
        now = timezone.now()
        own_notifications = []
        for index in range(6):
            notification = self.create_notification(title=f'Own summary {index}')
            Notification.objects.filter(pk=notification.pk).update(created_at=now - timedelta(minutes=index))
            own_notifications.append(notification)
        NotificationService.mark_read(own_notifications[1].notification_id, self.recipient)
        foreign_newer = self.create_notification(recipient=self.other_recipient, title='Foreign newer unread')
        Notification.objects.filter(pk=foreign_newer.pk).update(created_at=now + timedelta(minutes=5))
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/summary/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_summary_contract(response)
        self.assertEqual(response.data['unread_count'], 5)
        self.assertEqual(len(response.data['latest']), 5)
        self.assertEqual(
            [payload['title'] for payload in response.data['latest']],
            ['Own summary 0', 'Own summary 1', 'Own summary 2', 'Own summary 3', 'Own summary 4'],
        )
        for payload in response.data['latest']:
            self.assertNotEqual(payload['title'], 'Foreign newer unread')
            self.assert_notification_contract(payload)

    def test_summary_returns_empty_latest_for_user_without_notifications(self):
        self.create_notification(recipient=self.other_recipient, title='Foreign only')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/summary/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_summary_contract(response)
        self.assertEqual(response.data['unread_count'], 0)
        self.assertEqual(response.data['latest'], [])

    def test_unread_status_filters_current_user_unread_notifications_only(self):
        unread = self.create_notification(title='Unread own')
        read = self.create_notification(title='Read own')
        NotificationService.mark_read(read.notification_id, self.recipient)
        self.create_notification(recipient=self.other_recipient, title='Foreign unread')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/', {'status': 'unread', 'page': '1'})

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_paginated_list_contract(response)
        payloads = self.notification_payloads(response)
        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]['notification_id'], str(unread.notification_id))
        self.assertEqual(payloads[0]['title'], 'Unread own')
        self.assertFalse(payloads[0]['is_read'])

    def test_all_status_returns_read_and_unread_current_user_notifications(self):
        unread = self.create_notification(title='Unread own')
        read = self.create_notification(title='Read own')
        NotificationService.mark_read(read.notification_id, self.recipient)
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/', {'status': 'all', 'page': '1'})

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_paginated_list_contract(response)
        self.assertEqual(
            {payload['notification_id'] for payload in self.notification_payloads(response)},
            {str(unread.notification_id), str(read.notification_id)},
        )

    def test_invalid_status_returns_400_without_widening_query(self):
        self.create_notification(title='Own notification')
        self.create_notification(recipient=self.other_recipient, title='Foreign notification')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/', {'status': 'archived'})

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('status', response.data)
        self.assertNotIn('results', response.data)

    def test_invalid_page_returns_400(self):
        self.create_notification(title='Own notification')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/', {'page': 'not-a-number'})

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('page', response.data)

    def test_summary_invitation_metadata_is_server_derived(self):
        notification = self.create_notification(
            title='Summary payload lies',
            payload_marker={
                'question_id': str(self.question.pk),
                'invitation_status': 'expired',
                'protected_window_active': False,
                'protected_window_ended': True,
                'cta_url': '/questions/forged',
            },
            expires_at=timezone.now() + timedelta(hours=10),
        )
        self.client.force_authenticate(user=self.recipient)

        response = self.client.get('/notifications/summary/')

        self.assertEqual(response.status_code, 200, response.data)
        payload = response.data['latest'][0]
        self.assertEqual(payload['notification_id'], str(notification.notification_id))
        self.assertEqual(payload['payload']['cta_url'], '/questions/forged')
        self.assertEqual(payload['invitation_status'], 'active')
        self.assertTrue(payload['protected_window_active'])
        self.assertFalse(payload['protected_window_ended'])
        self.assertEqual(payload['cta_url'], f'/questions/{self.question.pk}')

    def test_unauthenticated_mark_read_returns_401(self):
        notification = self.create_notification()

        response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')

        self.assertEqual(response.status_code, 401, response.data)

    def test_mark_read_persists_read_at_for_current_user_notification(self):
        notification = self.create_notification()
        self.client.force_authenticate(user=self.recipient)

        response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)
        self.assertEqual(response.data['notification_id'], str(notification.notification_id))
        self.assert_notification_contract(response.data)
        self.assertTrue(response.data['is_read'])
        self.assertIsNotNone(response.data['read_at'])

    def test_repeated_mark_read_stays_successful_without_changing_read_at(self):
        notification = self.create_notification()
        self.client.force_authenticate(user=self.recipient)
        first_response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')
        notification.refresh_from_db()
        first_read_at = notification.read_at

        second_response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')

        notification.refresh_from_db()
        self.assertEqual(first_response.status_code, 200, first_response.data)
        self.assertEqual(second_response.status_code, 200, second_response.data)
        self.assertEqual(notification.recipient, self.recipient)
        self.assertEqual(notification.read_at, first_read_at)
        self.assertEqual(second_response.data['read_at'], first_response.data['read_at'])

    def test_foreign_mark_read_returns_404_without_mutating_foreign_row(self):
        notification = self.create_notification(recipient=self.other_recipient, title='Foreign notification')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')

        self.assertEqual(response.status_code, 404, response.data)
        notification.refresh_from_db()
        self.assertIsNone(notification.read_at)

    def test_missing_mark_read_returns_404(self):
        self.client.force_authenticate(user=self.recipient)

        response = self.client.patch(f'/notifications/{uuid.uuid4()}/read/', {}, format='json')

        self.assertEqual(response.status_code, 404, response.data)

    def test_unauthenticated_mark_all_read_returns_401(self):
        response = self.client.patch('/notifications/read-all/', {}, format='json')

        self.assertEqual(response.status_code, 401, response.data)

    def test_mark_all_read_mutates_only_current_user_and_returns_counters(self):
        unread_one = self.create_notification(title='Current unread one')
        unread_two = self.create_notification(title='Current unread two')
        read_one = self.create_notification(title='Current already read')
        NotificationService.mark_read(read_one.notification_id, self.recipient)
        foreign_unread = self.create_notification(recipient=self.other_recipient, title='Foreign unread')
        self.client.force_authenticate(user=self.recipient)

        response = self.client.patch(
            '/notifications/read-all/',
            {'recipient': str(self.other_recipient.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {'marked_count': 2, 'unread_count': 0})
        for notification in [unread_one, unread_two, read_one]:
            notification.refresh_from_db()
            self.assertIsNotNone(notification.read_at)
        foreign_unread.refresh_from_db()
        self.assertIsNone(foreign_unread.read_at)

    def test_mark_all_read_is_idempotent_and_keeps_foreign_count_private(self):
        own = self.create_notification(title='Current unread')
        foreign = self.create_notification(recipient=self.other_recipient, title='Foreign unread')
        self.client.force_authenticate(user=self.recipient)
        first_response = self.client.patch('/notifications/read-all/', {}, format='json')
        own.refresh_from_db()
        first_read_at = own.read_at

        second_response = self.client.patch('/notifications/read-all/', {}, format='json')

        own.refresh_from_db()
        foreign.refresh_from_db()
        self.assertEqual(first_response.status_code, 200, first_response.data)
        self.assertEqual(first_response.data, {'marked_count': 1, 'unread_count': 0})
        self.assertEqual(second_response.status_code, 200, second_response.data)
        self.assertEqual(second_response.data, {'marked_count': 0, 'unread_count': 0})
        self.assertEqual(own.read_at, first_read_at)
        self.assertIsNone(foreign.read_at)

    def test_mark_all_read_updates_list_and_summary_unread_counts(self):
        unread_one = self.create_notification(title='Unread one')
        unread_two = self.create_notification(title='Unread two')
        read_one = self.create_notification(title='Read one')
        NotificationService.mark_read(read_one.notification_id, self.recipient)
        self.client.force_authenticate(user=self.recipient)

        mark_response = self.client.patch('/notifications/read-all/', {}, format='json')
        unread_response = self.client.get('/notifications/', {'status': 'unread'})
        all_response = self.client.get('/notifications/', {'status': 'all'})
        summary_response = self.client.get('/notifications/summary/')

        self.assertEqual(mark_response.status_code, 200, mark_response.data)
        self.assertEqual(mark_response.data, {'marked_count': 2, 'unread_count': 0})
        self.assertEqual(unread_response.status_code, 200, unread_response.data)
        self.assertEqual(unread_response.data['count'], 0)
        self.assertEqual(unread_response.data['results'], [])
        self.assertEqual(all_response.status_code, 200, all_response.data)
        self.assertEqual(all_response.data['count'], 3)
        self.assertTrue(all(payload['is_read'] for payload in all_response.data['results']))
        self.assertEqual(summary_response.status_code, 200, summary_response.data)
        self.assertEqual(summary_response.data['unread_count'], 0)
        self.assertEqual(
            {payload['notification_id'] for payload in summary_response.data['latest']},
            {str(unread_one.notification_id), str(unread_two.notification_id), str(read_one.notification_id)},
        )

    def test_invitation_creation_current_recipient_summary_list_and_read_lifecycle_final_assembly(self):
        author = CustomUser.objects.create_user(
            user_email='assembly-author@example.com',
            user_name='assembly_author',
            password='password123',
        )
        expert = CustomUser.objects.create_user(
            user_email='assembly-expert@example.com',
            user_name='assembly_expert',
            password='password123',
            user_reputation_score=150,
        )
        other_expert = CustomUser.objects.create_user(
            user_email='assembly-other-expert@example.com',
            user_name='assembly_other_expert',
            password='password123',
            user_reputation_score=200,
        )
        question = self.create_question(author=author, created_at=timezone.now() - timedelta(hours=1))
        creation = QuestionExpertInvitationService.create_invitations(
            question=question,
            requester=author,
            recipient_ids=[expert.pk, other_expert.pk],
        )
        notification = Notification.objects.get(source_question=question, recipient=expert)
        other_notification = Notification.objects.get(source_question=question, recipient=other_expert)

        unauthenticated_summary = self.client.get('/notifications/summary/')
        unauthenticated_read = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')
        self.client.force_authenticate(user=other_expert)
        foreign_list = self.client.get('/notifications/')
        foreign_summary = self.client.get('/notifications/summary/')
        foreign_read = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')
        other_notification.refresh_from_db()
        notification.refresh_from_db()
        self.client.force_authenticate(user=expert)
        unread_list = self.client.get('/notifications/', {'status': 'unread'})
        summary_before = self.client.get('/notifications/summary/')
        read_response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')
        summary_after = self.client.get('/notifications/summary/')
        read_all_response = self.client.patch(
            '/notifications/read-all/',
            {'recipient': str(other_expert.pk)},
            format='json',
        )

        self.assertEqual(creation.slot_state['used'], 2)
        self.assertEqual(len(creation.invitations), 2)
        self.assertEqual(unauthenticated_summary.status_code, 401, unauthenticated_summary.data)
        self.assertEqual(unauthenticated_read.status_code, 401, unauthenticated_read.data)
        self.assertEqual(foreign_list.status_code, 200, foreign_list.data)
        self.assertEqual(foreign_list.data['count'], 1)
        self.assertEqual(foreign_list.data['results'][0]['notification_id'], str(other_notification.notification_id))
        self.assertEqual(foreign_summary.status_code, 200, foreign_summary.data)
        self.assertEqual(foreign_summary.data['unread_count'], 1)
        self.assertEqual(foreign_read.status_code, 404, foreign_read.data)
        self.assertIsNone(notification.read_at)
        self.assertIsNone(other_notification.read_at)

        self.assertEqual(unread_list.status_code, 200, unread_list.data)
        self.assertEqual(unread_list.data['count'], 1)
        unread_payload = unread_list.data['results'][0]
        self.assertEqual(unread_payload['notification_id'], str(notification.notification_id))
        self.assertEqual(unread_payload['payload']['recipient_id'], str(expert.pk))
        self.assertEqual(unread_payload['source_question_id'], str(question.pk))
        self.assertEqual(unread_payload['invitation_status'], 'active')
        self.assertTrue(unread_payload['protected_window_active'])
        self.assertFalse(unread_payload['protected_window_ended'])
        self.assertEqual(unread_payload['cta_url'], f'/questions/{question.pk}')
        self.assert_notification_contract(unread_payload)
        self.assertNotIn('user_email', unread_payload['payload'])
        self.assertNotIn('recipient_email', unread_payload['payload'])

        self.assertEqual(summary_before.status_code, 200, summary_before.data)
        self.assertEqual(summary_before.data['unread_count'], 1)
        self.assertEqual(summary_before.data['latest'][0]['notification_id'], str(notification.notification_id))
        self.assertEqual(read_response.status_code, 200, read_response.data)
        self.assertTrue(read_response.data['is_read'])
        self.assertEqual(summary_after.status_code, 200, summary_after.data)
        self.assertEqual(summary_after.data['unread_count'], 0)
        self.assertEqual(read_all_response.status_code, 200, read_all_response.data)
        self.assertEqual(read_all_response.data, {'marked_count': 0, 'unread_count': 0})
        other_notification.refresh_from_db()
        self.assertIsNone(other_notification.read_at)

    def test_openapi_documents_notification_paths(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)

        self.assertIn('/notifications/', schema['paths'])
        self.assertIn('/notifications/summary/', schema['paths'])
        self.assertIn('/notifications/read-all/', schema['paths'])
        self.assertIn('/notifications/{notification_id}/read/', schema['paths'])
        self.assertIn('get', schema['paths']['/notifications/'])
        self.assertIn('get', schema['paths']['/notifications/summary/'])
        self.assertIn('patch', schema['paths']['/notifications/read-all/'])
        self.assertIn('patch', schema['paths']['/notifications/{notification_id}/read/'])
        list_parameters = schema['paths']['/notifications/']['get'].get('parameters', [])
        self.assertIn('status', {parameter['name'] for parameter in list_parameters})
        summary_schema = schema['paths']['/notifications/summary/']['get']['responses']['200']['content']['application/json']['schema']
        if '$ref' in summary_schema:
            summary_schema = schema['components']['schemas'][summary_schema['$ref'].rsplit('/', 1)[-1]]
        self.assertIn('unread_count', summary_schema['properties'])
        self.assertIn('latest', summary_schema['properties'])
        mark_all_schema = schema['paths']['/notifications/read-all/']['patch']['responses']['200']['content']['application/json']['schema']
        if '$ref' in mark_all_schema:
            mark_all_schema = schema['components']['schemas'][mark_all_schema['$ref'].rsplit('/', 1)[-1]]
        self.assertEqual(set(mark_all_schema['properties'].keys()), {'marked_count', 'unread_count'})
        notification_schema = schema['components']['schemas']['Notification']
        for field_name in [
            'invitation_status',
            'protected_window_active',
            'protected_window_ended',
            'protected_until',
            'cta_url',
            'is_expired',
            'source_question_id',
        ]:
            self.assertIn(field_name, notification_schema['properties'])
