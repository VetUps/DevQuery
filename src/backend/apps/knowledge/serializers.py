from rest_framework import serializers


class GraphStateSerializer(serializers.Serializer):
    status = serializers.CharField()
    stale_reason = serializers.CharField(allow_blank=True)
    last_error_message = serializers.CharField(allow_blank=True)
    last_failed_phase = serializers.CharField(allow_blank=True)
    last_rebuild_started_at = serializers.DateTimeField(allow_null=True)
    last_rebuild_finished_at = serializers.DateTimeField(allow_null=True)


class ViewerSerializer(serializers.Serializer):
    is_owner = serializers.BooleanField()


class ActivityBreakdownEntrySerializer(serializers.Serializer):
    activity_type = serializers.CharField()
    total_weight = serializers.DecimalField(max_digits=12, decimal_places=4)
    source_count = serializers.IntegerField(min_value=0)


class RelatedQuestionSummarySerializer(serializers.Serializer):
    question_id = serializers.UUIDField()
    title = serializers.CharField()
    status = serializers.CharField()


class UserGraphConceptEntrySerializer(serializers.Serializer):
    concept_id = serializers.IntegerField()
    slug = serializers.CharField()
    name = serializers.CharField()
    source = serializers.CharField()
    provider = serializers.CharField(allow_blank=True)
    confidence = serializers.DecimalField(max_digits=5, decimal_places=4)
    total_weight = serializers.DecimalField(max_digits=12, decimal_places=4)
    source_count = serializers.IntegerField(min_value=0)
    activity_breakdown = ActivityBreakdownEntrySerializer(many=True)
    related_questions = RelatedQuestionSummarySerializer(many=True)


class UserGraphResponseSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    viewer = ViewerSerializer()
    state = GraphStateSerializer()
    total_weight = serializers.DecimalField(max_digits=12, decimal_places=4)
    activity_breakdown = ActivityBreakdownEntrySerializer(many=True)
    concepts = UserGraphConceptEntrySerializer(many=True)


class QuestionConceptTagSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class QuestionGraphConceptEntrySerializer(serializers.Serializer):
    concept_id = serializers.IntegerField()
    slug = serializers.CharField()
    name = serializers.CharField()
    concept_source = serializers.CharField()
    concept_provider = serializers.CharField(allow_blank=True)
    tag = QuestionConceptTagSerializer(allow_null=True)
    source = serializers.CharField()
    provider = serializers.CharField(allow_blank=True)
    confidence = serializers.DecimalField(max_digits=5, decimal_places=4)


class QuestionGraphResponseSerializer(serializers.Serializer):
    question_id = serializers.UUIDField()
    title = serializers.CharField()
    status = serializers.CharField()
    concepts = QuestionGraphConceptEntrySerializer(many=True)
