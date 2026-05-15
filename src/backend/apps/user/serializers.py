from rest_framework import serializers
from django.http import QueryDict
from .models import CustomUser, ReputationPolicyConfig, ReputationTransaction
from .services.admin_activity_service import AdminActivityService
from .services.reputation_service import ReputationService
from .services.user_service import UserService

class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, max_length=20, required=True)
    password_confirm = serializers.CharField(write_only=True, min_length=6, max_length=20, required=True)

    class Meta:
        model = CustomUser
        fields = ('user_name', 'user_email', 'password', 'password_confirm')
        extra_kwargs = {
            'user_name': {'validators': []},
            'user_email': {'validators': []},
        }

    def validate_user_name(self, value):
        if CustomUser.objects.filter(user_name=value).exists():
            raise serializers.ValidationError('Пользователь с таким логином уже существует')
        return value

    def validate_user_email(self, value):
        if CustomUser.objects.filter(user_email=value).exists():
            raise serializers.ValidationError('Пользователь с такой почтой уже существует')
        return value

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError('Пароль не совпадают')

        return data

    def create(self, validated_data):
        return UserService.register_user(validated_data)

class ReputationLedgerEntrySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source='reputation_transaction_id', read_only=True)
    amount = serializers.IntegerField(source='reputation_transaction_amount', read_only=True)
    reason = serializers.CharField(source='reputation_transaction_reason', read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ReputationTransaction
        fields = ('id', 'amount', 'reason', 'note', 'actor_name', 'created_at')
        read_only_fields = fields

    def get_actor_name(self, obj) -> str | None:
        return obj.actor.user_name if obj.actor else None


class UserProfileSerializer(serializers.ModelSerializer):
    reputation = serializers.SerializerMethodField()
    reputation_ledger = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            'user_id',
            'user_name',
            'user_email',
            'user_role',
            'user_reputation_score',
            'user_avatar_url',
            'user_bio',
            'user_created_at',
            'reputation',
            'reputation_ledger',
        )

    def get_reputation(self, obj) -> dict:
        return ReputationService.get_progress(obj)

    def get_reputation_ledger(self, obj) -> list:
        limit = self.context.get('reputation_ledger_limit', 10)
        transactions = obj.reputation_transactions.select_related('actor').order_by('-created_at')[:limit]
        return ReputationLedgerEntrySerializer(transactions, many=True).data


class PublicUserProfileSerializer(serializers.ModelSerializer):
    reputation = serializers.SerializerMethodField()
    weekly_score = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = CustomUser
        fields = (
            'user_id',
            'user_name',
            'user_role',
            'user_reputation_score',
            'user_avatar_url',
            'user_bio',
            'user_created_at',
            'reputation',
            'weekly_score',
        )

    def get_reputation(self, obj) -> dict:
        progress = ReputationService.get_progress(obj)
        return {
            'score': progress['score'],
            'level': progress['level'],
            'level_label': progress['level_label'],
            'next_level': progress['next_level'],
            'points_to_next_level': progress['points_to_next_level'],
        }

class AdminUserListSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = (
            'user_id',
            'user_name',
            'user_email',
            'user_role',
            'user_reputation_score',
            'user_created_at',
        )
        read_only_fields = fields


class AdminActivityTimelineQuerySerializer(serializers.Serializer):
    limit = serializers.IntegerField(required=False, min_value=0)
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    type = serializers.ListField(
        child=serializers.ChoiceField(choices=sorted(AdminActivityService.ALLOWED_TYPES)),
        required=False,
        allow_empty=False,
    )

    def to_internal_value(self, data):
        if isinstance(data, QueryDict):
            mutable_data = data.copy()
            type_values = []
            for raw_value in data.getlist('type'):
                type_values.extend(value.strip() for value in raw_value.split(',') if value.strip())
            if type_values:
                mutable_data.setlist('type', type_values)
            elif 'type' in mutable_data:
                mutable_data.pop('type')
            data = mutable_data
        return super().to_internal_value(data)

    def validate_limit(self, value: int) -> int:
        return min(value, AdminActivityService.MAX_LIMIT)

    def validate(self, attrs):
        attrs.setdefault('limit', AdminActivityService.DEFAULT_LIMIT)
        attrs.setdefault('page', 1)
        attrs.setdefault('type', sorted(AdminActivityService.ALLOWED_TYPES))
        return attrs


class AdminActivityTimelineItemSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    type = serializers.ChoiceField(choices=sorted(AdminActivityService.ALLOWED_TYPES), read_only=True)
    occurred_at = serializers.DateTimeField(read_only=True)
    title = serializers.CharField(read_only=True)
    summary = serializers.CharField(read_only=True)
    target_label = serializers.CharField(read_only=True)
    route = serializers.DictField(child=serializers.CharField(), read_only=True)


class AdminActivityTimelineResponseSerializer(serializers.Serializer):
    items = AdminActivityTimelineItemSerializer(many=True, read_only=True)
    count = serializers.IntegerField(read_only=True)
    page = serializers.IntegerField(read_only=True)
    limit = serializers.IntegerField(read_only=True)
    available_types = serializers.ListField(child=serializers.CharField(), read_only=True)


class AdminManualReputationOverrideSerializer(serializers.Serializer):
    manual_reputation_level = serializers.ChoiceField(
        choices=CustomUser.ReputationLevel.choices,
        allow_null=True,
        required=True,
    )
    note = serializers.CharField(
        allow_blank=False,
        max_length=500,
        required=True,
        trim_whitespace=True,
    )

    def validate_note(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError('Укажите причину ручного изменения уровня репутации.')
        return value.strip()


class AdminReputationPolicySerializer(serializers.Serializer):
    protected_newcomer_window_hours = serializers.IntegerField(required=True)
    max_protected_newcomer_window_hours = serializers.IntegerField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True, allow_null=True)

    def to_representation(self, instance) -> dict:
        return {
            'protected_newcomer_window_hours': instance.protected_newcomer_window_hours,
            'max_protected_newcomer_window_hours': ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS,
            'updated_at': instance.updated_at,
        }

    def validate_protected_newcomer_window_hours(self, value: int) -> int:
        raw_value = self.initial_data.get('protected_newcomer_window_hours') if hasattr(self, 'initial_data') else value
        if not isinstance(raw_value, int) or isinstance(raw_value, bool):
            raise serializers.ValidationError('Укажите целое количество часов.')
        if value <= 0:
            raise serializers.ValidationError('Защитное окно должно быть положительным количеством часов.')
        if value > ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS:
            raise serializers.ValidationError(
                f'Защитное окно не должно превышать '
                f'{ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS} часа.'
            )
        return value


class AdminUserReputationDetailSerializer(serializers.ModelSerializer):
    reputation = serializers.SerializerMethodField()
    reputation_ledger = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            'user_id',
            'user_name',
            'user_email',
            'user_role',
            'user_reputation_score',
            'user_created_at',
            'reputation',
            'reputation_ledger',
        )
        read_only_fields = fields

    def get_reputation(self, obj) -> dict:
        return ReputationService.get_progress(obj)

    def get_reputation_ledger(self, obj) -> list:
        limit = self.context.get('reputation_ledger_limit', 10)
        transactions = obj.reputation_transactions.select_related('actor').order_by('-created_at')[:limit]
        return ReputationLedgerEntrySerializer(transactions, many=True).data


class UserLoginSerializer(serializers.Serializer):
    user_email = serializers.CharField(max_length=255, required=True)
    password = serializers.CharField(write_only=True, min_length=6, max_length=20, required=True)

    def validate_user_email(self, value):
        if not value.strip():
            raise serializers.ValidationError('Почта обязательна')
        return value

    def validate_password(self, value):
        if not value.strip():
            raise serializers.ValidationError('Пароль обязателен')
        return value

class UserLoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserProfileSerializer()


class UserLogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
