# Generated manually for M017 S01 persisted semantic group lifecycle metadata.

from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0007_semantic_groups'),
    ]

    operations = [
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='lifecycle_status',
            field=models.CharField(
                choices=[('active', 'Active'), ('stale', 'Stale'), ('archived', 'Archived')],
                default='active',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='lifecycle_reason_code',
            field=models.CharField(
                blank=True,
                default='',
                max_length=80,
                validators=[
                    django.core.validators.RegexValidator(
                        regex='^[a-z0-9_]*$',
                        message='Semantic group lifecycle reason code must be a safe lowercase code.',
                    )
                ],
            ),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='first_seen_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='last_seen_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='stale_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticgroup',
            index=models.Index(fields=['user', 'lifecycle_status'], name='ukgsg_user_lifecycle_idx'),
        ),
    ]
