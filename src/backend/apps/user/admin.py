from django.contrib import admin

from .models import CustomUser, ReputationLevelThreshold, ReputationTransaction


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('user_email', 'user_name', 'user_role', 'user_reputation_score', 'manual_reputation_level', 'is_active')
    list_filter = ('user_role', 'manual_reputation_level', 'is_active', 'is_staff')
    search_fields = ('user_email', 'user_name')
    readonly_fields = ('user_id', 'user_created_at', 'last_login')
    ordering = ('user_email',)


@admin.register(ReputationLevelThreshold)
class ReputationLevelThresholdAdmin(admin.ModelAdmin):
    list_display = ('level', 'minimum_score', 'is_active', 'updated_at')
    list_filter = ('is_active', 'level')
    search_fields = ('level', 'description')
    readonly_fields = ('reputation_level_threshold_id', 'created_at', 'updated_at')
    ordering = ('minimum_score',)


@admin.register(ReputationTransaction)
class ReputationTransactionAdmin(admin.ModelAdmin):
    list_display = ('user', 'reputation_transaction_amount', 'reputation_transaction_reason', 'actor', 'created_at')
    list_filter = ('reputation_transaction_reason', 'created_at')
    search_fields = ('user__user_email', 'user__user_name', 'actor__user_email', 'actor__user_name', 'note')
    readonly_fields = (
        'reputation_transaction_id',
        'user',
        'actor',
        'reputation_transaction_amount',
        'reputation_transaction_reason',
        'content_type',
        'object_id',
        'note',
        'created_at',
    )
    ordering = ('-created_at',)
