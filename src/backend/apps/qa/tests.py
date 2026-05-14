from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.qa.models import (
    Question,
    QuestionEditEvent,
    QuestionEditProposal,
    QuestionFavorite,
    QuestionRevision,
    Solution,
    SolutionEdits,
    Comment,
    Tag,
    Vote,
)
from apps.qa.serializers import (
    MAX_QUESTION_TAGS,
    QuestionCreateResponseSerializer,
    QuestionGetSerializer,
    QuestionListSerializer,
    QuestionUpdateCreateSerializer,
    SolutionCreateResponseSerializer,
    SolutionListSerializer,
    CommentCreateResponseSerializer,
    CommentDetailSerializer,
    CommentListSerializer,
    TagSerializer,
)
from apps.qa.services.question_edit_service import QuestionChangePayload, QuestionEditService
from apps.qa.services.question_expert_invitation_service import QuestionExpertInvitationService
from apps.qa.services.question_favorite_service import QuestionFavoriteService
from apps.qa.services.question_protection_service import QuestionProtectionService
from apps.qa.services.solution_edits_service import SolutionEditService
from apps.qa.services.solution_service import BEST_SOLUTION_REPUTATION_AWARD, SolutionService
from apps.qa.services.vote_service import VoteService
from apps.user.models import CustomUser, ReputationLevelThreshold, ReputationPolicyConfig, ReputationTransaction
from apps.user.services.reputation_service import ReputationService


class QuestionFavoriteModelTests(APITestCase):
    def setUp(self):
        self.author = CustomUser.objects.create_user(
            user_email='favorite-author@example.com',
            user_name='favorite-author',
            password='password',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='favorite-viewer@example.com',
            user_name='favorite-viewer',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.author,
            question_title='Favorite persistence question',
            question_body='Need duplicate-safe favorite rows.',
        )

    def test_duplicate_user_question_pair_is_rejected(self):
        QuestionFavorite.objects.create(user=self.viewer, question=self.question)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                QuestionFavorite.objects.create(user=self.viewer, question=self.question)

        self.assertEqual(QuestionFavorite.objects.filter(user=self.viewer, question=self.question).count(), 1)

    def test_user_cascade_removes_favorites(self):
        QuestionFavorite.objects.create(user=self.viewer, question=self.question)

        self.viewer.delete()

        self.assertFalse(QuestionFavorite.objects.filter(question=self.question).exists())

    def test_question_cascade_removes_favorites(self):
        QuestionFavorite.objects.create(user=self.viewer, question=self.question)

        self.question.delete()

        self.assertFalse(QuestionFavorite.objects.filter(user=self.viewer).exists())


class QuestionFavoriteServiceTests(APITestCase):
    def setUp(self):
        self.author = CustomUser.objects.create_user(
            user_email='favorite-service-author@example.com',
            user_name='favorite-service-author',
            password='password',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='favorite-service-viewer@example.com',
            user_name='favorite-service-viewer',
            password='password',
        )
        self.other_viewer = CustomUser.objects.create_user(
            user_email='favorite-service-other@example.com',
            user_name='favorite-service-other',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.author,
            question_title='Favorite service question',
            question_body='Need idempotent service operations.',
        )
        self.other_question = Question.objects.create(
            user=self.author,
            question_title='Unfavorited service question',
            question_body='Need zero-state annotation coverage.',
        )

    def test_add_favorite_is_idempotent_and_returns_server_truth(self):
        first_favorite, first_created = QuestionFavoriteService.add_favorite(self.viewer, self.question)
        second_favorite, second_created = QuestionFavoriteService.add_favorite(self.viewer, self.question)

        self.assertTrue(first_created)
        self.assertFalse(second_created)
        self.assertEqual(first_favorite.pk, second_favorite.pk)
        self.assertEqual(QuestionFavorite.objects.filter(user=self.viewer, question=self.question).count(), 1)

    def test_remove_favorite_is_idempotent(self):
        QuestionFavoriteService.add_favorite(self.viewer, self.question)

        first_deleted = QuestionFavoriteService.remove_favorite(self.viewer, self.question)
        second_deleted = QuestionFavoriteService.remove_favorite(self.viewer, self.question)

        self.assertEqual(first_deleted, 1)
        self.assertEqual(second_deleted, 0)
        self.assertFalse(QuestionFavorite.objects.filter(user=self.viewer, question=self.question).exists())

    def test_annotate_favorites_returns_public_count_and_authenticated_viewer_state(self):
        QuestionFavoriteService.add_favorite(self.viewer, self.question)
        QuestionFavoriteService.add_favorite(self.other_viewer, self.question)

        questions = {
            question.pk: question
            for question in QuestionFavoriteService.annotate_favorites(
                Question.objects.filter(pk__in=[self.question.pk, self.other_question.pk]).order_by('question_title'),
                user=self.viewer,
            )
        }

        self.assertEqual(questions[self.question.pk].favorites_count, 2)
        self.assertTrue(questions[self.question.pk].is_favorited)
        self.assertEqual(questions[self.other_question.pk].favorites_count, 0)
        self.assertFalse(questions[self.other_question.pk].is_favorited)

    def test_annotate_favorites_defaults_anonymous_state_to_false(self):
        QuestionFavoriteService.add_favorite(self.viewer, self.question)

        annotated_question = QuestionFavoriteService.annotate_favorites(
            Question.objects.filter(pk=self.question.pk),
            user=AnonymousUser(),
        ).get()

        self.assertEqual(annotated_question.favorites_count, 1)
        self.assertFalse(annotated_question.is_favorited)

    def test_get_favorite_state_uses_annotations_or_database_truth(self):
        QuestionFavoriteService.add_favorite(self.viewer, self.question)
        annotated_question = QuestionFavoriteService.annotate_favorites(
            Question.objects.filter(pk=self.question.pk),
            user=self.viewer,
        ).get()

        annotated_state = QuestionFavoriteService.get_favorite_state(annotated_question, self.viewer)
        direct_state = QuestionFavoriteService.get_favorite_state(self.question, self.viewer)
        anonymous_state = QuestionFavoriteService.get_favorite_state(self.question, None)

        self.assertEqual(annotated_state, {'favorites_count': 1, 'is_favorited': True})
        self.assertEqual(direct_state, {'favorites_count': 1, 'is_favorited': True})
        self.assertEqual(anonymous_state, {'favorites_count': 1, 'is_favorited': False})


class QuestionProtectionServiceTests(APITestCase):
    def setUp(self):
        self.newcomer_author = CustomUser.objects.create_user(
            user_email='newcomer-author@example.com',
            user_name='newcomer-author',
            password='password',
        )
        self.participant_author = CustomUser.objects.create_user(
            user_email='participant-author@example.com',
            user_name='participant-author',
            password='password',
        )
        self.participant_author.user_reputation_score = 30
        self.participant_author.save(update_fields=['user_reputation_score'])
        self.expert_author = CustomUser.objects.create_user(
            user_email='expert-author@example.com',
            user_name='expert-author',
            password='password',
        )
        self.expert_author.user_reputation_score = 100
        self.expert_author.save(update_fields=['user_reputation_score'])
        self.master_author = CustomUser.objects.create_user(
            user_email='master-author@example.com',
            user_name='master-author',
            password='password',
        )
        self.master_author.user_reputation_score = 300
        self.master_author.save(update_fields=['user_reputation_score'])

        self.newcomer_viewer = CustomUser.objects.create_user(
            user_email='newcomer-viewer@example.com',
            user_name='newcomer-viewer',
            password='password',
        )
        self.participant_viewer = CustomUser.objects.create_user(
            user_email='participant-viewer@example.com',
            user_name='participant-viewer',
            password='password',
        )
        self.participant_viewer.user_reputation_score = 30
        self.participant_viewer.save(update_fields=['user_reputation_score'])
        self.expert_viewer = CustomUser.objects.create_user(
            user_email='expert-viewer@example.com',
            user_name='expert-viewer',
            password='password',
        )
        self.expert_viewer.user_reputation_score = 100
        self.expert_viewer.save(update_fields=['user_reputation_score'])
        self.master_viewer = CustomUser.objects.create_user(
            user_email='master-viewer@example.com',
            user_name='master-viewer',
            password='password',
        )
        self.master_viewer.user_reputation_score = 300
        self.master_viewer.save(update_fields=['user_reputation_score'])

    def create_question(self, *, author, created_at=None):
        question = Question.objects.create(
            user=author,
            question_title='Protected policy question',
            question_body='Need to evaluate protected newcomer rules.',
        )
        if created_at is not None:
            Question.objects.filter(pk=question.pk).update(question_created_at=created_at)
            question.refresh_from_db()
        return question

    def test_newcomer_question_is_protected_before_window_boundary(self):
        created_at = timezone.now() - timedelta(hours=11, minutes=59, seconds=59)
        question = self.create_question(author=self.newcomer_author, created_at=created_at)

        state = QuestionProtectionService.get_protection_state(question)

        self.assertTrue(state.is_protected)
        self.assertEqual(state.author_level, CustomUser.ReputationLevel.NEWCOMER)
        self.assertEqual(state.author_level_label, CustomUser.ReputationLevel.NEWCOMER.label)
        self.assertEqual(state.reason_code, QuestionProtectionService.PROTECTED_NEWCOMER)
        self.assertEqual(state.progress.points_to_next_level, 30)
        self.assertEqual(state.progress.next_level, CustomUser.ReputationLevel.PARTICIPANT)
        self.assertIsNotNone(state.protected_until)

    def test_newcomer_question_is_not_protected_at_window_boundary(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=12)
        created_at = timezone.now() - timedelta(hours=12)
        question = self.create_question(author=self.newcomer_author, created_at=created_at)

        state = QuestionProtectionService.get_protection_state(question)

        self.assertFalse(state.is_protected)
        self.assertEqual(state.reason_code, QuestionProtectionService.NOT_PROTECTED)
        self.assertIsNone(state.protected_until)

    def test_newcomer_question_is_not_protected_after_window_boundary(self):
        created_at = timezone.now() - timedelta(hours=12, seconds=1)
        question = self.create_question(author=self.newcomer_author, created_at=created_at)

        state = QuestionProtectionService.get_protection_state(question)

        self.assertFalse(state.is_protected)
        self.assertEqual(state.reason_code, QuestionProtectionService.NOT_PROTECTED)
        self.assertIsNone(state.protected_until)

    def test_newcomer_question_uses_updated_protected_window_config(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=24)
        created_at = timezone.now() - timedelta(hours=23, minutes=59, seconds=59)
        question = self.create_question(author=self.newcomer_author, created_at=created_at)

        state = QuestionProtectionService.get_protection_state(question)

        self.assertTrue(state.is_protected)
        self.assertEqual(state.reason_code, QuestionProtectionService.PROTECTED_NEWCOMER)
        self.assertIsNotNone(state.protected_until)

    def test_non_newcomer_authors_do_not_trigger_protection(self):
        for author in [self.participant_author, self.expert_author, self.master_author]:
            with self.subTest(author=author.user_name):
                question = self.create_question(author=author, created_at=timezone.now() - timedelta(hours=1))
                state = QuestionProtectionService.get_protection_state(question)

                self.assertFalse(state.is_protected)
                self.assertEqual(state.reason_code, QuestionProtectionService.NOT_PROTECTED)
                self.assertEqual(state.author_level, ReputationService.get_progress(author)['level'])
                self.assertEqual(state.author_level_label, ReputationService.resolve_level(user=author).label)

    def test_question_without_author_is_not_protected(self):
        question = self.create_question(author=None, created_at=timezone.now() - timedelta(hours=1))

        state = QuestionProtectionService.get_protection_state(question)

        self.assertFalse(state.is_protected)
        self.assertEqual(state.reason_code, QuestionProtectionService.PROTECTED_MISSING_AUTHOR)
        self.assertIsNone(state.author_level)
        self.assertIsNone(state.author_level_label)
        self.assertIsNone(state.protected_until)

    def test_answer_eligibility_blocks_anonymous_newcomer_and_participant_viewers_during_window(self):
        question = self.create_question(author=self.newcomer_author, created_at=timezone.now() - timedelta(hours=1))

        anonymous_decision = QuestionProtectionService.get_answer_eligibility(question, None)
        newcomer_decision = QuestionProtectionService.get_answer_eligibility(question, self.newcomer_viewer)
        participant_decision = QuestionProtectionService.get_answer_eligibility(question, self.participant_viewer)

        self.assertFalse(anonymous_decision.allowed)
        self.assertEqual(anonymous_decision.reason_code, QuestionProtectionService.ANSWER_BLOCKED_ANONYMOUS)
        self.assertEqual(anonymous_decision.required_level, CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(anonymous_decision.required_level_label, CustomUser.ReputationLevel.EXPERT.label)
        self.assertIsNone(anonymous_decision.viewer_level)
        self.assertIsNone(anonymous_decision.viewer_level_label)
        self.assertIsNotNone(anonymous_decision.protected_until)

        self.assertFalse(newcomer_decision.allowed)
        self.assertEqual(newcomer_decision.reason_code, QuestionProtectionService.ANSWER_BLOCKED_INSUFFICIENT_LEVEL)
        self.assertEqual(newcomer_decision.viewer_level, CustomUser.ReputationLevel.NEWCOMER)
        self.assertEqual(newcomer_decision.viewer_level_label, CustomUser.ReputationLevel.NEWCOMER.label)
        self.assertEqual(newcomer_decision.points_to_next_level, 30)
        self.assertEqual(newcomer_decision.next_level, CustomUser.ReputationLevel.PARTICIPANT)

        self.assertFalse(participant_decision.allowed)
        self.assertEqual(participant_decision.reason_code, QuestionProtectionService.ANSWER_BLOCKED_INSUFFICIENT_LEVEL)
        self.assertEqual(participant_decision.viewer_level, CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(participant_decision.viewer_level_label, CustomUser.ReputationLevel.PARTICIPANT.label)
        self.assertEqual(participant_decision.points_to_next_level, 70)
        self.assertEqual(participant_decision.next_level, CustomUser.ReputationLevel.EXPERT)

    def test_answer_eligibility_allows_expert_and_master_viewers_during_window(self):
        question = self.create_question(author=self.newcomer_author, created_at=timezone.now() - timedelta(hours=1))

        expert_decision = QuestionProtectionService.get_answer_eligibility(question, self.expert_viewer)
        master_decision = QuestionProtectionService.get_answer_eligibility(question, self.master_viewer)

        self.assertTrue(expert_decision.allowed)
        self.assertEqual(expert_decision.reason_code, QuestionProtectionService.ANSWER_ALLOWED)
        self.assertEqual(expert_decision.viewer_level, CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(expert_decision.viewer_level_label, CustomUser.ReputationLevel.EXPERT.label)
        self.assertEqual(expert_decision.required_level, CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(expert_decision.points_to_next_level, 200)

        self.assertTrue(master_decision.allowed)
        self.assertEqual(master_decision.reason_code, QuestionProtectionService.ANSWER_ALLOWED)
        self.assertEqual(master_decision.viewer_level, CustomUser.ReputationLevel.MASTER)
        self.assertEqual(master_decision.viewer_level_label, CustomUser.ReputationLevel.MASTER.label)
        self.assertEqual(master_decision.points_to_next_level, 0)
        self.assertIsNone(master_decision.next_level)

    def test_answer_eligibility_returns_allowed_for_unprotected_question(self):
        question = self.create_question(author=self.participant_author, created_at=timezone.now() - timedelta(hours=1))

        decision = QuestionProtectionService.get_answer_eligibility(question, self.newcomer_viewer)

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.reason_code, QuestionProtectionService.ANSWER_ALLOWED)
        self.assertEqual(decision.required_level, CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(decision.required_level_label, CustomUser.ReputationLevel.EXPERT.label)
        self.assertIsNone(decision.viewer_level)
        self.assertIsNone(decision.protected_until)

    def test_question_downvote_eligibility_blocks_all_viewers_during_window(self):
        question = self.create_question(author=self.newcomer_author, created_at=timezone.now() - timedelta(hours=1))

        anonymous_decision = QuestionProtectionService.get_question_downvote_eligibility(question, None)
        participant_decision = QuestionProtectionService.get_question_downvote_eligibility(question, self.participant_viewer)
        expert_decision = QuestionProtectionService.get_question_downvote_eligibility(question, self.expert_viewer)

        self.assertFalse(anonymous_decision.allowed)
        self.assertEqual(anonymous_decision.reason_code, QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED)
        self.assertIsNone(anonymous_decision.required_level)
        self.assertIsNone(anonymous_decision.required_level_label)
        self.assertIsNone(anonymous_decision.viewer_level)

        self.assertFalse(participant_decision.allowed)
        self.assertEqual(participant_decision.reason_code, QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED)
        self.assertEqual(participant_decision.viewer_level, CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(participant_decision.viewer_level_label, CustomUser.ReputationLevel.PARTICIPANT.label)
        self.assertEqual(participant_decision.points_to_next_level, 70)

        self.assertFalse(expert_decision.allowed)
        self.assertEqual(expert_decision.reason_code, QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED)
        self.assertEqual(expert_decision.viewer_level, CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(expert_decision.viewer_level_label, CustomUser.ReputationLevel.EXPERT.label)

    def test_question_downvote_eligibility_returns_allowed_after_window(self):
        question = self.create_question(author=self.newcomer_author, created_at=timezone.now() - timedelta(hours=12, seconds=1))

        decision = QuestionProtectionService.get_question_downvote_eligibility(question, self.participant_viewer)

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.reason_code, QuestionProtectionService.DOWNVOTE_ALLOWED)
        self.assertIsNone(decision.required_level)
        self.assertIsNone(decision.required_level_label)
        self.assertIsNone(decision.viewer_level)
        self.assertIsNone(decision.protected_until)


class QuestionExpertInvitationServiceTests(APITestCase):
    def setUp(self):
        self.author = CustomUser.objects.create_user(
            user_email='invite-author@example.com',
            user_name='invite-author',
            password='password',
        )
        self.expert = CustomUser.objects.create_user(
            user_email='invite-expert@example.com',
            user_name='AlphaExpert',
            password='password',
        )
        self.expert.user_reputation_score = 150
        self.expert.save(update_fields=['user_reputation_score'])
        self.master = CustomUser.objects.create_user(
            user_email='invite-master@example.com',
            user_name='BetaMaster',
            password='password',
        )
        self.master.user_reputation_score = 350
        self.master.save(update_fields=['user_reputation_score'])
        self.participant = CustomUser.objects.create_user(
            user_email='invite-participant@example.com',
            user_name='CandidateParticipant',
            password='password',
        )
        self.participant.user_reputation_score = 30
        self.participant.save(update_fields=['user_reputation_score'])
        self.inactive_expert = CustomUser.objects.create_user(
            user_email='inactive-expert@example.com',
            user_name='InactiveExpert',
            password='password',
            is_active=False,
        )
        self.inactive_expert.user_reputation_score = 300
        self.inactive_expert.save(update_fields=['user_reputation_score'])
        self.question = self.create_question(created_at=timezone.now() - timedelta(hours=1))

    def create_question(self, *, author=None, created_at=None):
        question = Question.objects.create(
            user=author or self.author,
            question_title='Protected invitation question',
            question_body='Need experts to review this newcomer question.',
        )
        if created_at is not None:
            Question.objects.filter(pk=question.pk).update(question_created_at=created_at)
            question.refresh_from_db()
        return question

    def assert_validation_code(self, exc, code):
        self.assertEqual(exc.exception.detail['code'], code)

    def test_candidate_discovery_filters_searches_sorts_and_reports_slots(self):
        already_invited = CustomUser.objects.create_user(
            user_email='already-invited@example.com',
            user_name='AlreadyExpert',
            password='password',
        )
        already_invited.user_reputation_score = 250
        already_invited.save(update_fields=['user_reputation_score'])
        Notification.objects.create(
            recipient=already_invited,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Existing invitation',
            message='Existing invitation.',
            source_question=self.question,
            dedupe_key=QuestionExpertInvitationService.build_dedupe_key(self.question.pk, already_invited.pk),
        )

        result = QuestionExpertInvitationService.get_eligible_experts(self.question, search='expert')

        self.assertEqual(result.slot_state['used'], 1)
        self.assertEqual(result.slot_state['remaining'], 4)
        self.assertEqual(result.slot_state['reason_code'], QuestionExpertInvitationService.SLOTS_AVAILABLE)
        self.assertEqual([candidate['user_id'] for candidate in result.candidates], [str(self.expert.pk)])
        self.assertEqual(result.candidates[0]['user_name'], 'AlphaExpert')
        self.assertEqual(result.candidates[0]['reputation_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertNotIn('user_email', result.candidates[0])

    def test_candidate_discovery_returns_empty_for_no_search_match(self):
        result = QuestionExpertInvitationService.get_eligible_experts(self.question, search='no-match')

        self.assertEqual(result.candidates, [])
        self.assertEqual(result.slot_state['remaining'], 5)

    def test_create_invitations_persists_notifications_with_dedupe_payload_and_custom_ttl(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=6)
        question = self.create_question(created_at=timezone.now() - timedelta(hours=1))

        result = QuestionExpertInvitationService.create_invitations(
            question=question,
            requester=self.author,
            recipient_ids=[self.expert.pk, self.master.pk],
        )

        self.assertEqual(result.slot_state['used'], 2)
        self.assertEqual(result.slot_state['remaining'], 3)
        self.assertEqual(len(result.invitations), 2)
        notifications = Notification.objects.filter(source_question=question).order_by('recipient__user_name')
        self.assertEqual(notifications.count(), 2)
        first = notifications[0]
        self.assertEqual(first.notification_type, Notification.NotificationType.EXPERT_INVITATION)
        self.assertEqual(
            first.dedupe_key,
            QuestionExpertInvitationService.build_dedupe_key(question.pk, first.recipient_id),
        )
        self.assertEqual(first.expires_at, question.question_created_at + timedelta(hours=12))
        self.assertEqual(first.payload['question_id'], str(question.pk))
        self.assertEqual(first.payload['author_id'], str(self.author.pk))
        self.assertNotIn('recipient_email', first.payload)

    def test_exactly_five_invitations_succeeds_and_sixth_fails(self):
        recipients = [self.expert, self.master]
        for index in range(3):
            user = CustomUser.objects.create_user(
                user_email=f'extra-expert-{index}@example.com',
                user_name=f'ExtraExpert{index}',
                password='password',
            )
            user.user_reputation_score = 100 + index
            user.save(update_fields=['user_reputation_score'])
            recipients.append(user)

        result = QuestionExpertInvitationService.create_invitations(
            question=self.question,
            requester=self.author,
            recipient_ids=[user.pk for user in recipients],
        )
        self.assertEqual(len(result.invitations), 5)

        sixth = CustomUser.objects.create_user(
            user_email='sixth-expert@example.com',
            user_name='SixthExpert',
            password='password',
        )
        sixth.user_reputation_score = 100
        sixth.save(update_fields=['user_reputation_score'])
        with self.assertRaises(ValidationError) as exc:
            QuestionExpertInvitationService.create_invitations(
                question=self.question,
                requester=self.author,
                recipient_ids=[sixth.pk],
            )
        self.assert_validation_code(exc, QuestionExpertInvitationService.MAX_INVITES_EXCEEDED)
        self.assertEqual(Notification.objects.filter(source_question=self.question).count(), 5)

    def test_duplicate_request_recipient_ids_are_rejected_without_writes(self):
        with self.assertRaises(ValidationError) as exc:
            QuestionExpertInvitationService.create_invitations(
                question=self.question,
                requester=self.author,
                recipient_ids=[self.expert.pk, self.expert.pk],
            )

        self.assert_validation_code(exc, QuestionExpertInvitationService.DUPLICATE_RECIPIENT)
        self.assertFalse(Notification.objects.filter(source_question=self.question).exists())

    def test_invalid_mixed_recipient_input_rolls_back_without_partial_notifications(self):
        with self.assertRaises(ValidationError) as exc:
            QuestionExpertInvitationService.create_invitations(
                question=self.question,
                requester=self.author,
                recipient_ids=[self.expert.pk, self.participant.pk],
            )

        self.assert_validation_code(exc, QuestionExpertInvitationService.RECIPIENT_NOT_ELIGIBLE)
        self.assertFalse(Notification.objects.filter(source_question=self.question).exists())

    def test_empty_recipient_list_and_missing_recipient_are_rejected(self):
        with self.assertRaises(ValidationError) as empty_exc:
            QuestionExpertInvitationService.create_invitations(
                question=self.question,
                requester=self.author,
                recipient_ids=[],
            )
        self.assert_validation_code(empty_exc, QuestionExpertInvitationService.EMPTY_RECIPIENTS)

        with self.assertRaises(ValidationError) as missing_exc:
            QuestionExpertInvitationService.create_invitations(
                question=self.question,
                requester=self.author,
                recipient_ids=[self.expert.pk, '00000000-0000-0000-0000-000000000000'],
            )
        self.assert_validation_code(missing_exc, QuestionExpertInvitationService.RECIPIENT_NOT_ELIGIBLE)
        self.assertFalse(Notification.objects.filter(source_question=self.question).exists())

    def test_non_author_and_inactive_protected_window_are_rejected(self):
        with self.assertRaises(ValidationError) as non_author_exc:
            QuestionExpertInvitationService.create_invitations(
                question=self.question,
                requester=self.expert,
                recipient_ids=[self.master.pk],
            )
        self.assert_validation_code(non_author_exc, QuestionExpertInvitationService.NOT_QUESTION_AUTHOR)

        expired_question = self.create_question(created_at=timezone.now() - timedelta(hours=13))
        with self.assertRaises(ValidationError) as inactive_exc:
            QuestionExpertInvitationService.create_invitations(
                question=expired_question,
                requester=self.author,
                recipient_ids=[self.expert.pk],
            )
        self.assert_validation_code(inactive_exc, QuestionExpertInvitationService.QUESTION_NOT_PROTECTED)
        self.assertFalse(Notification.objects.filter(source_question__in=[self.question, expired_question]).exists())

    def test_already_invited_recipient_is_rejected_without_new_writes(self):
        QuestionExpertInvitationService.create_invitations(
            question=self.question,
            requester=self.author,
            recipient_ids=[self.expert.pk],
        )

        with self.assertRaises(ValidationError) as exc:
            QuestionExpertInvitationService.create_invitations(
                question=self.question,
                requester=self.author,
                recipient_ids=[self.expert.pk],
            )

        self.assert_validation_code(exc, QuestionExpertInvitationService.RECIPIENT_ALREADY_INVITED)
        self.assertEqual(Notification.objects.filter(source_question=self.question).count(), 1)

    def test_notification_service_failure_rolls_back_all_invitation_writes(self):
        with patch(
            'apps.qa.services.question_expert_invitation_service.NotificationService.create_notification',
            side_effect=RuntimeError('notification write failed'),
        ):
            with self.assertRaisesMessage(RuntimeError, 'notification write failed'):
                QuestionExpertInvitationService.create_invitations(
                    question=self.question,
                    requester=self.author,
                    recipient_ids=[self.expert.pk, self.master.pk],
                )

        self.assertFalse(Notification.objects.filter(source_question=self.question).exists())


class QuestionTagModelTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='tag-author@example.com',
            user_name='tag-author',
            password='password',
        )

    def test_question_can_be_created_without_tags(self):
        question = Question.objects.create(
            user=self.user,
            question_title='Question without tags',
            question_body='Existing create flows should not require tags.',
        )

        self.assertEqual(question.tags.count(), 0)

    def test_duplicate_tag_name_raises_integrity_error(self):
        Tag.objects.create(name='django')

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Tag.objects.create(name='django')


class QuestionTagSerializerTests(APITestCase):
    def valid_payload(self, tags_marker=None):
        payload = {
            'question_title': 'How to validate tags?',
            'question_body': 'I need a normalized tag contract.',
        }
        if tags_marker is not None:
            payload['tags'] = tags_marker
        return payload

    def assert_tags_error(self, tags):
        serializer = QuestionUpdateCreateSerializer(data=self.valid_payload(tags))

        self.assertFalse(serializer.is_valid())
        self.assertIn('tags', serializer.errors)

    def test_tags_are_normalized_and_deduplicated_in_first_seen_order(self):
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload([' Django ', 'django', 'DRF3', 'vue-js'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['tags'], ['django', 'drf3', 'vue-js'])

    def test_tags_can_be_omitted_for_backwards_compatibility(self):
        serializer = QuestionUpdateCreateSerializer(data=self.valid_payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('tags', serializer.validated_data)

    def test_exactly_five_unique_tags_are_valid(self):
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload(['django', 'drf', 'mysql', 'vue', 'docker'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(len(serializer.validated_data['tags']), MAX_QUESTION_TAGS)

    def test_duplicate_tags_after_normalization_do_not_count_toward_limit(self):
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload(['Django', 'django', ' DRF ', 'drf', 'mysql', 'vue', 'docker'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['tags'], ['django', 'drf', 'mysql', 'vue', 'docker'])

    def test_saving_question_with_validated_tags_persists_normalized_tags_in_s02(self):
        user = CustomUser.objects.create_user(
            user_email='serializer-author@example.com',
            user_name='serializer-author',
            password='password',
        )
        serializer = QuestionUpdateCreateSerializer(
            data=self.valid_payload(['Django', 'DRF'])
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        question = serializer.save(user=user)

        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django', 'drf'})
        self.assertEqual(
            dict(Tag.objects.order_by('name').values_list('name', 'questions_count')),
            {'django': 1, 'drf': 1},
        )

    def test_rejects_more_than_five_unique_tags(self):
        self.assert_tags_error(['django', 'drf', 'mysql', 'vue', 'docker', 'python'])

    def test_rejects_non_list_tags_payload(self):
        self.assert_tags_error('django')

    def test_rejects_non_string_tag_values(self):
        self.assert_tags_error([123])

    def test_rejects_empty_or_whitespace_only_tags(self):
        self.assert_tags_error(['   '])

    def test_rejects_invalid_tag_characters(self):
        invalid_tag_values = ['python_api', 'c++', 'django rest', 'джанго']

        for invalid_tag in invalid_tag_values:
            with self.subTest(invalid_tag=invalid_tag):
                self.assert_tags_error([invalid_tag])


class QuestionTagResponseSerializerTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='response-author@example.com',
            user_name='response-author',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.user,
            question_title='How should tags be represented?',
            question_body='Question responses should expose public tag objects.',
        )

    def test_tag_serializer_exposes_only_public_contract_fields(self):
        tag = Tag.objects.create(name='django', questions_count=1)

        self.assertEqual(set(TagSerializer(tag).data.keys()), {'name', 'questions_count'})
        self.assertEqual(TagSerializer(tag).data, {'name': 'django', 'questions_count': 1})

    def test_untagged_question_serializers_emit_empty_tag_lists(self):
        expected_empty_tags = []

        self.assertEqual(QuestionListSerializer(self.question).data['tags'], expected_empty_tags)
        self.assertEqual(QuestionGetSerializer(self.question).data['tags'], expected_empty_tags)
        self.assertEqual(QuestionCreateResponseSerializer(self.question).data['tags'], expected_empty_tags)

    def test_tagged_question_serializers_emit_nested_tag_objects(self):
        tag = Tag.objects.create(name='django', questions_count=1)
        self.question.tags.add(tag)
        expected_tags = [{'name': 'django', 'questions_count': 1}]

        self.assertEqual(QuestionListSerializer(self.question).data['tags'], expected_tags)
        self.assertEqual(QuestionGetSerializer(self.question).data['tags'], expected_tags)
        self.assertEqual(QuestionCreateResponseSerializer(self.question).data['tags'], expected_tags)

    def test_question_detail_response_emits_nested_tags_without_raw_tag_ids(self):
        tag = Tag.objects.create(name='django', questions_count=1)
        self.question.tags.add(tag)

        response = self.client.get(f'/question/{self.question.question_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['tags'], [{'name': 'django', 'questions_count': 1}])
        self.assertEqual(set(response.data['tags'][0].keys()), {'name', 'questions_count'})
        self.assertNotEqual(response.data['tags'], [tag.pk])
        self.assertNotIn('id', response.data['tags'][0])
        self.assertNotIn('tag_id', response.data['tags'][0])

    def test_untagged_question_detail_response_emits_empty_tags(self):
        response = self.client.get(f'/question/{self.question.question_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('tags', response.data)
        self.assertEqual(response.data['tags'], [])

    def test_question_list_response_emits_nested_tags_and_empty_lists(self):
        tag = Tag.objects.create(name='django', questions_count=1)
        self.question.tags.add(tag)
        untagged_question = Question.objects.create(
            user=self.user,
            question_title='Question without tags in list',
            question_body='Old untagged questions should still serialize safely.',
        )

        response = self.client.get('/question/', {'ordering': 'question_created_at'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response_by_id = {item['question_id']: item for item in response.data['results']}
        self.assertEqual(
            response_by_id[str(self.question.question_id)]['tags'],
            [{'name': 'django', 'questions_count': 1}],
        )
        self.assertEqual(response_by_id[str(untagged_question.question_id)]['tags'], [])

    def test_author_reputation_contract_is_available_for_rank_badges(self):
        self.user.user_reputation_score = 300
        self.user.save(update_fields=['user_reputation_score'])
        solution = Solution.objects.create(
            user=self.user,
            question=self.question,
            solution_body='Solution with a master author rank.',
        )
        question_content_type = ContentType.objects.get_for_model(Question)
        comment = Comment.objects.create(
            user=self.user,
            content_type=question_content_type,
            object_id=self.question.pk,
            body='Comment with a master author rank.',
        )
        reply = Comment.objects.create(
            user=self.user,
            content_type=question_content_type,
            object_id=self.question.pk,
            parent=comment,
            body='Reply with a master author rank.',
        )

        payloads = [
            QuestionListSerializer(self.question).data,
            QuestionGetSerializer(self.question).data,
            SolutionListSerializer(solution).data,
            SolutionCreateResponseSerializer(solution).data,
            CommentListSerializer(comment).data,
            CommentCreateResponseSerializer(comment).data,
            CommentDetailSerializer(comment).data,
        ]

        for payload in payloads:
            with self.subTest(serializer=payload):
                self.assertEqual(payload['user_name'], self.user.user_name)
                self.assertEqual(payload['user_reputation_score'], 300)
                self.assertEqual(payload['reputation']['level'], CustomUser.ReputationLevel.MASTER)
                self.assertEqual(payload['reputation']['level_label'], CustomUser.ReputationLevel.MASTER.label)

        detail_payload = CommentDetailSerializer(comment).data
        self.assertEqual(detail_payload['replies'][0]['comment_id'], str(reply.comment_id))
        self.assertEqual(detail_payload['replies'][0]['reputation']['level'], CustomUser.ReputationLevel.MASTER)

    def test_question_serializers_expose_protection_metadata_with_safe_defaults(self):
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()

        list_data = QuestionListSerializer(self.question).data
        detail_data = QuestionGetSerializer(self.question).data

        for payload in [list_data, detail_data]:
            self.assertFalse(payload['is_protected'])
            self.assertEqual(payload['protection_reason_code'], QuestionProtectionService.NOT_PROTECTED)
            self.assertIsNone(payload['protected_until'])
            self.assertTrue(payload['viewer_can_answer'])
            self.assertEqual(payload['viewer_answer_reason_code'], QuestionProtectionService.ANSWER_ALLOWED)
            self.assertEqual(payload['viewer_answer_reason_message'], '')
            self.assertEqual(payload['viewer_answer_required_level'], CustomUser.ReputationLevel.EXPERT)
            self.assertEqual(payload['viewer_answer_required_level_label'], CustomUser.ReputationLevel.EXPERT.label)
            self.assertTrue(payload['viewer_can_downvote'])
            self.assertEqual(payload['viewer_downvote_reason_code'], QuestionProtectionService.DOWNVOTE_ALLOWED)
            self.assertEqual(payload['viewer_downvote_reason_message'], '')

    def test_question_detail_response_exposes_protected_metadata_for_blocked_viewer(self):
        protected_author = CustomUser.objects.create_user(
            user_email='protected-author@example.com',
            user_name='protected-author',
            password='password',
        )
        participant_viewer = CustomUser.objects.create_user(
            user_email='participant-viewer-response@example.com',
            user_name='participant-viewer-response',
            password='password',
        )
        participant_viewer.user_reputation_score = 30
        participant_viewer.save(update_fields=['user_reputation_score'])

        protected_question = Question.objects.create(
            user=protected_author,
            question_title='Protected newcomer question',
            question_body='Need safe metadata for the frontend.',
        )

        self.client.force_authenticate(participant_viewer)
        response = self.client.get(f'/question/{protected_question.question_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_protected'])
        self.assertEqual(response.data['protection_reason_code'], QuestionProtectionService.PROTECTED_NEWCOMER)
        self.assertEqual(response.data['author_level'], CustomUser.ReputationLevel.NEWCOMER)
        self.assertFalse(response.data['viewer_can_answer'])
        self.assertEqual(
            response.data['viewer_answer_reason_code'],
            QuestionProtectionService.ANSWER_BLOCKED_INSUFFICIENT_LEVEL,
        )
        self.assertEqual(response.data['viewer_answer_required_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(response.data['viewer_level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertFalse(response.data['viewer_can_downvote'])
        self.assertEqual(
            response.data['viewer_downvote_reason_code'],
            QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED,
        )
        self.assertTrue(response.data['viewer_answer_reason_message'])
        self.assertTrue(response.data['viewer_downvote_reason_message'])
        self.assertIsNotNone(response.data['protected_until'])

    def test_question_detail_response_uses_admin_configured_window_in_reason_messages(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=24)
        protected_author = CustomUser.objects.create_user(
            user_email='protected-config-author@example.com',
            user_name='protected-config-author',
            password='password',
        )
        participant_viewer = CustomUser.objects.create_user(
            user_email='participant-config-viewer@example.com',
            user_name='participant-config-viewer',
            password='password',
            user_reputation_score=30,
        )
        protected_question = Question.objects.create(
            user=protected_author,
            question_title='Protected newcomer question with configured window',
            question_body='Frontend metadata copy should follow the policy duration.',
        )
        Question.objects.filter(pk=protected_question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        protected_question.refresh_from_db()

        self.client.force_authenticate(participant_viewer)
        response = self.client.get(f'/question/{protected_question.question_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_protected'])
        self.assertIn('24 часа', response.data['viewer_answer_reason_message'])
        self.assertIn('24 часа', response.data['viewer_downvote_reason_message'])


class TagAutocompleteApiTests(APITestCase):
    def setUp(self):
        self.django_tag = Tag.objects.create(name='django', questions_count=5)
        self.django_rest_tag = Tag.objects.create(name='django-rest', questions_count=2)
        self.vue_tag = Tag.objects.create(name='vue', questions_count=7)

    def test_tag_autocomplete_is_public_and_returns_matching_tag_suggestions(self):
        response = self.client.get('/question/tags/autocomplete/', {'q': 'djan'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [
            {'name': 'django', 'questions_count': 5},
            {'name': 'django-rest', 'questions_count': 2},
        ])

    def test_tag_autocomplete_requires_two_character_query(self):
        response = self.client.get('/question/tags/autocomplete/', {'q': 'd'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_tag_autocomplete_limits_to_top_ten_ranked_results(self):
        for index in range(12):
            Tag.objects.create(name=f'py-{index}', questions_count=index)

        response = self.client.get('/question/tags/autocomplete/', {'q': 'py'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 10)
        counts = [item['questions_count'] for item in response.data]
        self.assertEqual(counts, sorted(counts, reverse=True))


class QuestionTagApiTests(APITestCase):
    def setUp(self):
        self.author = CustomUser.objects.create_user(
            user_email='question-author@example.com',
            user_name='question-author',
            password='password',
        )
        self.question_payload = {
            'question_title': 'How do tags work?',
            'question_body': 'Need to validate and persist tags.',
        }

    def authenticate(self):
        self.client.force_authenticate(self.author)

    def test_create_question_without_tags_keeps_empty_tag_list(self):
        self.authenticate()

        response = self.client.post('/question/', self.question_payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['tags'], [])
        question = Question.objects.get(question_id=response.data['question_id'])
        self.assertEqual(question.tags.count(), 0)
        self.assertEqual(Tag.objects.count(), 0)

    def test_create_question_with_tags_returns_nested_tag_objects_and_counts(self):
        self.authenticate()

        response = self.client.post(
            '/question/',
            {**self.question_payload, 'tags': [' Django ', 'drf']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['tags'], [
            {'name': 'django', 'questions_count': 1},
            {'name': 'drf', 'questions_count': 1},
        ])
        question = Question.objects.get(question_id=response.data['question_id'])
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django', 'drf'})

    def test_create_question_rejects_invalid_tags_without_persisting_question(self):
        self.authenticate()

        response = self.client.post(
            '/question/',
            {**self.question_payload, 'tags': ['bad tag']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Question.objects.count(), 0)
        self.assertEqual(Tag.objects.count(), 0)

    def test_question_retrieval_returns_nested_tags_for_legacy_and_new_data(self):
        tagged_question = Question.objects.create(
            user=self.author,
            question_title='Tagged question',
            question_body='Has tags',
        )
        tag = Tag.objects.create(name='django', questions_count=1)
        tagged_question.tags.add(tag)
        untagged_question = Question.objects.create(
            user=self.author,
            question_title='Legacy question',
            question_body='Still valid without tags',
        )

        tagged_response = self.client.get(f'/question/{tagged_question.question_id}/')
        untagged_response = self.client.get(f'/question/{untagged_question.question_id}/')

        self.assertEqual(tagged_response.status_code, status.HTTP_200_OK)
        self.assertEqual(tagged_response.data['tags'], [{'name': 'django', 'questions_count': 1}])
        self.assertEqual(untagged_response.status_code, status.HTTP_200_OK)
        self.assertEqual(untagged_response.data['tags'], [])

    def test_question_list_orders_and_serializes_nested_tags(self):
        tagged_question = Question.objects.create(
            user=self.author,
            question_title='Tagged question',
            question_body='Has tags',
        )
        tag = Tag.objects.create(name='django', questions_count=1)
        tagged_question.tags.add(tag)
        Question.objects.create(
            user=self.author,
            question_title='Older question',
            question_body='No tags here',
        )

        response = self.client.get('/question/', {'ordering': 'question_created_at'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response_by_title = {item['question_title']: item for item in response.data['results']}
        self.assertEqual(
            response_by_title['Tagged question']['tags'],
            [{'name': 'django', 'questions_count': 1}],
        )
        self.assertEqual(response_by_title['Older question']['tags'], [])


class ReputationVoteServiceTests(APITestCase):
    def setUp(self):
        self.question_author = CustomUser.objects.create_user(
            user_email='question-author-vote@example.com',
            user_name='question-author-vote',
            password='password',
        )
        self.solution_author = CustomUser.objects.create_user(
            user_email='solution-author-vote@example.com',
            user_name='solution-author-vote',
            password='password',
        )
        self.voter = CustomUser.objects.create_user(
            user_email='voter@example.com',
            user_name='voter',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.question_author,
            question_title='Question vote target',
            question_body='Reward question upvotes only when newly introduced.',
        )
        self.solution = Solution.objects.create(
            user=self.solution_author,
            question=self.question,
            solution_body='Solution vote target',
        )

    def _reset_vote_reward_state(self):
        Vote.objects.all().delete()
        ReputationTransaction.objects.all().delete()
        CustomUser.objects.filter(
            pk__in=[self.question_author.pk, self.solution_author.pk]
        ).update(user_reputation_score=0)
        self.question_author.refresh_from_db()
        self.solution_author.refresh_from_db()

    def _vote_target(self, target_type: str):
        if target_type == 'question':
            return self.question, self.question_author, self.question.question_id
        return self.solution, self.solution_author, self.solution.solution_id

    def _seed_existing_vote(self, *, target_type: str, vote_type: str):
        target_object, _, target_id = self._vote_target(target_type)
        Vote.objects.create(
            user=self.voter,
            content_type=VoteService.get_content_type(target_type),
            object_id=target_id,
            vote_type=vote_type,
        )
        return target_object

    def _assert_reward_state(self, *, target_type: str, score: int, tx_count: int, reason: str | None):
        _, author, _ = self._vote_target(target_type)
        author.refresh_from_db()
        self.assertEqual(author.user_reputation_score, score)

        transactions = list(
            ReputationTransaction.objects.filter(user=author).order_by('created_at')
        )
        self.assertEqual(len(transactions), tx_count)
        if reason is None:
            return

        transaction = transactions[-1]
        expected_source, _, _ = self._vote_target(target_type)
        self.assertEqual(transaction.reputation_transaction_reason, reason)
        self.assertEqual(transaction.content_type.model, target_type)
        self.assertEqual(transaction.object_id, expected_source.pk)
        self.assertEqual(transaction.actor_id, self.voter.user_id)

    def test_question_downvote_is_rejected_for_protected_newcomer_question(self):
        protected_question_author = CustomUser.objects.create_user(
            user_email='protected-question-author@example.com',
            user_name='protected-question-author',
            password='password',
        )
        protected_question = Question.objects.create(
            user=protected_question_author,
            question_title='Protected newcomer question',
            question_body='Should reject downvotes during the protected window.',
        )

        with self.assertRaises(PermissionDenied) as context:
            VoteService.cast_vote('question', str(protected_question.question_id), Vote.VoteType.DOWNVOTE, self.voter)

        self.assertEqual(
            str(context.exception.detail['detail']),
            QuestionProtectionService.build_downvote_denied_message(),
        )
        self.assertEqual(str(context.exception.detail['code']), VoteService.PROTECTED_QUESTION_DOWNVOTE_ERROR_CODE)
        self.assertFalse(Vote.objects.filter(object_id=protected_question.question_id).exists())
        protected_question_author.refresh_from_db()
        self.assertEqual(protected_question_author.user_reputation_score, 0)

    def test_question_downvote_is_rejected_for_expert_during_protected_newcomer_window(self):
        protected_question_author = CustomUser.objects.create_user(
            user_email='protected-expert-window-author@example.com',
            user_name='protected-expert-window-author',
            password='password',
        )
        expert_voter = CustomUser.objects.create_user(
            user_email='protected-expert-voter@example.com',
            user_name='protected-expert-voter',
            password='password',
            user_reputation_score=100,
        )
        protected_question = Question.objects.create(
            user=protected_question_author,
            question_title='Protected newcomer question for expert voter',
            question_body='Expert downvotes must stay blocked during the protected window.',
        )

        with self.assertRaises(PermissionDenied) as context:
            VoteService.cast_vote('question', str(protected_question.question_id), Vote.VoteType.DOWNVOTE, expert_voter)

        self.assertEqual(
            str(context.exception.detail['detail']),
            QuestionProtectionService.build_downvote_denied_message(),
        )
        self.assertEqual(str(context.exception.detail['code']), VoteService.PROTECTED_QUESTION_DOWNVOTE_ERROR_CODE)
        self.assertFalse(Vote.objects.filter(object_id=protected_question.question_id).exists())

    def test_question_downvote_error_uses_admin_configured_protected_window(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=24)
        protected_question_author = CustomUser.objects.create_user(
            user_email='protected-config-window-author@example.com',
            user_name='protected-config-window-author',
            password='password',
        )
        protected_question = Question.objects.create(
            user=protected_question_author,
            question_title='Protected newcomer question for configured downvote window',
            question_body='Downvote error copy should follow configured policy duration.',
        )
        Question.objects.filter(pk=protected_question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        protected_question.refresh_from_db()

        decision = QuestionProtectionService.get_question_downvote_eligibility(protected_question, self.voter)
        self.assertFalse(decision.allowed)

        with self.assertRaises(PermissionDenied) as context:
            VoteService.cast_vote('question', str(protected_question.question_id), Vote.VoteType.DOWNVOTE, self.voter)

        self.assertEqual(
            str(context.exception.detail['detail']),
            QuestionProtectionService.build_downvote_denied_message(decision),
        )
        self.assertIn('24 часов', str(context.exception.detail['detail']))
        self.assertEqual(str(context.exception.detail['code']), VoteService.PROTECTED_QUESTION_DOWNVOTE_ERROR_CODE)
        self.assertFalse(Vote.objects.filter(object_id=protected_question.question_id).exists())

    def test_question_upvote_remains_allowed_during_protected_window(self):
        protected_question_author = CustomUser.objects.create_user(
            user_email='protected-question-upvote-author@example.com',
            user_name='protected-question-upvote-author',
            password='password',
        )
        protected_question = Question.objects.create(
            user=protected_question_author,
            question_title='Protected newcomer question for upvote',
            question_body='Question upvotes should remain available during the protected window.',
        )

        vote, created = VoteService.cast_vote(
            'question',
            str(protected_question.question_id),
            Vote.VoteType.UPVOTE,
            self.voter,
        )

        self.assertTrue(created)
        self.assertEqual(vote.vote_type, Vote.VoteType.UPVOTE)
        self.assertEqual(
            VoteService.get_vote_stats('question', str(protected_question.question_id)),
            {'upvotes': 1, 'downvotes': 0, 'score': 1},
        )

    def test_question_downvote_is_allowed_after_protected_window_expires(self):
        protected_question_author = CustomUser.objects.create_user(
            user_email='protected-question-expired-author@example.com',
            user_name='protected-question-expired-author',
            password='password',
        )
        protected_question = Question.objects.create(
            user=protected_question_author,
            question_title='Expired protected newcomer question',
            question_body='Question downvotes should resume after the protected window.',
        )
        Question.objects.filter(pk=protected_question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        protected_question.refresh_from_db()

        vote, created = VoteService.cast_vote(
            'question',
            str(protected_question.question_id),
            Vote.VoteType.DOWNVOTE,
            self.voter,
        )

        self.assertTrue(created)
        self.assertEqual(vote.vote_type, Vote.VoteType.DOWNVOTE)
        self.assertEqual(
            VoteService.get_vote_stats('question', str(protected_question.question_id)),
            {'upvotes': 0, 'downvotes': 1, 'score': -1},
        )

    def test_should_reward_upvote_transition_only_when_upvote_is_newly_introduced(self):
        cases = [
            (None, Vote.VoteType.UPVOTE, True),
            (None, Vote.VoteType.DOWNVOTE, False),
            (Vote.VoteType.DOWNVOTE, Vote.VoteType.UPVOTE, True),
            (Vote.VoteType.UPVOTE, Vote.VoteType.DOWNVOTE, False),
            (Vote.VoteType.UPVOTE, None, False),
            (Vote.VoteType.DOWNVOTE, None, False),
            (Vote.VoteType.UPVOTE, Vote.VoteType.UPVOTE, False),
        ]

        for previous_vote_type, next_vote_type, expected in cases:
            with self.subTest(previous_vote_type=previous_vote_type, next_vote_type=next_vote_type):
                self.assertEqual(
                    VoteService.should_reward_upvote_transition(previous_vote_type, next_vote_type),
                    expected,
                )

    def test_question_reputation_transitions_follow_m004_upvote_rules(self):
        reward = VoteService.REPUTATION_REWARDS['question']
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()
        cases = [
            ('no_vote_to_up', None, Vote.VoteType.UPVOTE, reward['amount'], 1),
            ('no_vote_to_down', None, Vote.VoteType.DOWNVOTE, 0, 0),
            ('down_to_up', Vote.VoteType.DOWNVOTE, Vote.VoteType.UPVOTE, reward['amount'], 1),
            ('up_to_down', Vote.VoteType.UPVOTE, Vote.VoteType.DOWNVOTE, 0, 0),
            ('repeated_up', Vote.VoteType.UPVOTE, Vote.VoteType.UPVOTE, 0, 0),
        ]

        for case_name, previous_vote_type, next_vote_type, expected_score, expected_tx_count in cases:
            with self.subTest(case_name=case_name):
                self._reset_vote_reward_state()
                if previous_vote_type is not None:
                    self._seed_existing_vote(target_type='question', vote_type=previous_vote_type)

                VoteService.cast_vote('question', str(self.question.question_id), next_vote_type, self.voter)
                expected_reason = reward['reason'] if expected_tx_count else None
                self._assert_reward_state(
                    target_type='question',
                    score=expected_score,
                    tx_count=expected_tx_count,
                    reason=expected_reason,
                )

    def test_question_reputation_is_not_removed_when_vote_is_deleted(self):
        reward = VoteService.REPUTATION_REWARDS['question']
        VoteService.cast_vote('question', str(self.question.question_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.remove_vote('question', str(self.question.question_id), self.voter)

        self._assert_reward_state(
            target_type='question',
            score=reward['amount'],
            tx_count=1,
            reason=reward['reason'],
        )
        self.assertFalse(Vote.objects.filter(user=self.voter).exists())

    def test_question_reputation_is_not_awarded_twice_after_upvote_delete_and_reupvote(self):
        reward = VoteService.REPUTATION_REWARDS['question']

        VoteService.cast_vote('question', str(self.question.question_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.remove_vote('question', str(self.question.question_id), self.voter)
        VoteService.cast_vote('question', str(self.question.question_id), Vote.VoteType.UPVOTE, self.voter)

        self._assert_reward_state(
            target_type='question',
            score=reward['amount'],
            tx_count=1,
            reason=reward['reason'],
        )
        self.assertEqual(
            VoteService.get_vote_stats('question', str(self.question.question_id)),
            {'upvotes': 1, 'downvotes': 0, 'score': 1},
        )

    def test_solution_reputation_transitions_follow_m004_upvote_rules(self):
        reward = VoteService.REPUTATION_REWARDS['solution']
        cases = [
            ('no_vote_to_up', None, Vote.VoteType.UPVOTE, reward['amount'], 1),
            ('no_vote_to_down', None, Vote.VoteType.DOWNVOTE, 0, 0),
            ('down_to_up', Vote.VoteType.DOWNVOTE, Vote.VoteType.UPVOTE, reward['amount'], 1),
            ('up_to_down', Vote.VoteType.UPVOTE, Vote.VoteType.DOWNVOTE, 0, 0),
            ('repeated_up', Vote.VoteType.UPVOTE, Vote.VoteType.UPVOTE, 0, 0),
        ]

        for case_name, previous_vote_type, next_vote_type, expected_score, expected_tx_count in cases:
            with self.subTest(case_name=case_name):
                self._reset_vote_reward_state()
                if previous_vote_type is not None:
                    self._seed_existing_vote(target_type='solution', vote_type=previous_vote_type)

                VoteService.cast_vote('solution', str(self.solution.solution_id), next_vote_type, self.voter)
                expected_reason = reward['reason'] if expected_tx_count else None
                self._assert_reward_state(
                    target_type='solution',
                    score=expected_score,
                    tx_count=expected_tx_count,
                    reason=expected_reason,
                )

    def test_solution_reputation_is_not_removed_when_vote_is_deleted(self):
        reward = VoteService.REPUTATION_REWARDS['solution']
        VoteService.cast_vote('solution', str(self.solution.solution_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.remove_vote('solution', str(self.solution.solution_id), self.voter)

        self._assert_reward_state(
            target_type='solution',
            score=reward['amount'],
            tx_count=1,
            reason=reward['reason'],
        )
        self.assertFalse(Vote.objects.filter(user=self.voter).exists())

    def test_solution_reputation_is_not_awarded_twice_after_upvote_delete_and_reupvote(self):
        reward = VoteService.REPUTATION_REWARDS['solution']

        VoteService.cast_vote('solution', str(self.solution.solution_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.remove_vote('solution', str(self.solution.solution_id), self.voter)
        VoteService.cast_vote('solution', str(self.solution.solution_id), Vote.VoteType.UPVOTE, self.voter)

        self._assert_reward_state(
            target_type='solution',
            score=reward['amount'],
            tx_count=1,
            reason=reward['reason'],
        )
        self.assertEqual(
            VoteService.get_vote_stats('solution', str(self.solution.solution_id)),
            {'upvotes': 1, 'downvotes': 0, 'score': 1},
        )

    def test_self_vote_is_rejected_before_reputation_changes(self):
        with self.assertRaisesMessage(Exception, 'Нельзя голосовать за собственный контент'):
            VoteService.cast_vote('question', str(self.question.question_id), Vote.VoteType.UPVOTE, self.question_author)

        self.question_author.refresh_from_db()
        self.assertEqual(self.question_author.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())
        self.assertFalse(Vote.objects.exists())

    def test_vote_statistics_and_annotations_remain_correct_after_reputation_side_effects(self):
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()

        VoteService.cast_vote('question', str(self.question.question_id), Vote.VoteType.UPVOTE, self.voter)
        other_voter = CustomUser.objects.create_user(
            user_email='other-voter@example.com',
            user_name='other-voter',
            password='password',
        )
        VoteService.cast_vote('question', str(self.question.question_id), Vote.VoteType.DOWNVOTE, other_voter)

        stats = VoteService.get_vote_stats('question', str(self.question.question_id))
        annotated_question = VoteService.annotate_votes(
            Question.objects.filter(question_id=self.question.question_id),
            Question,
            self.voter,
        ).get()

        self.assertEqual(stats, {'upvotes': 1, 'downvotes': 1, 'score': 0})
        self.assertEqual(VoteService.get_vote_stats_fast(annotated_question, 'question'), stats)
        self.assertEqual(VoteService.get_user_vote_fast(annotated_question), Vote.VoteType.UPVOTE)


class BestSolutionReputationTests(APITestCase):
    def setUp(self):
        self.question_owner = CustomUser.objects.create_user(
            user_email='best-question-owner@example.com',
            user_name='best-question-owner',
            password='password',
        )
        self.first_author = CustomUser.objects.create_user(
            user_email='best-first-author@example.com',
            user_name='best-first-author',
            password='password',
        )
        self.second_author = CustomUser.objects.create_user(
            user_email='best-second-author@example.com',
            user_name='best-second-author',
            password='password',
        )
        self.outsider = CustomUser.objects.create_user(
            user_email='best-outsider@example.com',
            user_name='best-outsider',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.question_owner,
            question_title='Which answer should become the best solution?',
            question_body='Need to verify reputation transitions for best-solution selection.',
        )
        self.first_solution = Solution.objects.create(
            user=self.first_author,
            question=self.question,
            solution_body='First candidate answer.',
        )
        self.second_solution = Solution.objects.create(
            user=self.second_author,
            question=self.question,
            solution_body='Second candidate answer.',
        )

    def assert_single_best_solution_reward(self, solution: Solution, author: CustomUser):
        author.refresh_from_db()
        self.assertEqual(author.user_reputation_score, BEST_SOLUTION_REPUTATION_AWARD)

        transactions = list(ReputationTransaction.objects.filter(user=author))
        self.assertEqual(len(transactions), 1)
        self.assertEqual(transactions[0].reputation_transaction_reason, ReputationTransaction.TransactionReason.BEST_SOLUTION)
        self.assertEqual(transactions[0].reputation_transaction_amount, BEST_SOLUTION_REPUTATION_AWARD)
        self.assertEqual(transactions[0].actor_id, self.question_owner.user_id)
        self.assertEqual(transactions[0].content_type.model, 'solution')
        self.assertEqual(transactions[0].object_id, solution.pk)

    def test_setting_best_solution_awards_reputation_once_with_source_reference(self):
        SolutionService.set_best_solution(self.first_solution, True, self.question_owner)

        self.first_solution.refresh_from_db()
        self.question.refresh_from_db()

        self.assertTrue(self.first_solution.solution_is_best)
        self.assertEqual(self.question.question_status, Question.Status.SOLVED_STATUS)
        self.assert_single_best_solution_reward(self.first_solution, self.first_author)

    def test_repeating_best_solution_selection_is_idempotent_for_reputation(self):
        SolutionService.set_best_solution(self.first_solution, True, self.question_owner)
        SolutionService.set_best_solution(self.first_solution, True, self.question_owner)

        self.assert_single_best_solution_reward(self.first_solution, self.first_author)

    def test_unsetting_best_solution_does_not_create_reputation_transaction(self):
        SolutionService.set_best_solution(self.first_solution, True, self.question_owner)
        SolutionService.set_best_solution(self.first_solution, False, self.question_owner)

        self.first_solution.refresh_from_db()
        self.question.refresh_from_db()
        self.first_author.refresh_from_db()

        self.assertFalse(self.first_solution.solution_is_best)
        self.assertEqual(self.question.question_status, Question.Status.OPEN_STATUS)
        self.assertEqual(self.first_author.user_reputation_score, BEST_SOLUTION_REPUTATION_AWARD)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.first_author).count(), 1)

    def test_switching_best_solution_rewards_new_author_without_double_awarding_previous_one(self):
        SolutionService.set_best_solution(self.first_solution, True, self.question_owner)
        SolutionService.set_best_solution(self.second_solution, True, self.question_owner)

        self.first_solution.refresh_from_db()
        self.second_solution.refresh_from_db()
        self.question.refresh_from_db()
        self.first_author.refresh_from_db()
        self.second_author.refresh_from_db()

        self.assertFalse(self.first_solution.solution_is_best)
        self.assertTrue(self.second_solution.solution_is_best)
        self.assertEqual(self.question.question_status, Question.Status.SOLVED_STATUS)
        self.assertEqual(self.first_author.user_reputation_score, BEST_SOLUTION_REPUTATION_AWARD)
        self.assertEqual(self.second_author.user_reputation_score, BEST_SOLUTION_REPUTATION_AWARD)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.first_author).count(), 1)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.second_author).count(), 1)

    def test_unsetting_non_best_solution_keeps_question_solved_when_another_best_exists(self):
        SolutionService.set_best_solution(self.first_solution, True, self.question_owner)
        SolutionService.set_best_solution(self.second_solution, False, self.question_owner)

        self.first_solution.refresh_from_db()
        self.second_solution.refresh_from_db()
        self.question.refresh_from_db()
        self.second_author.refresh_from_db()

        self.assertTrue(self.first_solution.solution_is_best)
        self.assertFalse(self.second_solution.solution_is_best)
        self.assertEqual(self.question.question_status, Question.Status.SOLVED_STATUS)
        self.assertEqual(self.second_author.user_reputation_score, 0)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.second_author).count(), 0)

    def test_non_author_attempt_rolls_back_best_solution_and_reputation_changes(self):
        with self.assertRaisesMessage(PermissionDenied, 'Только автор вопроса может выбирать лучшее решение'):
            SolutionService.set_best_solution(self.first_solution, True, self.outsider)

        self.first_solution.refresh_from_db()
        self.question.refresh_from_db()
        self.first_author.refresh_from_db()

        self.assertFalse(self.first_solution.solution_is_best)
        self.assertEqual(self.question.question_status, Question.Status.OPEN_STATUS)
        self.assertEqual(self.first_author.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())


class ReputationIntegratedScoringRegressionTests(APITestCase):
    def setUp(self):
        self.receiver = CustomUser.objects.create_user(
            user_email='integrated-receiver@example.com',
            user_name='integrated-receiver',
            password='password',
        )
        self.question_owner = CustomUser.objects.create_user(
            user_email='integrated-question-owner@example.com',
            user_name='integrated-question-owner',
            password='password',
        )
        self.voter = CustomUser.objects.create_user(
            user_email='integrated-voter@example.com',
            user_name='integrated-voter',
            password='password',
        )
        self.answer_target_question = Question.objects.create(
            user=self.question_owner,
            question_title='How should integrated scoring be tested?',
            question_body='This question receives the best answer and approved edit events.',
        )
        self.receiver_solution = Solution.objects.create(
            user=self.receiver,
            question=self.answer_target_question,
            solution_body='Integrated answer that should earn reputation.',
        )
        self.receiver_question = Question.objects.create(
            user=self.receiver,
            question_title='Question authored by the integrated receiver',
            question_body='This question should earn upvote reputation.',
        )

    def test_mixed_m004_scoring_events_keep_score_progress_and_ledger_coherent(self):
        proposal = QuestionEditService.create_proposal(
            question=self.answer_target_question,
            actor=self.receiver,
            payload=QuestionChangePayload(
                title='How should integrated scoring be regression tested?',
                body='Approved edit body used by the integrated reputation test.',
                tags=[],
            ),
        )

        SolutionService.set_best_solution(self.receiver_solution, True, self.question_owner)
        VoteService.cast_vote('solution', str(self.receiver_solution.solution_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.cast_vote('question', str(self.receiver_question.question_id), Vote.VoteType.UPVOTE, self.voter)
        QuestionEditService.change_proposal_approval(
            proposal_id=str(proposal.question_edit_id),
            actor=self.question_owner,
            approved=True,
        )

        expected_score = (
            BEST_SOLUTION_REPUTATION_AWARD
            + VoteService.REPUTATION_REWARDS['solution']['amount']
            + VoteService.REPUTATION_REWARDS['question']['amount']
            + QuestionEditService.APPROVED_EDIT_REPUTATION_AWARD
        )
        self.receiver.refresh_from_db()
        self.assertEqual(self.receiver.user_reputation_score, expected_score)

        progress = ReputationService.get_progress(self.receiver)
        self.assertEqual(progress['score'], expected_score)
        self.assertEqual(progress['level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(progress['next_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(progress['points_to_next_level'], 100 - expected_score)
        self.assertFalse(progress['is_manual_override'])

        transactions = list(
            ReputationTransaction.objects.filter(user=self.receiver).order_by('created_at')
        )
        self.assertEqual(
            [
                (
                    transaction.reputation_transaction_reason,
                    transaction.reputation_transaction_amount,
                    transaction.content_type.model,
                    transaction.object_id,
                    transaction.actor_id,
                )
                for transaction in transactions
            ],
            [
                (
                    ReputationTransaction.TransactionReason.BEST_SOLUTION,
                    BEST_SOLUTION_REPUTATION_AWARD,
                    'solution',
                    self.receiver_solution.pk,
                    self.question_owner.user_id,
                ),
                (
                    ReputationTransaction.TransactionReason.SOLUTION_UPVOTED,
                    VoteService.REPUTATION_REWARDS['solution']['amount'],
                    'solution',
                    self.receiver_solution.pk,
                    self.voter.user_id,
                ),
                (
                    ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
                    VoteService.REPUTATION_REWARDS['question']['amount'],
                    'question',
                    self.receiver_question.pk,
                    self.voter.user_id,
                ),
                (
                    ReputationTransaction.TransactionReason.APPROVED_EDIT,
                    QuestionEditService.APPROVED_EDIT_REPUTATION_AWARD,
                    'questioneditproposal',
                    proposal.pk,
                    self.question_owner.user_id,
                ),
            ],
        )

        transaction_count = ReputationTransaction.objects.filter(user=self.receiver).count()
        SolutionService.set_best_solution(self.receiver_solution, True, self.question_owner)
        VoteService.cast_vote('solution', str(self.receiver_solution.solution_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.cast_vote('question', str(self.receiver_question.question_id), Vote.VoteType.UPVOTE, self.voter)
        with self.assertRaisesMessage(Exception, 'Правка вопроса уже была одобрена или отклонена'):
            QuestionEditService.change_proposal_approval(
                proposal_id=str(proposal.question_edit_id),
                actor=self.question_owner,
                approved=True,
            )

        self.receiver.refresh_from_db()
        self.assertEqual(self.receiver.user_reputation_score, expected_score)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.receiver).count(), transaction_count)


class ReputationPolicyIntegrationTests(APITestCase):
    def setUp(self):
        self.admin_user = CustomUser.objects.create_user(
            user_email='policy-admin@example.com',
            user_name='policy-admin',
            password='password',
            is_staff=True,
        )
        self.question_owner = CustomUser.objects.create_user(
            user_email='policy-question-owner@example.com',
            user_name='policy-question-owner',
            password='password',
        )
        self.reputation_user = CustomUser.objects.create_user(
            user_email='policy-reputation-user@example.com',
            user_name='policy-reputation-user',
            password='password',
        )
        self.newcomer_question_author = CustomUser.objects.create_user(
            user_email='policy-newcomer-author@example.com',
            user_name='policy-newcomer-author',
            password='password',
        )
        self.participant_viewer = CustomUser.objects.create_user(
            user_email='policy-participant-viewer@example.com',
            user_name='policy-participant-viewer',
            password='password',
            user_reputation_score=30,
        )
        self.vote_actor = CustomUser.objects.create_user(
            user_email='policy-vote-actor@example.com',
            user_name='policy-vote-actor',
            password='password',
        )
        self.reputation_question = Question.objects.create(
            user=self.reputation_user,
            question_title='Integrated reputation question',
            question_body='Question used to collect integrated reputation events.',
        )
        self.best_solution_target_question = Question.objects.create(
            user=self.question_owner,
            question_title='Question selecting the integrated best solution',
            question_body='Question owned by the selector for best-solution reputation proof.',
        )
        self.best_solution = Solution.objects.create(
            user=self.reputation_user,
            question=self.best_solution_target_question,
            solution_body='Solution used to collect best-solution and vote rewards.',
        )
        self.edit_target_question = Question.objects.create(
            user=self.question_owner,
            question_title='Question requiring an approved edit',
            question_body='Question body before approved edit.',
        )
        self.policy_question = Question.objects.create(
            user=self.newcomer_question_author,
            question_title='Protected newcomer question for integrated policy proof',
            question_body='Policy gating should react to score, override, and config changes.',
        )

    def _award_integrated_reputation(self):
        proposal = QuestionEditService.create_proposal(
            question=self.edit_target_question,
            actor=self.reputation_user,
            payload=QuestionChangePayload(
                title='Question requiring an approved edit (updated)',
                body='Question body after approved edit.',
                tags=[],
            ),
        )

        SolutionService.set_best_solution(self.best_solution, True, self.question_owner)
        VoteService.cast_vote('solution', str(self.best_solution.solution_id), Vote.VoteType.UPVOTE, self.vote_actor)
        VoteService.cast_vote(
            'question',
            str(self.reputation_question.question_id),
            Vote.VoteType.UPVOTE,
            self.vote_actor,
        )
        QuestionEditService.change_proposal_approval(
            proposal_id=str(proposal.question_edit_id),
            actor=self.question_owner,
            approved=True,
        )
        return proposal

    def test_reputation_policy_stack_integrates_events_thresholds_override_and_window_config(self):
        proposal = self._award_integrated_reputation()

        self.reputation_user.refresh_from_db()
        self.assertEqual(self.reputation_user.user_reputation_score, 32)

        progress = ReputationService.get_progress(self.reputation_user)
        self.assertEqual(progress['level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(progress['next_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(progress['points_to_next_level'], 68)
        self.assertFalse(progress['is_manual_override'])

        transactions = list(
            ReputationTransaction.objects.filter(user=self.reputation_user).order_by('created_at')
        )
        self.assertEqual(
            [transaction.reputation_transaction_reason for transaction in transactions],
            [
                ReputationTransaction.TransactionReason.BEST_SOLUTION,
                ReputationTransaction.TransactionReason.SOLUTION_UPVOTED,
                ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
                ReputationTransaction.TransactionReason.APPROVED_EDIT,
            ],
        )
        self.assertEqual(transactions[0].object_id, self.best_solution.pk)
        self.assertEqual(transactions[1].object_id, self.best_solution.pk)
        self.assertEqual(transactions[2].object_id, self.reputation_question.pk)
        self.assertEqual(transactions[3].object_id, proposal.pk)

        initial_decision = QuestionProtectionService.get_answer_eligibility(
            self.policy_question,
            self.reputation_user,
        )
        initial_downvote = QuestionProtectionService.get_question_downvote_eligibility(
            self.policy_question,
            self.reputation_user,
        )
        self.assertFalse(initial_decision.allowed)
        self.assertEqual(
            initial_decision.reason_code,
            QuestionProtectionService.ANSWER_BLOCKED_INSUFFICIENT_LEVEL,
        )
        self.assertEqual(initial_decision.viewer_level, CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(initial_decision.points_to_next_level, 68)
        self.assertFalse(initial_downvote.allowed)
        self.assertEqual(
            initial_downvote.reason_code,
            QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED,
        )
        self.assertEqual(initial_downvote.viewer_level, CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(initial_downvote.points_to_next_level, 68)

        expert_threshold = ReputationLevelThreshold.objects.get(level=CustomUser.ReputationLevel.EXPERT)
        expert_threshold.minimum_score = 32
        expert_threshold.save()

        threshold_progress = ReputationService.get_progress(self.reputation_user)
        self.assertEqual(threshold_progress['level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(threshold_progress['next_level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(threshold_progress['points_to_next_level'], 268)

        threshold_decision = QuestionProtectionService.get_answer_eligibility(
            self.policy_question,
            self.reputation_user,
        )
        threshold_downvote = QuestionProtectionService.get_question_downvote_eligibility(
            self.policy_question,
            self.reputation_user,
        )
        self.assertTrue(threshold_decision.allowed)
        self.assertEqual(threshold_decision.viewer_level, CustomUser.ReputationLevel.EXPERT)
        self.assertFalse(threshold_downvote.allowed)
        self.assertEqual(
            threshold_downvote.reason_code,
            QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED,
        )
        self.assertEqual(threshold_downvote.viewer_level, CustomUser.ReputationLevel.EXPERT)

        overridden_user = ReputationService.set_manual_level_override(
            user=self.reputation_user,
            manual_level=CustomUser.ReputationLevel.NEWCOMER,
            actor=self.admin_user,
            note='Integrated policy regression override.',
        )
        override_progress = ReputationService.get_progress(overridden_user)
        self.assertTrue(override_progress['is_manual_override'])
        self.assertEqual(override_progress['level'], CustomUser.ReputationLevel.NEWCOMER)
        self.assertEqual(override_progress['derived_level'], CustomUser.ReputationLevel.EXPERT)

        override_decision = QuestionProtectionService.get_answer_eligibility(
            self.policy_question,
            overridden_user,
        )
        override_downvote = QuestionProtectionService.get_question_downvote_eligibility(
            self.policy_question,
            overridden_user,
        )
        self.assertFalse(override_decision.allowed)
        self.assertEqual(override_decision.viewer_level, CustomUser.ReputationLevel.NEWCOMER)
        self.assertEqual(override_decision.points_to_next_level, 268)
        self.assertFalse(override_downvote.allowed)
        self.assertEqual(
            override_downvote.reason_code,
            QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED,
        )
        self.assertEqual(override_downvote.viewer_level, CustomUser.ReputationLevel.NEWCOMER)
        self.assertEqual(override_downvote.points_to_next_level, 268)

        override_transaction = ReputationTransaction.objects.filter(
            user=self.reputation_user,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        ).latest('created_at')
        self.assertEqual(override_transaction.reputation_transaction_amount, 0)
        self.assertEqual(override_transaction.actor, self.admin_user)
        self.assertIn('Integrated policy regression override.', override_transaction.note)

        cleared_user = ReputationService.set_manual_level_override(
            user=self.reputation_user,
            manual_level=None,
            actor=self.admin_user,
            note='Integrated policy regression clear.',
        )
        cleared_decision = QuestionProtectionService.get_answer_eligibility(self.policy_question, cleared_user)
        self.assertTrue(cleared_decision.allowed)
        self.assertEqual(cleared_decision.viewer_level, CustomUser.ReputationLevel.EXPERT)

        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=24)
        Question.objects.filter(pk=self.policy_question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=23)
        )
        self.policy_question.refresh_from_db()

        extended_window_state = QuestionProtectionService.get_protection_state(self.policy_question)
        self.assertTrue(extended_window_state.is_protected)
        self.assertIsNotNone(extended_window_state.protected_until)

        Question.objects.filter(pk=self.policy_question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=25)
        )
        self.policy_question.refresh_from_db()

        expired_window_state = QuestionProtectionService.get_protection_state(self.policy_question)
        expired_answer = QuestionProtectionService.get_answer_eligibility(
            self.policy_question,
            self.participant_viewer,
        )
        expired_downvote = QuestionProtectionService.get_question_downvote_eligibility(
            self.policy_question,
            self.participant_viewer,
        )

        self.assertFalse(expired_window_state.is_protected)
        self.assertTrue(expired_answer.allowed)
        self.assertEqual(expired_answer.reason_code, QuestionProtectionService.ANSWER_ALLOWED)
        self.assertTrue(expired_downvote.allowed)
        self.assertEqual(expired_downvote.reason_code, QuestionProtectionService.DOWNVOTE_ALLOWED)


class ProtectedQuestionAnswerApiTests(APITestCase):
    def setUp(self):
        self.newcomer_author = CustomUser.objects.create_user(
            user_email='newcomer-author@example.com',
            user_name='newcomer-author',
            password='password',
        )
        self.participant = CustomUser.objects.create_user(
            user_email='participant-answerer@example.com',
            user_name='participant-answerer',
            password='password',
            user_reputation_score=30,
        )
        self.newcomer_answerer = CustomUser.objects.create_user(
            user_email='newcomer-answerer@example.com',
            user_name='newcomer-answerer',
            password='password',
        )
        self.expert = CustomUser.objects.create_user(
            user_email='expert-answerer@example.com',
            user_name='expert-answerer',
            password='password',
            user_reputation_score=100,
        )
        self.master = CustomUser.objects.create_user(
            user_email='master-answerer@example.com',
            user_name='master-answerer',
            password='password',
            user_reputation_score=300,
        )
        self.question = Question.objects.create(
            user=self.newcomer_author,
            question_title='Protected newcomer question',
            question_body='This question should enforce protected newcomer answer rules.',
        )
        self.solution_payload = {
            'question': str(self.question.question_id),
            'solution_body': 'Concrete answer body that should be persisted only when allowed.',
        }

    def _create_solution(self, actor: CustomUser):
        self.client.force_authenticate(actor)
        return self.client.post('/solution/', self.solution_payload, format='json')

    def _create_manual_invitation(self, *, recipient, expires_at=None, payload=None):
        return Notification.objects.create(
            recipient=recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Manual invitation for answer authorization regression coverage',
            message='This forged fixture must never authorize an answer.',
            payload=payload if payload is not None else {'forged_role': 'expert', 'question_id': str(self.question.pk)},
            source_question=self.question,
            expires_at=expires_at,
            dedupe_key=QuestionExpertInvitationService.build_dedupe_key(self.question.pk, recipient.pk),
        )

    def assert_protected_answer_rejected(self, response, actor):
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
        self.assertEqual(
            response.data,
            {
                'detail': QuestionProtectionService.build_answer_denied_message(),
                'code': 'protected_newcomer_answer_required',
            },
        )
        self.assertFalse(Solution.objects.filter(user=actor, question=self.question).exists())

    def test_participant_cannot_answer_protected_newcomer_question_during_window(self):
        response = self._create_solution(self.participant)

        self.assert_protected_answer_rejected(response, self.participant)
        self.assertEqual(Solution.objects.count(), 0)
        self.assertEqual(ReputationTransaction.objects.count(), 0)

    def test_forged_participant_invitation_does_not_authorize_protected_answer(self):
        self._create_manual_invitation(recipient=self.participant)

        response = self._create_solution(self.participant)

        self.assert_protected_answer_rejected(response, self.participant)
        self.assertEqual(Solution.objects.count(), 0)
        self.assertEqual(ReputationTransaction.objects.count(), 0)

    def test_forged_newcomer_invitation_does_not_authorize_protected_answer(self):
        self._create_manual_invitation(recipient=self.newcomer_answerer)

        response = self._create_solution(self.newcomer_answerer)

        self.assert_protected_answer_rejected(response, self.newcomer_answerer)
        self.assertEqual(Solution.objects.count(), 0)
        self.assertEqual(ReputationTransaction.objects.count(), 0)

    def test_expired_invitation_does_not_authorize_protected_answer(self):
        self._create_manual_invitation(
            recipient=self.participant,
            expires_at=timezone.now() - timedelta(minutes=1),
            payload={'invitation_status': 'expired', 'viewer_level': CustomUser.ReputationLevel.EXPERT},
        )

        response = self._create_solution(self.participant)

        self.assert_protected_answer_rejected(response, self.participant)
        self.assertEqual(Solution.objects.count(), 0)
        self.assertEqual(ReputationTransaction.objects.count(), 0)

    def test_ttl_active_invitation_after_protected_window_follows_normal_policy(self):
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()
        self._create_manual_invitation(
            recipient=self.participant,
            expires_at=timezone.now() + timedelta(hours=1),
            payload={'protected_window_ended': True, 'viewer_level': CustomUser.ReputationLevel.PARTICIPANT},
        )

        response = self._create_solution(self.participant)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Solution.objects.filter(user=self.participant, question=self.question).exists())

    def test_notification_statuses_remain_informational_under_answer_policy_authority(self):
        active_invitation = self._create_manual_invitation(
            recipient=self.participant,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        active_response = self._create_solution(self.participant)

        Notification.objects.filter(pk=active_invitation.pk).update(
            expires_at=timezone.now() + timedelta(hours=1),
            payload={
                'question_id': str(self.question.pk),
                'recipient_id': str(self.participant.pk),
                'viewer_level': CustomUser.ReputationLevel.EXPERT,
                'viewer_can_answer': True,
                'invitation_status': 'active',
                'protected_window_ended': False,
            },
        )
        forged_response = self._create_solution(self.participant)

        Notification.objects.filter(pk=active_invitation.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1),
            payload={
                'question_id': str(self.question.pk),
                'recipient_id': str(self.participant.pk),
                'viewer_level': CustomUser.ReputationLevel.EXPERT,
                'viewer_can_answer': True,
                'invitation_status': 'expired',
            },
        )
        expired_response = self._create_solution(self.participant)

        self.assert_protected_answer_rejected(active_response, self.participant)
        self.assert_protected_answer_rejected(forged_response, self.participant)
        self.assert_protected_answer_rejected(expired_response, self.participant)

        Notification.objects.filter(pk=active_invitation.pk).update(
            expires_at=timezone.now() + timedelta(hours=1),
            payload={
                'question_id': str(self.question.pk),
                'recipient_id': str(self.participant.pk),
                'viewer_can_answer': False,
                'invitation_status': 'active',
                'protected_window_ended': True,
            },
        )
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()
        protected_window_ended_response = self._create_solution(self.participant)

        self.assertEqual(protected_window_ended_response.status_code, status.HTTP_201_CREATED, protected_window_ended_response.data)
        self.assertTrue(Solution.objects.filter(user=self.participant, question=self.question).exists())
        self.assertTrue(QuestionProtectionService.get_answer_eligibility(self.question, self.participant).allowed)

    def test_expert_can_answer_protected_newcomer_question_during_window(self):
        response = self._create_solution(self.expert)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        solution = Solution.objects.get(user=self.expert, question=self.question)
        self.assertEqual(solution.solution_body, self.solution_payload['solution_body'])

    def test_master_can_answer_protected_newcomer_question_during_window(self):
        response = self._create_solution(self.master)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        solution = Solution.objects.get(user=self.master, question=self.question)
        self.assertEqual(solution.solution_body, self.solution_payload['solution_body'])

    def test_participant_can_answer_non_newcomer_question_during_window(self):
        experienced_author = CustomUser.objects.create_user(
            user_email='experienced-author@example.com',
            user_name='experienced-author',
            password='password',
            user_reputation_score=30,
        )
        question = Question.objects.create(
            user=experienced_author,
            question_title='Open question from participant',
            question_body='This should not be protected for answers.',
        )

        self.client.force_authenticate(self.participant)
        response = self.client.post(
            '/solution/',
            {
                'question': str(question.question_id),
                'solution_body': 'Participant answer should be allowed for non-newcomer questions.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Solution.objects.filter(user=self.participant, question=question).exists())

    def test_participant_can_answer_after_protected_window_expires(self):
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()

        response = self._create_solution(self.participant)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Solution.objects.filter(user=self.participant, question=self.question).exists())

    def test_answer_creation_uses_admin_configured_protected_window_via_shared_policy_service(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=24)
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()

        participant_decision = QuestionProtectionService.get_answer_eligibility(self.question, self.participant)
        protection_state = QuestionProtectionService.get_protection_state(self.question)
        downvote_decision = QuestionProtectionService.get_question_downvote_eligibility(self.question, self.participant)

        self.assertTrue(protection_state.is_protected)
        self.assertFalse(participant_decision.allowed)
        self.assertFalse(downvote_decision.allowed)

        response = self._create_solution(self.participant)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
        self.assertEqual(
            response.data,
            {
                'detail': QuestionProtectionService.build_answer_denied_message(participant_decision),
                'code': 'protected_newcomer_answer_required',
            },
        )
        self.assertIn('24 часов', response.data['detail'])
        self.assertFalse(Solution.objects.filter(user=self.participant, question=self.question).exists())
        self.assertEqual(Solution.objects.count(), 0)
        self.assertEqual(ReputationTransaction.objects.count(), 0)

    def test_existing_self_answer_validation_remains_deterministic_for_newcomer_author(self):
        response = self._create_solution(self.newcomer_author)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data, {'non_field_errors': ['Автор вопроса не может публиковать решение к своему вопросу']})
        self.assertFalse(Solution.objects.filter(question=self.question).exists())

    def test_existing_duplicate_solution_validation_wins_over_protection_for_same_user(self):
        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        Solution.objects.create(
            user=self.participant,
            question=self.question,
            solution_body='First answer',
        )

        response = self._create_solution(self.participant)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data, {'non_field_errors': ['Пользователь уже выложил решение на данный вопрос']})
        self.assertEqual(Solution.objects.filter(user=self.participant, question=self.question).count(), 1)


class ProtectedNewcomerQuestionIntegratedPolicyTests(APITestCase):
    def setUp(self):
        self.newcomer_author = CustomUser.objects.create_user(
            user_email='integrated-newcomer-author@example.com',
            user_name='integrated-newcomer-author',
            password='password',
        )
        self.participant = CustomUser.objects.create_user(
            user_email='integrated-participant@example.com',
            user_name='integrated-participant',
            password='password',
            user_reputation_score=30,
        )
        self.expert = CustomUser.objects.create_user(
            user_email='integrated-expert@example.com',
            user_name='integrated-expert',
            password='password',
            user_reputation_score=100,
        )
        self.question = Question.objects.create(
            user=self.newcomer_author,
            question_title='Integrated protected newcomer question',
            question_body='Question content must stay readable while answer and downvote actions are gated.',
        )

    def _get_question(self, viewer: CustomUser):
        self.client.force_authenticate(viewer)
        return self.client.get(f'/question/{self.question.question_id}/')

    def _create_solution(self, actor: CustomUser, body: str):
        self.client.force_authenticate(actor)
        return self.client.post(
            '/solution/',
            {
                'question': str(self.question.question_id),
                'solution_body': body,
            },
            format='json',
        )

    def _cast_question_vote(self, actor: CustomUser, vote_type: str):
        self.client.force_authenticate(actor)
        return self.client.post(
            '/vote/cast/',
            {
                'target_type': 'question',
                'target_id': str(self.question.question_id),
                'vote_type': vote_type,
            },
            format='json',
        )

    def test_protected_newcomer_policy_spans_service_api_actions_and_expiry(self):
        protected_state = QuestionProtectionService.get_protection_state(self.question)
        participant_answer = QuestionProtectionService.get_answer_eligibility(self.question, self.participant)
        expert_answer = QuestionProtectionService.get_answer_eligibility(self.question, self.expert)
        participant_downvote = QuestionProtectionService.get_question_downvote_eligibility(self.question, self.participant)

        self.assertTrue(protected_state.is_protected)
        self.assertEqual(protected_state.author_level, CustomUser.ReputationLevel.NEWCOMER)
        self.assertFalse(participant_answer.allowed)
        self.assertEqual(participant_answer.reason_code, QuestionProtectionService.ANSWER_BLOCKED_INSUFFICIENT_LEVEL)
        self.assertTrue(expert_answer.allowed)
        self.assertFalse(participant_downvote.allowed)
        self.assertEqual(participant_downvote.reason_code, QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED)

        participant_detail = self._get_question(self.participant)

        self.assertEqual(participant_detail.status_code, status.HTTP_200_OK, participant_detail.data)
        self.assertEqual(participant_detail.data['question_title'], 'Integrated protected newcomer question')
        self.assertIn('must stay readable', participant_detail.data['question_body'])
        self.assertTrue(participant_detail.data['is_protected'])
        self.assertEqual(participant_detail.data['protection_reason_code'], QuestionProtectionService.PROTECTED_NEWCOMER)
        self.assertFalse(participant_detail.data['viewer_can_answer'])
        self.assertEqual(
            participant_detail.data['viewer_answer_reason_code'],
            QuestionProtectionService.ANSWER_BLOCKED_INSUFFICIENT_LEVEL,
        )
        self.assertEqual(participant_detail.data['viewer_level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(participant_detail.data['viewer_points_to_next_level'], 70)
        self.assertFalse(participant_detail.data['viewer_can_downvote'])
        self.assertEqual(
            participant_detail.data['viewer_downvote_reason_code'],
            QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED,
        )
        self.assertIsNotNone(participant_detail.data['protected_until'])

        blocked_solution = self._create_solution(self.participant, 'Participant answer should be blocked.')
        self.assertEqual(blocked_solution.status_code, status.HTTP_403_FORBIDDEN, blocked_solution.data)
        self.assertEqual(blocked_solution.data['code'], 'protected_newcomer_answer_required')
        self.assertFalse(Solution.objects.filter(user=self.participant, question=self.question).exists())

        expert_solution = self._create_solution(self.expert, 'Expert answer should be accepted during protection.')
        self.assertEqual(expert_solution.status_code, status.HTTP_201_CREATED, expert_solution.data)
        self.assertTrue(Solution.objects.filter(user=self.expert, question=self.question).exists())

        blocked_downvote = self._cast_question_vote(self.participant, Vote.VoteType.DOWNVOTE)
        self.assertEqual(blocked_downvote.status_code, status.HTTP_403_FORBIDDEN, blocked_downvote.data)
        self.assertEqual(blocked_downvote.data['code'], QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED)
        self.assertEqual(VoteService.get_vote_stats('question', str(self.question.question_id))['downvotes'], 0)

        allowed_upvote = self._cast_question_vote(self.participant, Vote.VoteType.UPVOTE)
        self.assertEqual(allowed_upvote.status_code, status.HTTP_201_CREATED, allowed_upvote.data)
        self.assertEqual(VoteService.get_vote_stats('question', str(self.question.question_id))['upvotes'], 1)

        Question.objects.filter(pk=self.question.pk).update(
            question_created_at=timezone.now() - timedelta(hours=13)
        )
        self.question.refresh_from_db()

        expired_state = QuestionProtectionService.get_protection_state(self.question)
        expired_answer = QuestionProtectionService.get_answer_eligibility(self.question, self.participant)
        expired_downvote = QuestionProtectionService.get_question_downvote_eligibility(self.question, self.participant)

        self.assertFalse(expired_state.is_protected)
        self.assertTrue(expired_answer.allowed)
        self.assertTrue(expired_downvote.allowed)

        expired_detail = self._get_question(self.participant)
        self.assertEqual(expired_detail.status_code, status.HTTP_200_OK, expired_detail.data)
        self.assertEqual(expired_detail.data['question_title'], 'Integrated protected newcomer question')
        self.assertIn('must stay readable', expired_detail.data['question_body'])
        self.assertFalse(expired_detail.data['is_protected'])
        self.assertTrue(expired_detail.data['viewer_can_answer'])
        self.assertTrue(expired_detail.data['viewer_can_downvote'])
        self.assertIsNone(expired_detail.data['protected_until'])

        participant_solution = self._create_solution(self.participant, 'Participant answer should be accepted after expiry.')
        self.assertEqual(participant_solution.status_code, status.HTTP_201_CREATED, participant_solution.data)
        self.assertTrue(Solution.objects.filter(user=self.participant, question=self.question).exists())

        allowed_downvote = self._cast_question_vote(self.participant, Vote.VoteType.DOWNVOTE)
        self.assertEqual(allowed_downvote.status_code, status.HTTP_200_OK, allowed_downvote.data)
        self.assertEqual(
            VoteService.get_vote_stats('question', str(self.question.question_id)),
            {'upvotes': 0, 'downvotes': 1, 'score': -1},
        )


class SolutionEditLifecycleTests(APITestCase):
    def setUp(self):
        self.question_author = CustomUser.objects.create_user(
            user_email='solution-question-owner@example.com',
            user_name='solution-question-owner',
            password='password',
        )
        self.solution_author = CustomUser.objects.create_user(
            user_email='solution-owner@example.com',
            user_name='solution-owner',
            password='password',
        )
        self.editor = CustomUser.objects.create_user(
            user_email='solution-editor@example.com',
            user_name='solution-editor',
            password='password',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='solution-other@example.com',
            user_name='solution-other',
            password='password',
        )
        self.question = Question.objects.create(
            user=self.question_author,
            question_title='Question for solution edits',
            question_body='Need to review proposed solution changes.',
        )
        self.solution = Solution.objects.create(
            user=self.solution_author,
            question=self.question,
            solution_body='Original solution body',
        )

    def test_solution_edit_approval_awards_reputation_once_with_source_reference(self):
        self.client.force_authenticate(self.editor)
        create_response = self.client.post(
            '/solution_edits/',
            {
                'solution': str(self.solution.solution_id),
                'solution_edit_body_after': 'Approved edit body',
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        solution_edit_id = create_response.data['solution_edit_id']
        solution_edit = SolutionEdits.objects.get(solution_edit_id=solution_edit_id)
        self.assertIsNone(solution_edit.solution_edit_is_approved)

        self.client.force_authenticate(self.solution_author)
        approve_response = self.client.patch(f'/solution_edits/approve/{solution_edit_id}/')

        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)
        self.assertEqual(approve_response.data, {'approved': True})
        self.solution.refresh_from_db()
        solution_edit.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertTrue(solution_edit.solution_edit_is_approved)
        self.assertEqual(self.solution.solution_body, 'Approved edit body')
        self.assertEqual(self.editor.user_reputation_score, SolutionEditService.APPROVED_EDIT_REPUTATION_AWARD)

        reputation_transaction = ReputationTransaction.objects.get(user=self.editor)
        self.assertEqual(reputation_transaction.reputation_transaction_reason, ReputationTransaction.TransactionReason.APPROVED_EDIT)
        self.assertEqual(reputation_transaction.reputation_transaction_amount, SolutionEditService.APPROVED_EDIT_REPUTATION_AWARD)
        self.assertEqual(reputation_transaction.actor_id, self.solution_author.user_id)
        self.assertEqual(reputation_transaction.content_type.model, 'solutionedits')
        self.assertEqual(reputation_transaction.object_id, solution_edit.pk)

    def test_solution_edit_rejection_does_not_mutate_content_or_reputation(self):
        solution_edit = SolutionEdits.objects.create(
            solution=self.solution,
            user=self.editor,
            solution_edit_body_before=self.solution.solution_body,
            solution_edit_body_after='Rejected edit body',
        )

        self.client.force_authenticate(self.solution_author)
        response = self.client.patch(f'/solution_edits/disapprove/{solution_edit.solution_edit_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {'approved': False})
        self.solution.refresh_from_db()
        solution_edit.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertFalse(solution_edit.solution_edit_is_approved)
        self.assertEqual(self.solution.solution_body, 'Original solution body')
        self.assertEqual(self.editor.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())

    def test_solution_edit_cannot_be_reviewed_twice_or_by_non_author(self):
        approved_edit = SolutionEdits.objects.create(
            solution=self.solution,
            user=self.editor,
            solution_edit_body_before=self.solution.solution_body,
            solution_edit_body_after='Approved once body',
        )
        SolutionEditService.change_approve(str(approved_edit.solution_edit_id), True, self.solution_author)

        self.editor.refresh_from_db()
        self.assertEqual(self.editor.user_reputation_score, SolutionEditService.APPROVED_EDIT_REPUTATION_AWARD)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.editor).count(), 1)

        self.client.force_authenticate(self.solution_author)
        repeated_response = self.client.patch(f'/solution_edits/disapprove/{approved_edit.solution_edit_id}/')
        self.assertEqual(repeated_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.editor.refresh_from_db()
        self.assertEqual(self.editor.user_reputation_score, SolutionEditService.APPROVED_EDIT_REPUTATION_AWARD)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.editor).count(), 1)

        pending_edit = SolutionEdits.objects.create(
            solution=self.solution,
            user=self.other_user,
            solution_edit_body_before=self.solution.solution_body,
            solution_edit_body_after='Pending body',
        )
        self.client.force_authenticate(self.other_user)
        forbidden_response = self.client.patch(f'/solution_edits/approve/{pending_edit.solution_edit_id}/')
        self.assertEqual(forbidden_response.status_code, status.HTTP_403_FORBIDDEN)
        pending_edit.refresh_from_db()
        self.assertIsNone(pending_edit.solution_edit_is_approved)
        self.assertFalse(ReputationTransaction.objects.filter(user=self.other_user).exists())

    def test_solution_edit_approval_rolls_back_if_ledger_write_fails(self):
        solution_edit = SolutionEdits.objects.create(
            solution=self.solution,
            user=self.editor,
            solution_edit_body_before=self.solution.solution_body,
            solution_edit_body_after='Rollback body',
        )

        with patch(
            'apps.qa.services.solution_edits_service.ReputationService.record_transaction',
            side_effect=RuntimeError('ledger failed'),
        ):
            with self.assertRaisesMessage(RuntimeError, 'ledger failed'):
                SolutionEditService.change_approve(str(solution_edit.solution_edit_id), True, self.solution_author)

        self.solution.refresh_from_db()
        solution_edit.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertEqual(self.solution.solution_body, 'Original solution body')
        self.assertIsNone(solution_edit.solution_edit_is_approved)
        self.assertEqual(self.editor.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())

    def test_author_direct_solution_edit_does_not_create_reputation_reward(self):
        self.client.force_authenticate(self.solution_author)
        response = self.client.post(
            '/solution_edits/',
            {
                'solution': str(self.solution.solution_id),
                'solution_edit_body_after': 'Author direct edit body',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.solution.refresh_from_db()
        self.solution_author.refresh_from_db()
        self.assertEqual(self.solution.solution_body, 'Author direct edit body')
        self.assertEqual(self.solution_author.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())
        self.assertTrue(SolutionEdits.objects.get(solution_edit_id=response.data['solution_edit_id']).solution_edit_is_approved)


class QuestionEligibleExpertsApiTests(APITestCase):
    def setUp(self):
        self.author = CustomUser.objects.create_user(
            user_email='eligible-author@example.com',
            user_name='eligible-author',
            password='password',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='eligible-other@example.com',
            user_name='eligible-other',
            password='password',
        )
        self.expert = self.create_user('eligible-alpha@example.com', 'AlphaExpert', 150)
        self.master = self.create_user('eligible-master@example.com', 'BetaMaster', 350)
        self.participant = self.create_user('eligible-participant@example.com', 'CandidateParticipant', 30)
        self.manual_expert = self.create_user(
            'manual-expert@example.com',
            'ManualExpert',
            0,
            manual_reputation_level=CustomUser.ReputationLevel.EXPERT,
        )
        self.question = self.create_question(created_at=timezone.now() - timedelta(hours=1))
        self.url = f'/question/{self.question.question_id}/eligible-experts/'

    def create_user(self, email, name, score, **extra_fields):
        user = CustomUser.objects.create_user(
            user_email=email,
            user_name=name,
            password='password',
            **extra_fields,
        )
        user.user_reputation_score = score
        user.save(update_fields=['user_reputation_score'])
        return user

    def create_question(self, *, author=None, created_at=None):
        question = Question.objects.create(
            user=author or self.author,
            question_title='Protected eligible experts question',
            question_body='Need expert candidates for the protected selector.',
        )
        if created_at is not None:
            Question.objects.filter(pk=question.pk).update(question_created_at=created_at)
            question.refresh_from_db()
        return question

    def get_candidate_names(self, response):
        return [candidate['user_name'] for candidate in response.data['results']]

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, response.data)

    def test_non_author_request_is_forbidden_with_reason_code(self):
        self.client.force_authenticate(self.other_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
        self.assertEqual(response.data['code'], QuestionExpertInvitationService.NOT_QUESTION_AUTHOR)

    def test_nonexistent_question_returns_not_found(self):
        self.client.force_authenticate(self.author)

        response = self.client.get('/question/00000000-0000-0000-0000-000000000000/eligible-experts/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.data)

    def test_inactive_protected_window_returns_stable_reason_code(self):
        expired_question = self.create_question(created_at=timezone.now() - timedelta(hours=13))
        self.client.force_authenticate(self.author)

        response = self.client.get(f'/question/{expired_question.question_id}/eligible-experts/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data['code'], QuestionExpertInvitationService.QUESTION_NOT_PROTECTED)

    def test_author_gets_paginated_candidates_metadata_and_no_email_leakage(self):
        self.client.force_authenticate(self.author)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(set(['count', 'next', 'previous', 'results']).issubset(response.data.keys()), True)
        self.assertEqual(response.data['question_id'], str(self.question.pk))
        self.assertEqual(response.data['max_invites'], 5)
        self.assertEqual(response.data['invited_count'], 0)
        self.assertEqual(response.data['remaining_slots'], 5)
        self.assertTrue(response.data['can_invite'])
        self.assertEqual(response.data['reason_code'], QuestionExpertInvitationService.SLOTS_AVAILABLE)
        self.assertEqual(
            self.get_candidate_names(response),
            ['BetaMaster', 'AlphaExpert', 'ManualExpert'],
        )
        for candidate in response.data['results']:
            self.assertIn('is_manual_override', candidate)
            self.assertNotIn('user_email', candidate)
            self.assertNotIn('email', candidate)
        manual_candidate = next(candidate for candidate in response.data['results'] if candidate['user_name'] == 'ManualExpert')
        self.assertTrue(manual_candidate['is_manual_override'])
        self.assertEqual(manual_candidate['reputation_level'], CustomUser.ReputationLevel.EXPERT)

    def test_search_filters_by_username_without_private_fields(self):
        self.client.force_authenticate(self.author)

        response = self.client.get(self.url, {'search': 'alpha'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.get_candidate_names(response), ['AlphaExpert'])
        self.assertNotIn('user_email', response.data['results'][0])

    def test_empty_and_short_search_are_safe(self):
        self.client.force_authenticate(self.author)

        empty_response = self.client.get(self.url, {'search': ''})
        short_response = self.client.get(self.url, {'search': 'a'})

        self.assertEqual(empty_response.status_code, status.HTTP_200_OK, empty_response.data)
        self.assertEqual(short_response.status_code, status.HTTP_200_OK, short_response.data)
        self.assertGreaterEqual(empty_response.data['count'], 3)
        for response in [empty_response, short_response]:
            for candidate in response.data['results']:
                self.assertNotIn('user_email', candidate)

    def test_author_non_experts_and_already_invited_users_are_excluded(self):
        Notification.objects.create(
            recipient=self.expert,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Existing invitation',
            message='Existing invitation.',
            source_question=self.question,
            dedupe_key=QuestionExpertInvitationService.build_dedupe_key(self.question.pk, self.expert.pk),
        )
        self.client.force_authenticate(self.author)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        names = self.get_candidate_names(response)
        self.assertNotIn(self.author.user_name, names)
        self.assertNotIn(self.participant.user_name, names)
        self.assertNotIn(self.expert.user_name, names)
        self.assertEqual(response.data['invited_count'], 1)
        self.assertEqual(response.data['remaining_slots'], 4)

    def test_zero_remaining_slots_keeps_metadata_and_candidates_exclude_invited(self):
        recipients = [self.expert, self.master, self.manual_expert]
        for index in range(2):
            recipients.append(self.create_user(f'eligible-extra-{index}@example.com', f'ExtraExpert{index}', 200 + index))

        for recipient in recipients:
            Notification.objects.create(
                recipient=recipient,
                notification_type=Notification.NotificationType.EXPERT_INVITATION,
                title='Existing invitation',
                message='Existing invitation.',
                source_question=self.question,
                dedupe_key=QuestionExpertInvitationService.build_dedupe_key(self.question.pk, recipient.pk),
            )
        self.client.force_authenticate(self.author)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['invited_count'], 5)
        self.assertEqual(response.data['remaining_slots'], 0)
        self.assertFalse(response.data['can_invite'])
        self.assertEqual(response.data['reason_code'], QuestionExpertInvitationService.MAX_INVITES_EXCEEDED)
        self.assertEqual(response.data['results'], [])


class QuestionExpertInvitationsApiTests(APITestCase):
    def setUp(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=6)
        self.author = CustomUser.objects.create_user(
            user_email='invite-author@example.com',
            user_name='invite-author',
            password='password',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='invite-other@example.com',
            user_name='invite-other',
            password='password',
        )
        self.expert = self.create_user('invite-expert@example.com', 'InviteExpert', 150)
        self.master = self.create_user('invite-master@example.com', 'InviteMaster', 350)
        self.participant = self.create_user('invite-participant@example.com', 'InviteParticipant', 30)
        self.newcomer = self.create_user('invite-newcomer@example.com', 'InviteNewcomer', 0)
        self.question = self.create_question(created_at=timezone.now() - timedelta(hours=1))
        self.url = f'/question/{self.question.question_id}/expert-invitations/'

    def create_user(self, email, name, score, **extra_fields):
        user = CustomUser.objects.create_user(
            user_email=email,
            user_name=name,
            password='password',
            **extra_fields,
        )
        user.user_reputation_score = score
        user.save(update_fields=['user_reputation_score'])
        return user

    def create_question(self, *, author=None, created_at=None):
        question = Question.objects.create(
            user=author or self.author,
            question_title='Protected expert invitation question',
            question_body='Need expert invitations for protected answer support.',
        )
        if created_at is not None:
            Question.objects.filter(pk=question.pk).update(question_created_at=created_at)
            question.refresh_from_db()
        return question

    def invite(self, recipients, *, actor=None, url=None):
        self.client.force_authenticate(actor or self.author)
        return self.client.post(
            url or self.url,
            {'recipient_ids': [str(recipient.pk) for recipient in recipients]},
            format='json',
        )

    def create_existing_invitation(self, recipient, *, question=None):
        question = question or self.question
        return Notification.objects.create(
            recipient=recipient,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Existing invitation',
            message='Existing invitation.',
            source_question=question,
            dedupe_key=QuestionExpertInvitationService.build_dedupe_key(question.pk, recipient.pk),
        )

    def assert_reason_code(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code, response.data)
        self.assertEqual(response.data['code'], code)

    def test_author_creates_multiple_expert_invitations_with_slot_and_notification_state(self):
        response = self.invite([self.expert, self.master])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['question_id'], str(self.question.pk))
        self.assertEqual(response.data['max_invites'], 5)
        self.assertEqual(response.data['invited_count'], 2)
        self.assertEqual(response.data['remaining_slots'], 3)
        self.assertEqual(response.data['created_count'], 2)
        self.assertEqual(len(response.data['invitations']), 2)

        notifications = Notification.objects.filter(
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            source_question=self.question,
        ).order_by('recipient__user_name')
        self.assertEqual(notifications.count(), 2)
        expected_expires_at = self.question.question_created_at + timedelta(hours=12)
        for notification in notifications:
            self.assertIn(notification.recipient_id, {self.expert.pk, self.master.pk})
            self.assertEqual(
                notification.dedupe_key,
                QuestionExpertInvitationService.build_dedupe_key(self.question.pk, notification.recipient_id),
            )
            self.assertAlmostEqual(notification.expires_at, expected_expires_at, delta=timedelta(seconds=1))
            self.assertIsInstance(notification.payload, dict)
            self.assertEqual(notification.payload['question_id'], str(self.question.pk))
            self.assertNotIn('user_email', notification.payload)

    def test_invitation_payload_contains_curated_question_author_ttl_and_protection_metadata(self):
        django_tag = Tag.objects.create(name='django')
        vue_tag = Tag.objects.create(name='vue')
        self.question.tags.add(vue_tag, django_tag)
        expected_expires_at = self.question.question_created_at + timedelta(hours=12)
        expected_protected_until = self.question.question_created_at + timedelta(hours=6)

        response = self.invite([self.expert])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        notification = Notification.objects.get(source_question=self.question, recipient=self.expert)
        payload = notification.payload
        self.assertEqual(response.data['invitations'][0]['payload'], payload)
        self.assertEqual(payload['question_id'], str(self.question.pk))
        self.assertEqual(payload['question_title'], self.question.question_title)
        self.assertEqual(payload['question_status'], Question.Status.OPEN_STATUS)
        self.assertEqual(payload['question_tags'], ['django', 'vue'])
        self.assertEqual(payload['author_id'], str(self.author.pk))
        self.assertEqual(payload['author_name'], self.author.user_name)
        self.assertEqual(payload['author_reputation_level'], CustomUser.ReputationLevel.NEWCOMER)
        self.assertEqual(payload['author_reputation_level_label'], CustomUser.ReputationLevel.NEWCOMER.label)
        self.assertEqual(payload['author_points_to_next_level'], 30)
        self.assertEqual(payload['author_next_level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(payload['recipient_id'], str(self.expert.pk))
        self.assertEqual(payload['recipient_reputation_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(payload['invitation_type'], Notification.NotificationType.EXPERT_INVITATION)
        self.assertEqual(payload['invitation_status'], 'active')
        self.assertEqual(payload['cta_url'], f'/questions/{self.question.pk}')
        self.assertEqual(payload['expires_at'], expected_expires_at.isoformat())
        self.assertTrue(payload['is_protected'])
        self.assertEqual(payload['protection_reason_code'], QuestionProtectionService.PROTECTED_NEWCOMER)
        self.assertEqual(payload['protected_until'], expected_protected_until.isoformat())
        self.assertFalse(payload['protected_window_ended'])
        self.assertNotIn('user_email', payload)
        self.assertNotIn('recipient_email', payload)

    def test_invitation_payload_serializes_untagged_questions_as_empty_tag_list(self):
        response = self.invite([self.expert])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        notification = Notification.objects.get(source_question=self.question, recipient=self.expert)
        self.assertEqual(notification.payload['question_tags'], [])

    def test_get_notifications_exposes_created_invitation_to_recipient(self):
        self.invite([self.expert])
        self.client.force_authenticate(self.expert)

        response = self.client.get('/notifications/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['count'], 1)
        invitation = response.data['results'][0]
        self.assertEqual(invitation['notification_type'], Notification.NotificationType.EXPERT_INVITATION)
        self.assertEqual(invitation['source_question_id'], str(self.question.pk))
        self.assertEqual(invitation['payload']['question_id'], str(self.question.pk))
        self.assertEqual(invitation['payload']['recipient_id'], str(self.expert.pk))
        self.assertEqual(invitation['invitation_status'], 'active')
        self.assertTrue(invitation['protected_window_active'])
        self.assertFalse(invitation['protected_window_ended'])
        self.assertEqual(invitation['protected_until'], (self.question.question_created_at + timedelta(hours=6)).isoformat())
        self.assertEqual(invitation['cta_url'], f'/questions/{self.question.pk}')

    def test_duplicate_recipient_ids_in_one_request_are_rejected_without_partial_writes(self):
        self.client.force_authenticate(self.author)
        response = self.client.post(
            self.url,
            {'recipient_ids': [str(self.expert.pk), str(self.expert.pk)]},
            format='json',
        )

        self.assert_reason_code(response, status.HTTP_400_BAD_REQUEST, QuestionExpertInvitationService.DUPLICATE_RECIPIENT)
        self.assertFalse(Notification.objects.exists())

    def test_already_invited_recipient_is_rejected_without_partial_writes(self):
        self.create_existing_invitation(self.expert)

        response = self.invite([self.expert, self.master])

        self.assert_reason_code(response, status.HTTP_400_BAD_REQUEST, QuestionExpertInvitationService.RECIPIENT_ALREADY_INVITED)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertFalse(Notification.objects.filter(recipient=self.master).exists())

    def test_max_five_total_cap_is_enforced_across_existing_and_new_invitations(self):
        existing = [
            self.expert,
            self.master,
            self.create_user('invite-extra-1@example.com', 'InviteExtra1', 200),
            self.create_user('invite-extra-2@example.com', 'InviteExtra2', 210),
        ]
        for recipient in existing:
            self.create_existing_invitation(recipient)
        new_one = self.create_user('invite-extra-3@example.com', 'InviteExtra3', 220)
        sixth = self.create_user('invite-extra-4@example.com', 'InviteExtra4', 230)

        success = self.invite([new_one])
        rejection = self.invite([sixth])

        self.assertEqual(success.status_code, status.HTTP_201_CREATED, success.data)
        self.assertEqual(success.data['remaining_slots'], 0)
        self.assert_reason_code(rejection, status.HTTP_400_BAD_REQUEST, QuestionExpertInvitationService.MAX_INVITES_EXCEEDED)
        self.assertEqual(Notification.objects.filter(source_question=self.question).count(), 5)

    def test_ineligible_participant_newcomer_self_and_unknown_recipients_are_rejected(self):
        missing_uuid = '00000000-0000-0000-0000-000000000000'
        cases = [
            [str(self.participant.pk)],
            [str(self.newcomer.pk)],
            [str(self.author.pk)],
            [missing_uuid],
        ]
        self.client.force_authenticate(self.author)
        for recipient_ids in cases:
            with self.subTest(recipient_ids=recipient_ids):
                response = self.client.post(self.url, {'recipient_ids': recipient_ids}, format='json')
                self.assert_reason_code(response, status.HTTP_400_BAD_REQUEST, QuestionExpertInvitationService.RECIPIENT_NOT_ELIGIBLE)
        self.assertFalse(Notification.objects.exists())

    def test_non_author_and_inactive_protected_window_are_rejected_with_stable_codes(self):
        non_author_response = self.invite([self.expert], actor=self.other_user)
        expired_question = self.create_question(created_at=timezone.now() - timedelta(hours=7))
        inactive_response = self.invite(
            [self.expert],
            url=f'/question/{expired_question.question_id}/expert-invitations/',
        )

        self.assert_reason_code(non_author_response, status.HTTP_403_FORBIDDEN, QuestionExpertInvitationService.NOT_QUESTION_AUTHOR)
        self.assert_reason_code(inactive_response, status.HTTP_400_BAD_REQUEST, QuestionExpertInvitationService.QUESTION_NOT_PROTECTED)
        self.assertFalse(Notification.objects.exists())

    def test_unauthenticated_nonexistent_question_and_malformed_shapes_are_rejected(self):
        unauthenticated = self.client.post(self.url, {'recipient_ids': [str(self.expert.pk)]}, format='json')
        self.client.force_authenticate(self.author)
        nonexistent = self.client.post(
            '/question/00000000-0000-0000-0000-000000000000/expert-invitations/',
            {'recipient_ids': [str(self.expert.pk)]},
            format='json',
        )
        malformed_cases = [
            {},
            {'recipient_ids': 'not-a-list'},
            {'recipient_ids': []},
            {'recipient_ids': ['not-a-uuid']},
            {'recipient_ids': [str(self.create_user(f'invite-over-{index}@example.com', f'InviteOver{index}', 250 + index).pk) for index in range(6)]},
        ]

        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED, unauthenticated.data)
        self.assertEqual(nonexistent.status_code, status.HTTP_404_NOT_FOUND, nonexistent.data)
        for payload in malformed_cases:
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format='json')
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(Notification.objects.exists())

    def test_invitation_notification_does_not_grant_participant_answer_permission(self):
        Notification.objects.create(
            recipient=self.participant,
            notification_type=Notification.NotificationType.EXPERT_INVITATION,
            title='Manual invitation for regression coverage',
            message='Regression fixture.',
            source_question=self.question,
            dedupe_key=QuestionExpertInvitationService.build_dedupe_key(self.question.pk, self.participant.pk),
        )
        self.client.force_authenticate(self.participant)
        blocked_response = self.client.post(
            '/solution/',
            {'question': str(self.question.question_id), 'solution_body': 'Participant should remain blocked.'},
            format='json',
        )
        self.client.force_authenticate(self.expert)
        allowed_response = self.client.post(
            '/solution/',
            {'question': str(self.question.question_id), 'solution_body': 'Expert remains allowed.'},
            format='json',
        )

        self.assertEqual(blocked_response.status_code, status.HTTP_403_FORBIDDEN, blocked_response.data)
        self.assertEqual(blocked_response.data['code'], 'protected_newcomer_answer_required')
        self.assertFalse(Solution.objects.filter(user=self.participant, question=self.question).exists())
        self.assertEqual(allowed_response.status_code, status.HTTP_201_CREATED, allowed_response.data)
        self.assertTrue(Solution.objects.filter(user=self.expert, question=self.question).exists())


class QuestionExpertInvitedExpertsApiTests(APITestCase):
    def setUp(self):
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=6)
        self.author = CustomUser.objects.create_user(
            user_email='invited-author@example.com',
            user_name='invited-author',
            password='password',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='invited-other@example.com',
            user_name='invited-other',
            password='password',
        )
        self.expert = self.create_user('invited-expert@example.com', 'InvitedExpert', 150)
        self.master = self.create_user('invited-master@example.com', 'InvitedMaster', 350)
        self.other_question_expert = self.create_user('other-question-expert@example.com', 'OtherQuestionExpert', 200)
        self.question = self.create_question(created_at=timezone.now() - timedelta(hours=1))
        self.url = f'/question/{self.question.question_id}/expert-invitations/'

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
            question_title='Protected invited experts question',
            question_body='Need invited experts read contract coverage.',
        )
        if created_at is not None:
            Question.objects.filter(pk=question.pk).update(question_created_at=created_at)
            question.refresh_from_db()
        return question

    def create_existing_invitation(self, recipient, *, question=None, read_at=None, notification_type=None):
        question = question or self.question
        return Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type or Notification.NotificationType.EXPERT_INVITATION,
            title='Existing invitation',
            message='Existing invitation.',
            payload={
                'question_id': str(question.pk),
                'recipient_email': recipient.user_email,
                'raw_marker': 'must not leak through author GET',
            },
            source_question=question,
            read_at=read_at,
            expires_at=question.question_created_at + timedelta(hours=12),
            dedupe_key=QuestionExpertInvitationService.build_dedupe_key(question.pk, recipient.pk),
        )

    def authenticate_author(self):
        self.client.force_authenticate(self.author)

    def test_author_lists_invited_experts_with_read_and_protection_status(self):
        unread = self.create_existing_invitation(self.expert)
        read_at = timezone.now() - timedelta(minutes=5)
        read = self.create_existing_invitation(self.master, read_at=read_at)
        other_question = self.create_question(created_at=timezone.now() - timedelta(hours=1))
        self.create_existing_invitation(self.other_question_expert, question=other_question)
        self.authenticate_author()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['question_id'], str(self.question.pk))
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['invited_count'], 2)
        by_recipient_id = {item['recipient_id']: item for item in response.data['results']}
        self.assertEqual(set(by_recipient_id.keys()), {str(self.expert.pk), str(self.master.pk)})

        unread_item = by_recipient_id[str(self.expert.pk)]
        self.assertEqual(unread_item['recipient_name'], self.expert.user_name)
        self.assertEqual(unread_item['recipient_reputation_score'], 150)
        self.assertEqual(unread_item['reputation_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(unread_item['reputation_level_label'], CustomUser.ReputationLevel.EXPERT.label)
        self.assertEqual(unread_item['notification_id'], str(unread.pk))
        self.assertFalse(unread_item['is_read'])
        self.assertIsNone(unread_item['read_at'])
        self.assertEqual(unread_item['invitation_status'], 'active')
        self.assertTrue(unread_item['protected_window_active'])
        self.assertEqual(unread_item['protected_until'], (self.question.question_created_at + timedelta(hours=6)).isoformat())

        read_item = by_recipient_id[str(self.master.pk)]
        self.assertEqual(read_item['notification_id'], str(read.pk))
        self.assertTrue(read_item['is_read'])
        self.assertEqual(read_item['read_at'], read_at.isoformat().replace('+00:00', 'Z'))
        self.assertEqual(read_item['reputation_level'], CustomUser.ReputationLevel.MASTER)

        for item in response.data['results']:
            self.assertEqual(
                set(item.keys()),
                {
                    'recipient_id',
                    'recipient_name',
                    'recipient_reputation_score',
                    'reputation_level',
                    'reputation_level_label',
                    'notification_id',
                    'is_read',
                    'read_at',
                    'invitation_status',
                    'protected_window_active',
                    'protected_until',
                },
            )
            self.assertNotIn('user_email', item)
            self.assertNotIn('recipient_email', item)
            self.assertNotIn('payload', item)
            self.assertNotIn('dedupe_key', item)

    def test_author_get_empty_invitation_list_returns_paginated_envelope(self):
        self.authenticate_author()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['count'], 0)
        self.assertIsNone(response.data['next'])
        self.assertIsNone(response.data['previous'])
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['question_id'], str(self.question.pk))
        self.assertEqual(response.data['invited_count'], 0)

    def test_get_rejects_unauthenticated_non_author_and_nonexistent_question(self):
        unauthenticated = self.client.get(self.url)
        self.client.force_authenticate(self.other_user)
        non_author = self.client.get(self.url)
        self.authenticate_author()
        nonexistent = self.client.get('/question/00000000-0000-0000-0000-000000000000/expert-invitations/')

        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED, unauthenticated.data)
        self.assertEqual(non_author.status_code, status.HTTP_403_FORBIDDEN, non_author.data)
        self.assertEqual(non_author.data['code'], QuestionExpertInvitationService.NOT_QUESTION_AUTHOR)
        self.assertEqual(nonexistent.status_code, status.HTTP_404_NOT_FOUND, nonexistent.data)


class OpenApiSchemaTests(APITestCase):
    def test_question_list_schema_uses_paginated_envelope(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        question_list_schema_ref = (
            schema['paths']['/question/']['get']['responses']['200']['content']['application/json']['schema']['$ref']
        )

        self.assertEqual(question_list_schema_ref, '#/components/schemas/PaginatedQuestionListList')
        paginated_schema = schema['components']['schemas']['PaginatedQuestionListList']
        self.assertEqual(paginated_schema['type'], 'object')
        self.assertEqual(
            set(paginated_schema['properties'].keys()),
            {'count', 'next', 'previous', 'results'},
        )
        self.assertEqual(
            paginated_schema['properties']['results']['items']['$ref'],
            '#/components/schemas/QuestionList',
        )


    def test_eligible_experts_schema_exposes_path_search_and_stable_envelope(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        operation = schema['paths']['/question/{question_id}/eligible-experts/']['get']

        parameter_names = {(parameter['in'], parameter['name']) for parameter in operation['parameters']}
        self.assertIn(('query', 'search'), parameter_names)
        response_schema_ref = operation['responses']['200']['content']['application/json']['schema']['$ref']
        self.assertEqual(response_schema_ref, '#/components/schemas/EligibleExpertsResponse')
        response_schema = schema['components']['schemas']['EligibleExpertsResponse']
        self.assertEqual(
            set(response_schema['properties'].keys()),
            {
                'count',
                'next',
                'previous',
                'results',
                'question_id',
                'max_invites',
                'invited_count',
                'remaining_slots',
                'can_invite',
                'reason_code',
            },
        )
        candidate_ref = response_schema['properties']['results']['items']['$ref']
        candidate_schema = schema['components']['schemas'][candidate_ref.split('/')[-1]]
        self.assertNotIn('user_email', candidate_schema['properties'])

    def test_expert_invitations_schema_exposes_get_and_post_contract(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        path = schema['paths']['/question/{question_id}/expert-invitations/']
        get_operation = path['get']
        post_operation = path['post']

        get_response_schema_ref = get_operation['responses']['200']['content']['application/json']['schema']['$ref']
        self.assertEqual(get_response_schema_ref, '#/components/schemas/ExpertInvitationListResponse')
        get_response_schema = schema['components']['schemas']['ExpertInvitationListResponse']
        self.assertEqual(
            set(get_response_schema['properties'].keys()),
            {
                'count',
                'next',
                'previous',
                'results',
                'question_id',
                'invited_count',
            },
        )
        invited_item_ref = get_response_schema['properties']['results']['items']['$ref']
        invited_item_schema = schema['components']['schemas'][invited_item_ref.split('/')[-1]]
        self.assertEqual(
            set(invited_item_schema['properties'].keys()),
            {
                'recipient_id',
                'recipient_name',
                'recipient_reputation_score',
                'reputation_level',
                'reputation_level_label',
                'notification_id',
                'is_read',
                'read_at',
                'invitation_status',
                'protected_window_active',
                'protected_until',
            },
        )
        self.assertNotIn('user_email', invited_item_schema['properties'])
        self.assertNotIn('recipient_email', invited_item_schema['properties'])
        self.assertNotIn('payload', invited_item_schema['properties'])
        self.assertNotIn('dedupe_key', invited_item_schema['properties'])

        request_schema_ref = post_operation['requestBody']['content']['application/json']['schema']['$ref']
        response_schema_ref = post_operation['responses']['201']['content']['application/json']['schema']['$ref']
        self.assertEqual(request_schema_ref, '#/components/schemas/ExpertInvitationCreateRequest')
        self.assertEqual(response_schema_ref, '#/components/schemas/ExpertInvitationCreateResponse')
        response_schema = schema['components']['schemas']['ExpertInvitationCreateResponse']
        self.assertEqual(
            set(response_schema['properties'].keys()),
            {
                'question_id',
                'max_invites',
                'invited_count',
                'remaining_slots',
                'created_count',
                'invitations',
            },
        )
        invitation_ref = response_schema['properties']['invitations']['items']['$ref']
        invitation_schema = schema['components']['schemas'][invitation_ref.split('/')[-1]]
        self.assertEqual(
            set(invitation_schema['properties'].keys()),
            {'recipient_id', 'notification_id', 'dedupe_key', 'expires_at', 'payload'},
        )


class QuestionEditServiceTests(APITestCase):
    def setUp(self):
        self.author = CustomUser.objects.create_user(
            user_email='question-owner@example.com',
            user_name='question-owner',
            password='password',
        )
        self.editor = CustomUser.objects.create_user(
            user_email='question-editor@example.com',
            user_name='question-editor',
            password='password',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='question-other@example.com',
            user_name='question-other',
            password='password',
        )
        self.django_tag = Tag.objects.create(name='django', questions_count=0)
        self.rest_tag = Tag.objects.create(name='rest', questions_count=0)
        self.question = Question.objects.create(
            user=self.author,
            question_title='Original title',
            question_body='Original body',
        )
        self.question.tags.add(self.django_tag)
        Tag.objects.filter(name='django').update(questions_count=1)

    def test_author_direct_edit_updates_question_tags_revision_and_event(self):
        self.client.force_authenticate(self.author)

        response = self.client.put(
            f'/question/{self.question.question_id}/',
            {
                'question_title': 'Updated title',
                'question_body': 'Updated body',
                'tags': ['rest', 'python-api'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['question_title'], 'Updated title')
        self.assertEqual(response.data['question_body'], 'Updated body')
        self.assertEqual(response.data['tags'], [
            {'name': 'rest', 'questions_count': 1},
            {'name': 'python-api', 'questions_count': 1},
        ])
        self.assertEqual(response.data['upvotes'], 0)
        self.assertEqual(response.data['downvotes'], 0)
        self.assertEqual(response.data['score'], 0)
        self.assertIsNone(response.data['user_vote'])
        self.question.refresh_from_db()
        self.assertEqual(self.question.question_title, 'Updated title')
        self.assertEqual(self.question.question_body, 'Updated body')
        self.assertEqual(set(self.question.tags.values_list('name', flat=True)), {'rest', 'python-api'})

        revision = QuestionRevision.objects.get(question=self.question)
        self.assertEqual(revision.source, QuestionRevision.Source.DIRECT_EDIT)
        self.assertEqual(revision.title_before, 'Original title')
        self.assertEqual(revision.title_after, 'Updated title')
        self.assertEqual(revision.tags_before, ['django'])
        self.assertEqual(revision.tags_after, ['rest', 'python-api'])

        event = QuestionEditEvent.objects.get(question=self.question)
        self.assertEqual(event.event_type, QuestionEditEvent.EventType.DIRECT_EDITED)
        self.assertEqual(Tag.objects.get(name='django').questions_count, 0)
        self.assertEqual(Tag.objects.get(name='rest').questions_count, 1)
        self.assertEqual(Tag.objects.get(name='python-api').questions_count, 1)

    def test_non_author_can_submit_proposal_and_author_can_approve_atomically(self):
        self.client.force_authenticate(self.editor)
        propose_response = self.client.post(
            '/question/propose_edit/',
            {
                'question': str(self.question.question_id),
                'question_title': 'Proposed title',
                'question_body': 'Proposed body',
                'tags': ['django', 'drf'],
            },
            format='json',
        )

        self.assertEqual(propose_response.status_code, status.HTTP_201_CREATED, propose_response.data)
        proposal_id = propose_response.data['question_edit_id']
        proposal = QuestionEditProposal.objects.get(question_edit_id=proposal_id)
        self.assertIsNone(proposal.question_edit_is_approved)
        self.assertEqual(proposal.question_edit_tags_before, ['django'])
        self.assertEqual(proposal.question_edit_tags_after, ['django', 'drf'])

        self.client.force_authenticate(self.author)
        approve_response = self.client.patch(f'/question/approve_edit/{proposal_id}/')

        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)
        self.question.refresh_from_db()
        proposal.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertTrue(proposal.question_edit_is_approved)
        self.assertEqual(self.question.question_title, 'Proposed title')
        self.assertEqual(self.question.question_body, 'Proposed body')
        self.assertEqual(set(self.question.tags.values_list('name', flat=True)), {'django', 'drf'})

        revision = QuestionRevision.objects.get(proposal=proposal)
        self.assertEqual(revision.source, QuestionRevision.Source.APPROVED_PROPOSAL)
        self.assertEqual(revision.tags_after, ['django', 'drf'])
        self.assertEqual(
            list(QuestionEditEvent.objects.filter(question=self.question).order_by('created_at').values_list('event_type', flat=True)),
            [QuestionEditEvent.EventType.PROPOSED, QuestionEditEvent.EventType.APPROVED],
        )
        self.assertEqual(self.editor.user_reputation_score, QuestionEditService.APPROVED_EDIT_REPUTATION_AWARD)
        reputation_transaction = ReputationTransaction.objects.get(user=self.editor)
        self.assertEqual(reputation_transaction.reputation_transaction_reason, ReputationTransaction.TransactionReason.APPROVED_EDIT)
        self.assertEqual(reputation_transaction.reputation_transaction_amount, QuestionEditService.APPROVED_EDIT_REPUTATION_AWARD)
        self.assertEqual(reputation_transaction.actor_id, self.author.user_id)
        self.assertEqual(reputation_transaction.content_type.model, 'questioneditproposal')
        self.assertEqual(reputation_transaction.object_id, proposal.pk)

    def test_frontend_question_edits_routes_match_browser_contract(self):
        self.client.force_authenticate(self.editor)
        propose_response = self.client.post(
            '/question_edits/',
            {
                'question': str(self.question.question_id),
                'question_edit_title_after': 'Frontend proposed title',
                'question_edit_body_after': 'Frontend proposed body',
                'tags': ['django', 'frontend'],
            },
            format='json',
        )

        self.assertEqual(propose_response.status_code, status.HTTP_201_CREATED, propose_response.data)
        self.assertEqual(propose_response.data['question_title'], 'Original title')
        self.assertEqual(propose_response.data['question_author_id'], str(self.author.user_id))
        self.assertEqual(propose_response.data['question_author_name'], self.author.user_name)
        self.assertEqual(propose_response.data['user'], str(self.editor.user_id))
        self.assertEqual(propose_response.data['edit_author_id'], str(self.editor.user_id))
        self.assertEqual(propose_response.data['edit_author_name'], self.editor.user_name)
        self.assertEqual(propose_response.data['question_edit_title_after'], 'Frontend proposed title')
        self.assertEqual(propose_response.data['question_edit_tags_after'], ['django', 'frontend'])
        proposal_id = propose_response.data['question_edit_id']

        self.client.force_authenticate(self.author)
        review_response = self.client.get('/question_edits/review_queue/')
        approve_response = self.client.patch(f'/question_edits/approve/{proposal_id}/')

        self.assertEqual(review_response.status_code, status.HTTP_200_OK, review_response.data)
        self.assertEqual(review_response.data[0]['question_edit_id'], proposal_id)
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)
        self.assertEqual(approve_response.data, {'approved': True})
        self.question.refresh_from_db()
        self.assertEqual(self.question.question_title, 'Frontend proposed title')
        self.assertEqual(set(self.question.tags.values_list('name', flat=True)), {'django', 'frontend'})

    def test_author_can_reject_proposal_without_mutating_question(self):
        proposal = QuestionEditService.create_proposal(
            question=self.question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Rejected title',
                body='Rejected body',
                tags=['rest'],
            ),
        )

        self.client.force_authenticate(self.author)
        response = self.client.patch(f'/question/reject_edit/{proposal.question_edit_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        proposal.refresh_from_db()
        self.question.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertFalse(proposal.question_edit_is_approved)
        self.assertEqual(self.question.question_title, 'Original title')
        self.assertEqual(set(self.question.tags.values_list('name', flat=True)), {'django'})
        self.assertFalse(QuestionRevision.objects.filter(proposal=proposal).exists())
        self.assertEqual(self.editor.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())
        self.assertEqual(
            list(QuestionEditEvent.objects.filter(question=self.question).order_by('created_at').values_list('event_type', flat=True)),
            [QuestionEditEvent.EventType.PROPOSED, QuestionEditEvent.EventType.REJECTED],
        )

    def test_non_author_cannot_direct_edit_question(self):
        self.client.force_authenticate(self.editor)

        response = self.client.put(
            f'/question/{self.question.question_id}/',
            {
                'question_title': 'Hack title',
                'question_body': 'Hack body',
                'tags': ['django'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_author_cannot_create_proposal_for_own_question(self):
        self.client.force_authenticate(self.author)

        response = self.client.post(
            '/question/propose_edit/',
            {
                'question': str(self.question.question_id),
                'question_title': 'Self proposal',
                'question_body': 'Self proposal body',
                'tags': ['django'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pending_proposal_cannot_be_reviewed_twice(self):
        proposal = QuestionEditService.create_proposal(
            question=self.question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Review once',
                body='Review once body',
                tags=['rest'],
            ),
        )
        QuestionEditService.change_proposal_approval(
            proposal_id=str(proposal.question_edit_id),
            actor=self.author,
            approved=True,
        )

        self.client.force_authenticate(self.author)
        response = self.client.patch(f'/question/reject_edit/{proposal.question_edit_id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.editor.refresh_from_db()
        self.assertEqual(self.editor.user_reputation_score, QuestionEditService.APPROVED_EDIT_REPUTATION_AWARD)
        self.assertEqual(ReputationTransaction.objects.filter(user=self.editor).count(), 1)

    def test_approval_reputation_rolls_back_if_ledger_write_fails(self):
        proposal = QuestionEditService.create_proposal(
            question=self.question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Rollback title',
                body='Rollback body',
                tags=['rest'],
            ),
        )

        with patch(
            'apps.qa.services.question_edit_service.ReputationService.record_transaction',
            side_effect=RuntimeError('ledger failed'),
        ):
            with self.assertRaisesMessage(RuntimeError, 'ledger failed'):
                QuestionEditService.change_proposal_approval(
                    proposal_id=str(proposal.question_edit_id),
                    actor=self.author,
                    approved=True,
                )

        proposal.refresh_from_db()
        self.question.refresh_from_db()
        self.editor.refresh_from_db()
        self.assertIsNone(proposal.question_edit_is_approved)
        self.assertEqual(self.question.question_title, 'Original title')
        self.assertEqual(self.question.question_body, 'Original body')
        self.assertEqual(set(self.question.tags.values_list('name', flat=True)), {'django'})
        self.assertEqual(self.editor.user_reputation_score, 0)
        self.assertFalse(ReputationTransaction.objects.exists())
        self.assertFalse(QuestionRevision.objects.filter(proposal=proposal).exists())
        self.assertEqual(
            list(QuestionEditEvent.objects.filter(question=self.question).values_list('event_type', flat=True)),
            [QuestionEditEvent.EventType.PROPOSED],
        )

    def test_invalid_tags_reject_direct_edit_without_partial_apply(self):
        self.client.force_authenticate(self.author)

        response = self.client.put(
            f'/question/{self.question.question_id}/',
            {
                'question_title': 'Still original title?',
                'question_body': 'Still original body?',
                'tags': ['bad tag'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.question.refresh_from_db()
        self.assertEqual(self.question.question_title, 'Original title')
        self.assertEqual(self.question.question_body, 'Original body')
        self.assertEqual(set(self.question.tags.values_list('name', flat=True)), {'django'})

    def test_revision_history_returns_empty_list_for_question_without_revisions(self):
        self.client.force_authenticate(self.author)

        response = self.client.get(f'/question/history/{self.question.question_id}/revisions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, [])

    def test_history_endpoints_expose_event_and_revision_records(self):
        QuestionEditService.direct_edit(
            question=self.question,
            actor=self.author,
            payload=QuestionChangePayload(
                title='Direct title',
                body='Direct body',
                tags=['rest'],
            ),
        )
        proposal = QuestionEditService.create_proposal(
            question=self.question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Proposed title',
                body='Proposed body',
                tags=['rest', 'api'],
            ),
        )
        QuestionEditService.change_proposal_approval(
            proposal_id=str(proposal.question_edit_id),
            actor=self.author,
            approved=True,
        )

        self.client.force_authenticate(self.author)
        events_response = self.client.get(f'/question/history/{self.question.question_id}/events/')
        revisions_response = self.client.get(f'/question/history/{self.question.question_id}/revisions/')

        self.assertEqual(events_response.status_code, status.HTTP_200_OK, events_response.data)
        self.assertEqual(revisions_response.status_code, status.HTTP_200_OK, revisions_response.data)
        self.assertEqual(
            [event['event_type'] for event in events_response.data],
            [
                QuestionEditEvent.EventType.DIRECT_EDITED,
                QuestionEditEvent.EventType.PROPOSED,
                QuestionEditEvent.EventType.APPROVED,
            ],
        )
        self.assertEqual(
            [revision['source'] for revision in revisions_response.data],
            [QuestionRevision.Source.DIRECT_EDIT, QuestionRevision.Source.APPROVED_PROPOSAL],
        )
        self.assertEqual(revisions_response.data[1]['tags_before'], ['rest'])
        self.assertEqual(revisions_response.data[1]['tags_after'], ['rest', 'api'])

    def test_review_queue_only_lists_pending_proposals_for_author(self):
        pending_for_author = QuestionEditService.create_proposal(
            question=self.question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Pending title',
                body='Pending body',
                tags=['rest'],
            ),
        )
        approved_for_author = QuestionEditService.create_proposal(
            question=self.question,
            actor=self.other_user,
            payload=QuestionChangePayload(
                title='Approved title',
                body='Approved body',
                tags=['api'],
            ),
        )
        QuestionEditService.change_proposal_approval(
            proposal_id=str(approved_for_author.question_edit_id),
            actor=self.author,
            approved=True,
        )
        other_question = Question.objects.create(
            user=self.editor,
            question_title='Another question',
            question_body='Review queue should scope by author.',
        )
        QuestionEditService.create_proposal(
            question=other_question,
            actor=self.author,
            payload=QuestionChangePayload(
                title='Other pending title',
                body='Other pending body',
                tags=['rest'],
            ),
        )

        self.client.force_authenticate(self.author)
        response = self.client.get('/question/review_queue/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([item['question_edit_id'] for item in response.data], [str(pending_for_author.question_edit_id)])
        self.assertEqual(response.data[0]['question_author_name'], self.author.user_name)
        self.assertEqual(response.data[0]['edit_author_name'], self.editor.user_name)
