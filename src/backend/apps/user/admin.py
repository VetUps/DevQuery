from django import forms
from django.contrib import admin, messages

from .models import CustomUser, ReputationLevelThreshold, ReputationPolicyConfig, ReputationTransaction
from .services.reputation_service import ReputationService


class ReputationThresholdAdminForm(forms.ModelForm):
    class Meta:
        model = ReputationLevelThreshold
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        if self.errors:
            return cleaned_data

        candidate_thresholds = list(ReputationLevelThreshold.objects.exclude(pk=self.instance.pk))
        candidate_thresholds.append(
            ReputationLevelThreshold(
                pk=self.instance.pk,
                level=cleaned_data.get('level'),
                minimum_score=cleaned_data.get('minimum_score'),
                is_active=cleaned_data.get('is_active', True),
                description=cleaned_data.get('description', ''),
            )
        )

        active_thresholds = [threshold for threshold in candidate_thresholds if threshold.is_active]
        try:
            ReputationService.validate_thresholds(active_thresholds)
        except Exception as exc:
            messages_list = getattr(exc, 'messages', None)
            if messages_list:
                raise forms.ValidationError(messages_list)

            detail = getattr(exc, 'detail', None)
            if detail is not None:
                if isinstance(detail, (list, tuple)):
                    messages = [str(item) for item in detail]
                elif isinstance(detail, dict):
                    messages = [f'{key}: {value}' for key, value in detail.items()]
                else:
                    messages = [str(detail)]
                raise forms.ValidationError(messages)

            raise forms.ValidationError(str(exc))

        return cleaned_data


class ReputationPolicyConfigAdminForm(forms.ModelForm):
    class Meta:
        model = ReputationPolicyConfig
        fields = '__all__'


class CustomUserAdminForm(forms.ModelForm):
    manual_override_note = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={'rows': 3}),
        label='Причина ручного переопределения',
        help_text='Будет сохранена в журнале как пояснение к ручному изменению уровня.',
    )

    class Meta:
        model = CustomUser
        fields = '__all__'


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    form = CustomUserAdminForm
    list_display = (
        'user_email',
        'user_name',
        'user_role',
        'user_reputation_score',
        'resolved_reputation_level',
        'manual_reputation_level',
        'is_active',
    )
    list_filter = ('user_role', 'manual_reputation_level', 'is_active', 'is_staff')
    search_fields = ('user_email', 'user_name')
    readonly_fields = ('user_id', 'user_created_at', 'last_login')
    ordering = ('user_email',)
    fieldsets = (
        (None, {'fields': ('user_email', 'user_name', 'password')}),
        ('Profile', {'fields': ('user_avatar_url', 'user_bio')}),
        (
            'Reputation',
            {
                'fields': ('user_reputation_score', 'manual_reputation_level', 'manual_override_note'),
                'description': 'Ручной уровень влияет только на вычисленный уровень и политику доступа. Очки репутации и история начислений не изменяются.',
            },
        ),
        ('Permissions', {'fields': ('user_role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'user_created_at')}),
    )

    @admin.display(description='Текущий уровень')
    def resolved_reputation_level(self, obj: CustomUser) -> str:
        progress = ReputationService.get_progress(obj)
        if progress['is_manual_override']:
            return f"{progress['level_label']} (ручной)"
        return progress['level_label']

    def save_model(self, request, obj, form, change):
        if not change:
            super().save_model(request, obj, form, change)
            return

        previous_user = CustomUser.objects.get(pk=obj.pk)
        override_changed = previous_user.manual_reputation_level != obj.manual_reputation_level
        override_note = form.cleaned_data.get('manual_override_note', '').strip()

        if override_changed:
            obj.manual_reputation_level = previous_user.manual_reputation_level

        super().save_model(request, obj, form, change)

        if override_changed:
            ReputationService.set_manual_level_override(
                user=obj,
                manual_level=form.cleaned_data.get('manual_reputation_level'),
                actor=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
                note=override_note,
            )
            if hasattr(request, '_messages'):
                messages.info(request, 'Ручное переопределение уровня сохранено в журнале репутации.')


@admin.register(ReputationLevelThreshold)
class ReputationLevelThresholdAdmin(admin.ModelAdmin):
    form = ReputationThresholdAdminForm
    list_display = ('level', 'minimum_score', 'is_active', 'updated_at')
    list_filter = ('is_active', 'level')
    search_fields = ('level', 'description')
    readonly_fields = ('reputation_level_threshold_id', 'created_at', 'updated_at')
    ordering = ('minimum_score',)


@admin.register(ReputationPolicyConfig)
class ReputationPolicyConfigAdmin(admin.ModelAdmin):
    form = ReputationPolicyConfigAdminForm
    list_display = ('singleton_key', 'protected_newcomer_window_hours', 'updated_at')
    readonly_fields = ('singleton_key', 'created_at', 'updated_at')

    def has_add_permission(self, request):
        if ReputationPolicyConfig.objects.exists():
            return False
        return super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False


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
