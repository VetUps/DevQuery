from rest_framework import serializers


class _RedactedReprKey(str):
    """String key that preserves lookup equality while avoiding unsafe substrings in repr()."""

    def __new__(cls, value, safe_repr):
        instance = super().__new__(cls, value)
        instance.safe_repr = safe_repr
        return instance

    def __repr__(self):
        return repr(self.safe_repr)


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


class UserGraphNodeSerializer(UserGraphConceptEntrySerializer):
    """Explicit graph topology node entry matching the aggregate concept shape."""


class KnowledgeGraphEdgeSerializer(serializers.Serializer):
    id = serializers.CharField()
    source_concept_id = serializers.IntegerField()
    target_concept_id = serializers.IntegerField()
    weight = serializers.DecimalField(max_digits=12, decimal_places=4)
    shared_question_count = serializers.IntegerField(min_value=1)
    reason = serializers.CharField()
    related_questions = RelatedQuestionSummarySerializer(many=True)


class KnowledgeGraphSemanticEdgeSerializer(serializers.Serializer):
    id = serializers.CharField()
    source_concept_id = serializers.IntegerField()
    target_concept_id = serializers.IntegerField()
    weight = serializers.DecimalField(max_digits=6, decimal_places=5)
    similarity_score = serializers.DecimalField(max_digits=6, decimal_places=5)
    confidence = serializers.DecimalField(max_digits=6, decimal_places=5)
    rank = serializers.IntegerField(min_value=1)
    reason = serializers.CharField()
    evidence = serializers.DictField()


class KnowledgeGraphSemanticGroupMemberSerializer(serializers.Serializer):
    concept_id = serializers.IntegerField()
    slug = serializers.CharField()
    name = serializers.CharField()
    rank = serializers.IntegerField(min_value=1)
    confidence = serializers.DecimalField(max_digits=5, decimal_places=4)
    evidence = serializers.DictField()


class KnowledgeGraphSemanticGroupSerializer(serializers.Serializer):
    group_key = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    rationale = serializers.CharField(allow_blank=True)
    confidence = serializers.DecimalField(max_digits=5, decimal_places=4)
    generated_at = serializers.DateTimeField()
    evidence = serializers.DictField()
    members = KnowledgeGraphSemanticGroupMemberSerializer(many=True)


class KnowledgeGraphLayoutPositionSerializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()


class KnowledgeGraphLayoutSerializer(serializers.Serializer):
    schema_version = serializers.IntegerField(min_value=1)
    positions = serializers.DictField(child=KnowledgeGraphLayoutPositionSerializer())
    updated_at = serializers.DateTimeField(allow_null=True)


class KnowledgeGraphLayoutSaveSerializer(serializers.Serializer):
    schema_version = serializers.IntegerField(min_value=1, default=1)
    positions = serializers.DictField(child=KnowledgeGraphLayoutPositionSerializer())


class UserGraphSemanticStateSerializer(serializers.Serializer):
    status = serializers.CharField()
    reason_code = serializers.CharField(allow_blank=True)
    phase = serializers.CharField(allow_blank=True)
    enabled = serializers.BooleanField()
    dry_run = serializers.BooleanField()
    source_provider = serializers.CharField(allow_blank=True)
    source_model = serializers.CharField(allow_blank=True)
    grouping_provider = serializers.CharField(allow_blank=True)
    grouping_model = serializers.CharField(allow_blank=True)
    source_item_count = serializers.IntegerField(min_value=0)
    total_source_count = serializers.IntegerField(min_value=0, required=False)
    changed_source_count = serializers.IntegerField(min_value=0, required=False)
    provider_called_source_count = serializers.IntegerField(min_value=0, required=False)
    reused_snapshot_count = serializers.IntegerField(min_value=0, required=False)
    persisted_snapshot_count = serializers.IntegerField(min_value=0, required=False)
    neighbour_candidate_count = serializers.IntegerField(min_value=0, required=False)
    semantic_group_count = serializers.IntegerField(min_value=0, required=False)
    semantic_group_membership_count = serializers.IntegerField(min_value=0, required=False)
    estimated_token_count = serializers.IntegerField(min_value=0)
    estimated_cost = serializers.DecimalField(max_digits=12, decimal_places=6)
    budget_cap = serializers.DecimalField(max_digits=12, decimal_places=6)
    last_error_message = serializers.CharField(allow_blank=True)
    started_at = serializers.DateTimeField(allow_null=True)
    finished_at = serializers.DateTimeField(allow_null=True)


class UserGraphResponseSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    viewer = ViewerSerializer()
    state = GraphStateSerializer()
    total_weight = serializers.DecimalField(max_digits=12, decimal_places=4)
    activity_breakdown = ActivityBreakdownEntrySerializer(many=True)
    concepts = UserGraphConceptEntrySerializer(many=True)
    nodes = UserGraphNodeSerializer(many=True)
    edges = KnowledgeGraphEdgeSerializer(many=True)
    layout = KnowledgeGraphLayoutSerializer(required=False)
    semantic_edges = KnowledgeGraphSemanticEdgeSerializer(many=True, required=False)
    semantic_groups = KnowledgeGraphSemanticGroupSerializer(many=True, required=False)


class InsightsGraphStateSerializer(serializers.Serializer):
    status = serializers.CharField()
    stale_reason = serializers.CharField(allow_blank=True)
    last_failed_phase = serializers.CharField(allow_blank=True)
    last_rebuild_started_at = serializers.DateTimeField(allow_null=True)
    last_rebuild_finished_at = serializers.DateTimeField(allow_null=True)


class InsightActionSerializer(serializers.Serializer):
    type = serializers.CharField()
    payload = serializers.DictField()


class InsightRecommendationSerializer(serializers.Serializer):
    id = serializers.CharField()
    priority = serializers.CharField()
    label = serializers.CharField()
    reason_code = serializers.CharField()
    action = InsightActionSerializer()


class InsightEvidenceSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()
    value = serializers.DecimalField(max_digits=12, decimal_places=4, coerce_to_string=False)
    weight = serializers.DecimalField(max_digits=5, decimal_places=4)


class UserGraphInsightConceptSerializer(serializers.Serializer):
    concept_id = serializers.IntegerField()
    slug = serializers.CharField()
    name = serializers.CharField()
    total_weight = serializers.DecimalField(max_digits=12, decimal_places=4)
    source_count = serializers.IntegerField(min_value=0)
    related_question_count = serializers.IntegerField(min_value=0)
    semantic_state = serializers.CharField()
    tone_token = serializers.CharField()
    recommendations = InsightRecommendationSerializer(many=True)
    state_score = serializers.DecimalField(max_digits=5, decimal_places=4)
    strength_score = serializers.DecimalField(max_digits=5, decimal_places=4)
    freshness_score = serializers.DecimalField(max_digits=5, decimal_places=4)
    connectivity_score = serializers.DecimalField(max_digits=5, decimal_places=4)
    diversity_score = serializers.DecimalField(max_digits=5, decimal_places=4)
    confidence_score = serializers.DecimalField(max_digits=5, decimal_places=4)
    confidence_band = serializers.CharField()
    owner_graph_degree = serializers.IntegerField(min_value=0)
    owner_visible_related_question_count = serializers.IntegerField(min_value=0)
    activity_types = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    evidence = InsightEvidenceSerializer(many=True)

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if 'tone_token' in representation:
            representation[_RedactedReprKey('tone_token', 'tone_marker')] = representation.pop('tone_token')
        return representation


class UserGraphInsightsSummarySerializer(serializers.Serializer):
    concept_count = serializers.IntegerField(min_value=0)
    recommendation_count = serializers.IntegerField(min_value=0)
    states = serializers.DictField(child=serializers.IntegerField(min_value=0))


class InsightRecommendationTargetSerializer(serializers.Serializer):
    concept = serializers.DictField()
    discovery = serializers.DictField()
    group = serializers.DictField(required=False)
    neighbours = serializers.ListField(child=serializers.DictField(), required=False)


class InsightTopLevelRecommendationSerializer(serializers.Serializer):
    rank = serializers.IntegerField(min_value=1)
    id = serializers.CharField()
    score = serializers.DecimalField(max_digits=5, decimal_places=4)
    confidence = serializers.DecimalField(max_digits=5, decimal_places=4)
    priority = serializers.CharField()
    label = serializers.CharField()
    reason_code = serializers.CharField()
    target = InsightRecommendationTargetSerializer()
    action = InsightActionSerializer()
    evidence = InsightEvidenceSerializer(many=True)


class UserGraphInsightsResponseSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    viewer = ViewerSerializer()
    state = InsightsGraphStateSerializer()
    summary = UserGraphInsightsSummarySerializer()
    recommendations = InsightTopLevelRecommendationSerializer(many=True)
    concepts = UserGraphInsightConceptSerializer(many=True)


class UserGraphInsightsErrorDetailSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()


class UserGraphInsightsErrorResponseSerializer(serializers.Serializer):
    error = UserGraphInsightsErrorDetailSerializer()
    state = InsightsGraphStateSerializer()


class RebuildSummarySerializer(serializers.Serializer):
    processed = serializers.IntegerField(min_value=0, required=False)
    processed_sources = serializers.IntegerField(min_value=0, required=False)
    created_concepts = serializers.IntegerField(min_value=0, required=False)
    updated_concepts = serializers.IntegerField(min_value=0, required=False)
    created_mappings = serializers.IntegerField(min_value=0, required=False)
    updated_mappings = serializers.IntegerField(min_value=0, required=False)
    created_edges = serializers.IntegerField(min_value=0, required=False)
    updated_edges = serializers.IntegerField(min_value=0, required=False)
    removed_edges = serializers.IntegerField(min_value=0, required=False)
    created_rows = serializers.IntegerField(min_value=0, required=False)
    updated_rows = serializers.IntegerField(min_value=0, required=False)
    skipped_sources = serializers.IntegerField(min_value=0, required=False)
    authored_question = serializers.IntegerField(min_value=0, required=False)
    posted_solution = serializers.IntegerField(min_value=0, required=False)
    best_solution = serializers.IntegerField(min_value=0, required=False)
    approved_edit = serializers.IntegerField(min_value=0, required=False)
    question_upvote = serializers.IntegerField(min_value=0, required=False)
    solution_upvote = serializers.IntegerField(min_value=0, required=False)


class UserGraphRebuildResponseSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    processed_questions = serializers.IntegerField(min_value=0)
    processed_activity_sources = serializers.IntegerField(min_value=0)
    structural_summary = RebuildSummarySerializer()
    activity_summary = RebuildSummarySerializer()
    state = GraphStateSerializer()
    semantic = UserGraphSemanticStateSerializer(required=False)


class RebuildErrorDetailSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()


class UserGraphRebuildErrorResponseSerializer(serializers.Serializer):
    error = RebuildErrorDetailSerializer()
    state = GraphStateSerializer()


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
