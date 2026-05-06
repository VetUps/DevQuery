from rest_framework import serializers
from .models import CustomUser, ReputationTransaction
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
