from datetime import timedelta
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

class CustomUserManager(BaseUserManager):
    def create_user(self, user_email, user_name, password, **extra_fields):
        """
        Создание пользователя
        :param user_email: почта пользователя
        :param user_name: никнейм пользователя
        :param password: пароль пользователя
        :param extra_fields: дополнительные поля для создания пользователя
        :return: модель созданного пользователя
        """
        if not user_email:
            raise ValueError('Пользователь должен иметь почту')
        if not user_name:
            raise ValueError('Пользователь должен иметь никнейм')

        email = self.normalize_email(user_email)
        user = self.model(user_email=email, user_name=user_name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, user_email, user_name, password, **extra_fields):
        """
        Создание суперпользователя с дополнительными правами
        """
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if not extra_fields.get('is_staff'):
            raise ValueError('Superuser must have is_staff=True.')
        if not extra_fields.get('is_superuser'):
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(user_email, user_name, password, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    """
    Кастомная модель данных пользователя
    """
    class Roles(models.TextChoices):
        USER_ROLE = 'user', 'User'
        ADMIN_ROLE = 'admin', 'Admin'

    class ReputationLevel(models.TextChoices):
        NEWCOMER = 'newcomer', 'Новичок'
        PARTICIPANT = 'participant', 'Участник'
        EXPERT = 'expert', 'Эксперт'
        MASTER = 'master', 'Мастер'

    user_id =               models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                             help_text='Уникальный идентификатор пользователя')
    user_name =             models.CharField(max_length=64, unique=True, blank=False,
                                             help_text='Никнейм пользователя')
    user_email =            models.EmailField(max_length=255, unique=True, blank=False,
                                              help_text='Почта пользователя')
    user_role =             models.CharField(choices=Roles, default=Roles.USER_ROLE, max_length=15, blank=False,
                                             help_text='Роль пользователя')
    user_reputation_score = models.PositiveIntegerField(default=0, blank=False, null=False,
                                                        help_text='Репутация пользователя')
    manual_reputation_level = models.CharField(
        choices=ReputationLevel.choices,
        max_length=32,
        blank=True,
        null=True,
        help_text='Ручной уровень репутации, если администратор переопределил расчетный уровень',
    )
    user_avatar_url =       models.ImageField(blank=True, null=True,
                                              help_text='Аватар пользователя')
    user_bio =              models.TextField(blank=True, null=True,
                                             help_text='Дополнительная информация о пользователе')
    user_created_at =       models.DateTimeField(auto_now_add=True,
                                                 help_text='Дата регистрации пользователя')
    is_staff =              models.BooleanField(default=False)
    is_active =             models.BooleanField(default=True,
                                                help_text='Активирована ли учётная запись пользователя')

    USERNAME_FIELD='user_email'
    REQUIRED_FIELDS = ['user_name']

    objects = CustomUserManager()

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.user_email

class Achievement(models.Model):
    """
    Модель данных достижений
    """
    achievement_id =          models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                               help_text='Уникальный идентификатор достижения')
    achievement_code =        models.CharField(max_length=128, blank=False, null=False, unique=True,
                                               help_text='Машиночитаемый идентификатор достижения')
    achievement_name =        models.CharField(max_length=128, blank=False, null=False,
                                               help_text='Название достижения')
    achievement_description = models.TextField(help_text='Описание достижения')

    class Meta:
        db_table = 'achievements'

    def __str__(self):
        return self.achievement_code

class UserAchievement(models.Model):
    """
    Модель данных для связки достижений и пользователей
    """
    user_achievement_id =        models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                                  help_text='Уникальный идентификатор записи')
    user =                       models.ForeignKey(CustomUser, on_delete=models.CASCADE, blank=False, null=False,
                                                   help_text='Уникальный идентификатор пользователя')
    achievement =                models.ForeignKey(Achievement, on_delete=models.CASCADE, blank=False, null=False,
                                                   help_text='Уникальный идентификатор достижения')
    user_achievement_earned_at = models.DateTimeField(auto_now_add=True,
                                                      help_text='Дата и время получения достижения')

    class Meta:
        db_table = 'user_achievements'
        constraints = [
            models.UniqueConstraint(fields=['user', 'achievement'], name='unique_user_achievement')
        ]

class ReputationLevelThreshold(models.Model):
    DEFAULT_THRESHOLDS = {
        CustomUser.ReputationLevel.NEWCOMER: 0,
        CustomUser.ReputationLevel.PARTICIPANT: 30,
        CustomUser.ReputationLevel.EXPERT: 100,
        CustomUser.ReputationLevel.MASTER: 300,
    }

    reputation_level_threshold_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                                     help_text='Уникальный идентификатор порога репутации')
    level = models.CharField(max_length=32, choices=CustomUser.ReputationLevel.choices, unique=True,
                             help_text='Уровень репутации')
    minimum_score = models.PositiveIntegerField(help_text='Минимальное количество репутации для уровня')
    is_active = models.BooleanField(default=True, help_text='Используется ли порог при расчете уровня')
    description = models.TextField(blank=True, help_text='Пояснение для администраторов')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reputation_level_thresholds'
        ordering = ['minimum_score']
        indexes = [
            models.Index(fields=['is_active', 'minimum_score'], name='rep_threshold_active_score_idx'),
        ]

    def clean(self):
        errors = {}
        default_score = self.DEFAULT_THRESHOLDS.get(self.level)
        if default_score is None:
            errors['level'] = _('Некорректный уровень репутации.')
        elif self.minimum_score != default_score:
            errors['minimum_score'] = _(
                'Порог уровня %(level)s должен быть равен %(score)s.'
            ) % {'level': self.level, 'score': default_score}

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f'{self.get_level_display()} ({self.minimum_score})'


class ReputationPolicyConfig(models.Model):
    DEFAULT_PROTECTED_NEWCOMER_WINDOW_HOURS = 12
    MAX_PROTECTED_NEWCOMER_WINDOW_HOURS = 72

    singleton_key = models.CharField(max_length=32, default='default', unique=True, editable=False)
    protected_newcomer_window_hours = models.PositiveIntegerField(
        default=DEFAULT_PROTECTED_NEWCOMER_WINDOW_HOURS,
        help_text='Длительность protected-window для вопросов новичков в часах.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reputation_policy_config'
        verbose_name = 'Reputation policy config'
        verbose_name_plural = 'Reputation policy config'

    def clean(self):
        if self.protected_newcomer_window_hours <= 0:
            raise ValidationError(
                {'protected_newcomer_window_hours': 'Защитное окно должно быть положительным количеством часов.'}
            )
        if self.protected_newcomer_window_hours > self.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS:
            raise ValidationError(
                {
                    'protected_newcomer_window_hours': (
                        'Защитное окно не должно превышать 72 часа, чтобы новичковые вопросы '
                        'не оставались закрытыми слишком долго.'
                    )
                }
            )

    @property
    def protected_newcomer_window(self) -> timedelta:
        return timedelta(hours=self.protected_newcomer_window_hours)

    def save(self, *args, **kwargs):
        self.singleton_key = 'default'
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f'Protected newcomer window: {self.protected_newcomer_window_hours}h'


class ReputationTransaction(models.Model):
    class TransactionReason(models.TextChoices):
        BEST_SOLUTION = 'best_solution', 'Best solution'
        SOLUTION_UPVOTED = 'solution_upvoted', 'Solution upvoted'
        SOLUTION_DOWNVOTED = 'solution_downvoted', 'Solution downvoted'
        QUESTION_UPVOTED = 'question_upvoted', 'Question upvoted'
        APPROVED_EDIT = 'approved_edit', 'Approved edit'
        ACHIEVEMENT_EARNED = 'achievement_earned', 'Achievement earned'
        ADMIN_ADJUSTMENT = 'admin_adjustment', 'Admin adjustment'
        MANUAL_LEVEL_OVERRIDE = 'manual_level_override', 'Manual level override'


    reputation_transaction_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, blank=False,
                                                 help_text='Уникальный идентификатор транзакции')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, blank=False, null=False,
                             related_name='reputation_transactions', help_text='Пользователь транзакции')
    actor = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, blank=True, null=True,
                              related_name='created_reputation_transactions',
                              help_text='Пользователь или администратор, вызвавший изменение')
    reputation_transaction_amount = models.IntegerField(blank=False, null=False,
                                                        help_text='Количество снятой/добавленной репутации')
    reputation_transaction_reason = models.CharField(max_length=128, blank=False, null=False, choices=TransactionReason.choices,
                                                     help_text='Причина начисления/снятия репутации')
    content_type = models.ForeignKey(ContentType, on_delete=models.SET_NULL, blank=True, null=True,
                                     help_text='Тип объекта-источника изменения репутации')
    object_id = models.UUIDField(blank=True, null=True, help_text='Идентификатор объекта-источника изменения репутации')
    source = GenericForeignKey('content_type', 'object_id')
    note = models.TextField(blank=True, help_text='Пояснение к изменению репутации')
    created_at = models.DateTimeField(auto_now_add=True, help_text='Дата и время изменения репутации')

    class Meta:
        db_table = 'reputation_transactions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='rep_tx_user_created_idx'),
            models.Index(fields=['reputation_transaction_reason'], name='rep_tx_reason_idx'),
            models.Index(fields=['content_type', 'object_id'], name='rep_tx_source_idx'),
        ]
