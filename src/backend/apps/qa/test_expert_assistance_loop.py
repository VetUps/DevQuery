from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.qa.models import Question, Solution
from apps.qa.services.question_expert_invitation_service import QuestionExpertInvitationService
from apps.qa.services.question_protection_service import QuestionProtectionService
from apps.user.models import CustomUser, ReputationPolicyConfig, ReputationTransaction


class ExpertAssistanceLoopFinalAssemblyTests(APITestCase):
    def setUp(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=6)
        self.author = self.create_user('loop-author@example.com', 'LoopAuthor', 0)
        self.expert = self.create_user('loop-expert@example.com', 'LoopExpert', 150)
        self.master = self.create_user('loop-master@example.com', 'LoopMaster', 350)
        self.participant = self.create_user('loop-participant@example.com', 'LoopParticipant', 30)
        self.question = self.create_question(created_at=timezone.now() - timedelta(hours=1))
        self.eligible_url = f'/question/{self.question.question_id}/eligible-experts/'
        self.invite_url = f'/question/{self.question.question_id}/expert-invitations/'

    def create_user(self, email, name, score):
        user = CustomUser.objects.create_user(
            user_email=email,
            user_name=name,
            password='password',
        )
        user.user_reputation_score = score
        user.save(update_fields=['user_reputation_score'])
        return user

    def create_question(self, *, author=None, created_at=None):
        question = Question.objects.create(
            user=author or self.author,
            question_title='Final assembly protected newcomer question',
            question_body='This question exercises the newcomer-to-expert assistance loop.',
        )
        if created_at is not None:
            Question.objects.filter(pk=question.pk).update(question_created_at=created_at)
            question.refresh_from_db()
        return question

    def create_existing_invitation(self, recipient, *, question=None, expires_at=None, payload=None):
        question = question or self.question
        return Notification.objects.create(
            recipient=recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Existing expert invitation',
            message='Existing invitation for final assembly coverage.',
            payload=payload if payload is not None else {'question_id': str(question.pk)},
            source_question=question,
            expires_at=expires_at,
            dedupe_key=QuestionExpertInvitationService.build_dedupe_key(question.pk, recipient.pk),
        )

    def post_solution(self, actor, body='Final assembly expert answer.'):
        self.client.force_authenticate(actor)
        return self.client.post(
            '/solution/',
            {'question': str(self.question.question_id), 'solution_body': body},
            format='json',
        )

    def assert_reason_code(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code, response.data)
        self.assertEqual(response.data['code'], code)

    def test_author_invites_expert_notification_is_recipient_scoped_readable_and_expert_can_answer(self):
        self.client.force_authenticate(self.author)
        candidates_response = self.client.get(self.eligible_url)

        self.assertEqual(candidates_response.status_code, status.HTTP_200_OK, candidates_response.data)
        candidate_names = [candidate['user_name'] for candidate in candidates_response.data['results']]
        self.assertIn(self.expert.user_name, candidate_names)
        self.assertIn(self.master.user_name, candidate_names)
        self.assertNotIn(self.participant.user_name, candidate_names)
        self.assertEqual(candidates_response.data['remaining_slots'], 5)

        invite_response = self.client.post(
            self.invite_url,
            {'recipient_ids': [str(self.expert.pk)]},
            format='json',
        )

        self.assertEqual(invite_response.status_code, status.HTTP_201_CREATED, invite_response.data)
        self.assertEqual(invite_response.data['created_count'], 1)
        notification = Notification.objects.get(source_question=self.question, recipient=self.expert)

        self.client.force_authenticate(self.expert)
        notifications_response = self.client.get('/notifications/')

        self.assertEqual(notifications_response.status_code, status.HTTP_200_OK, notifications_response.data)
        self.assertEqual(notifications_response.data['count'], 1)
        invitation = notifications_response.data['results'][0]
        self.assertEqual(invitation['notification_id'], str(notification.notification_id))
        self.assertEqual(invitation['notification_type'], Notification.NotificationType.EXPERT_INVITATION)
        self.assertEqual(invitation['source_question_id'], str(self.question.pk))
        self.assertEqual(invitation['payload']['question_id'], str(self.question.pk))
        self.assertEqual(invitation['payload']['recipient_id'], str(self.expert.pk))
        self.assertEqual(invitation['invitation_status'], 'active')
        self.assertTrue(invitation['protected_window_active'])
        self.assertFalse(invitation['protected_window_ended'])
        self.assertEqual(invitation['protected_until'], (self.question.question_created_at + timedelta(hours=6)).isoformat())
        self.assertEqual(invitation['cta_url'], f'/questions/{self.question.pk}')
        self.assertFalse(invitation['is_read'])

        read_response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')

        self.assertEqual(read_response.status_code, status.HTTP_200_OK, read_response.data)
        self.assertTrue(read_response.data['is_read'])
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)

        answer_response = self.post_solution(self.expert)

        self.assertEqual(answer_response.status_code, status.HTTP_201_CREATED, answer_response.data)
        solution = Solution.objects.get(question=self.question, user=self.expert)
        self.assertEqual(solution.solution_body, 'Final assembly expert answer.')

    def test_foreign_user_cannot_see_or_mark_invitation_notification(self):
        notification = self.create_existing_invitation(self.expert)
        self.client.force_authenticate(self.participant)

        list_response = self.client.get('/notifications/')
        read_response = self.client.patch(f'/notifications/{notification.notification_id}/read/', {}, format='json')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK, list_response.data)
        self.assertEqual(list_response.data['count'], 0)
        self.assertEqual(list_response.data['results'], [])
        self.assertEqual(read_response.status_code, status.HTTP_404_NOT_FOUND, read_response.data)
        notification.refresh_from_db()
        self.assertIsNone(notification.read_at)

    def test_invitation_creation_rejects_duplicates_ineligible_max_slots_and_expired_window_without_partial_writes(self):
        self.client.force_authenticate(self.author)

        duplicate_response = self.client.post(
            self.invite_url,
            {'recipient_ids': [str(self.expert.pk), str(self.expert.pk)]},
            format='json',
        )
        ineligible_response = self.client.post(
            self.invite_url,
            {'recipient_ids': [str(self.participant.pk)]},
            format='json',
        )
        self.assert_reason_code(
            duplicate_response,
            status.HTTP_400_BAD_REQUEST,
            QuestionExpertInvitationService.DUPLICATE_RECIPIENT,
        )
        self.assert_reason_code(
            ineligible_response,
            status.HTTP_400_BAD_REQUEST,
            QuestionExpertInvitationService.RECIPIENT_NOT_ELIGIBLE,
        )
        self.assertFalse(Notification.objects.filter(source_question=self.question).exists())

        invited = [
            self.expert,
            self.master,
            self.create_user('loop-extra-1@example.com', 'LoopExtra1', 210),
            self.create_user('loop-extra-2@example.com', 'LoopExtra2', 220),
        ]
        for recipient in invited:
            self.create_existing_invitation(recipient)
        fifth = self.create_user('loop-extra-3@example.com', 'LoopExtra3', 230)
        sixth = self.create_user('loop-extra-4@example.com', 'LoopExtra4', 240)

        fifth_response = self.client.post(
            self.invite_url,
            {'recipient_ids': [str(fifth.pk)]},
            format='json',
        )
        sixth_response = self.client.post(
            self.invite_url,
            {'recipient_ids': [str(sixth.pk)]},
            format='json',
        )

        self.assertEqual(fifth_response.status_code, status.HTTP_201_CREATED, fifth_response.data)
        self.assertEqual(fifth_response.data['remaining_slots'], 0)
        self.assert_reason_code(
            sixth_response,
            status.HTTP_400_BAD_REQUEST,
            QuestionExpertInvitationService.MAX_INVITES_EXCEEDED,
        )
        self.assertEqual(Notification.objects.filter(source_question=self.question).count(), 5)
        self.assertFalse(Notification.objects.filter(source_question=self.question, recipient=sixth).exists())

        expired_question = self.create_question(created_at=timezone.now() - timedelta(hours=7))
        expired_response = self.client.post(
            f'/question/{expired_question.question_id}/expert-invitations/',
            {'recipient_ids': [str(sixth.pk)]},
            format='json',
        )

        self.assert_reason_code(
            expired_response,
            status.HTTP_400_BAD_REQUEST,
            QuestionExpertInvitationService.QUESTION_NOT_PROTECTED,
        )
        self.assertFalse(Notification.objects.filter(source_question=expired_question).exists())

    def test_notification_presence_or_payload_claims_never_grant_participant_answer_permission(self):
        self.create_existing_invitation(
            self.participant,
            expires_at=timezone.now() + timedelta(hours=1),
            payload={
                'question_id': str(self.question.pk),
                'recipient_reputation_level': CustomUser.ReputationLevel.EXPERT,
                'invitation_status': 'active',
                'cta_url': f'/questions/{self.question.pk}',
            },
        )

        blocked_response = self.post_solution(self.participant, body='Forged invitation should not authorize this.')

        self.assertEqual(blocked_response.status_code, status.HTTP_403_FORBIDDEN, blocked_response.data)
        self.assertEqual(blocked_response.data['code'], 'protected_newcomer_answer_required')
        self.assertEqual(blocked_response.data['detail'], QuestionProtectionService.build_answer_denied_message())
        self.assertFalse(Solution.objects.filter(question=self.question, user=self.participant).exists())
        self.assertEqual(ReputationTransaction.objects.count(), 0)

        Notification.objects.filter(source_question=self.question, recipient=self.participant).update(
            expires_at=timezone.now() - timedelta(minutes=1),
            payload={
                'question_id': str(self.question.pk),
                'recipient_reputation_level': CustomUser.ReputationLevel.MASTER,
                'invitation_status': 'expired',
                'protected_window_ended': True,
            },
        )

        blocked_again_response = self.post_solution(self.participant, body='Expired forged invitation should not authorize this.')

        self.assertEqual(blocked_again_response.status_code, status.HTTP_403_FORBIDDEN, blocked_again_response.data)
        self.assertFalse(Solution.objects.filter(question=self.question, user=self.participant).exists())
        self.assertFalse(QuestionProtectionService.get_answer_eligibility(self.question, self.participant).allowed)
