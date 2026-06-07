# Кратко: запускает служебную команду для графа знаний.
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.services import KnowledgeGraphBuildError, rebuild_structural_graph
from apps.qa.models import Question


class Command(BaseCommand):
    help = 'Rebuild durable question knowledge graph structure from current question tags.'

    def add_arguments(self, parser):
        """Создаёт данные add arguments."""
        parser.add_argument(
            '--question-id',
            dest='question_id',
            help='Optional question UUID to rebuild instead of rebuilding all questions.',
        )

    def handle(self, *args, **options):
        """Запускает основную логику management-команды."""
        question_id = options.get('question_id')
        queryset = Question.objects.all().order_by('pk')

        if question_id:
            try:
                question = Question.objects.get(pk=question_id)
            except (Question.DoesNotExist, ValidationError, ValueError) as exc:
                raise CommandError('Question not found for --question-id') from exc
            queryset = Question.objects.filter(pk=question.pk)

        try:
            summary = rebuild_structural_graph(queryset=queryset)
        except KnowledgeGraphBuildError as exc:
            raise CommandError('Knowledge graph rebuild failed') from exc

        fields = ' '.join(f'{name}={value}' for name, value in summary.as_stdout_fields().items())
        self.stdout.write(self.style.SUCCESS(f'Knowledge graph rebuild complete: {fields}'))
