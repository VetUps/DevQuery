from django.db import IntegrityError, transaction
from django.db.models import F

from ..models import Question, Tag


class QuestionTagService:
    @staticmethod
    def attach_tags_to_question(question: Question, tag_names: list[str]) -> None:
        """
        Attach normalized unique tag names to a saved question and increment stored
        question counters exactly once per associated tag.
        """
        unique_tag_names = list(dict.fromkeys(tag_names))

        if not unique_tag_names:
            return

        tags = [QuestionTagService._get_or_create_tag(tag_name) for tag_name in unique_tag_names]
        question.tags.add(*tags)
        Tag.objects.filter(pk__in=[tag.pk for tag in tags]).update(
            questions_count=F('questions_count') + 1
        )

        if hasattr(question, '_prefetched_objects_cache'):
            question._prefetched_objects_cache.pop('tags', None)

    @staticmethod
    def _get_or_create_tag(tag_name: str) -> Tag:
        try:
            return Tag.objects.get(name=tag_name)
        except Tag.DoesNotExist:
            try:
                with transaction.atomic():
                    return Tag.objects.create(name=tag_name)
            except IntegrityError:
                return Tag.objects.get(name=tag_name)
