from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.services import UserConceptActivityRebuildError, rebuild_user_concept_activity


class Command(BaseCommand):
    help = 'Rebuild durable user concept activity from questions, solutions, and positive reputation ledger facts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            dest='user_id',
            help='Optional user UUID to rebuild instead of rebuilding all users.',
        )

    def handle(self, *args, **options):
        user_id = options.get('user_id')
        if user_id:
            User = get_user_model()
            try:
                User.objects.only('pk').get(pk=user_id)
            except (User.DoesNotExist, ValidationError, ValueError) as exc:
                raise CommandError('User not found for --user-id') from exc

        try:
            summary = rebuild_user_concept_activity(user_id=user_id or None)
        except UserConceptActivityRebuildError as exc:
            raise CommandError('User concept activity rebuild failed') from exc

        fields = ' '.join(f'{name}={value}' for name, value in summary.as_stdout_fields().items())
        self.stdout.write(self.style.SUCCESS(f'User concept activity rebuild complete: {fields}'))
