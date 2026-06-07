# Generated manually for M017 S02 deterministic semantic group reuse metadata.

from django.db import migrations, models
import apps.knowledge.models


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0008_semantic_group_lifecycle'),
    ]

    operations = [
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='centroid_payload',
            field=models.JSONField(blank=True, default=list, validators=[apps.knowledge.models.validate_semantic_group_safe_json]),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='member_signature',
            field=models.CharField(blank=True, db_index=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='member_slug_signature',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='top_member_slugs',
            field=models.JSONField(blank=True, default=list, validators=[apps.knowledge.models.validate_semantic_group_safe_json]),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticgroup',
            name='reuse_evidence',
            field=models.JSONField(blank=True, default=dict, validators=[apps.knowledge.models.validate_semantic_group_safe_json]),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='semantic_group_reused_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='semantic_group_created_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='semantic_group_changed_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='semantic_group_stale_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='semantic_group_archived_count',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
