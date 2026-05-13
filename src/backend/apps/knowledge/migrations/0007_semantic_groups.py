# Generated manually for M016 S04 owner-scoped semantic group storage.

from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion
import apps.knowledge.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('knowledge', '0006_semantic_embedding_snapshots'),
    ]

    operations = [
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='semantic_group_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='semantic_group_membership_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name='UserKnowledgeGraphSemanticGroup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(max_length=128)),
                ('model', models.CharField(max_length=128)),
                ('group_key', models.CharField(max_length=160)),
                ('label', models.CharField(max_length=160, validators=[apps.knowledge.models.validate_semantic_group_safe_text])),
                ('description', models.TextField(blank=True, default='', validators=[apps.knowledge.models.validate_semantic_group_safe_text])),
                ('rationale', models.TextField(blank=True, default='', validators=[apps.knowledge.models.validate_semantic_group_safe_text])),
                ('confidence', models.DecimalField(decimal_places=4, max_digits=5, validators=[django.core.validators.MinValueValidator(Decimal('0.0000')), django.core.validators.MaxValueValidator(Decimal('1.0000'))])),
                ('evidence', models.JSONField(blank=True, default=dict, validators=[apps.knowledge.models.validate_semantic_group_safe_json])),
                ('generated_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='knowledge_graph_semantic_groups', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_knowledge_graph_semantic_groups',
            },
        ),
        migrations.CreateModel(
            name='UserKnowledgeGraphSemanticGroupMembership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rank', models.PositiveIntegerField()),
                ('confidence', models.DecimalField(decimal_places=4, max_digits=5, validators=[django.core.validators.MinValueValidator(Decimal('0.0000')), django.core.validators.MaxValueValidator(Decimal('1.0000'))])),
                ('evidence', models.JSONField(blank=True, default=dict, validators=[apps.knowledge.models.validate_semantic_group_safe_json])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('concept', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='semantic_group_memberships', to='knowledge.knowledgeconcept')),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='knowledge.userknowledgegraphsemanticgroup')),
            ],
            options={
                'db_table': 'user_knowledge_graph_semantic_group_memberships',
            },
        ),
        migrations.AddConstraint(
            model_name='userknowledgegraphsemanticgroup',
            constraint=models.UniqueConstraint(fields=('user', 'provider', 'model', 'group_key'), name='unique_ukg_semantic_group'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticgroup',
            index=models.Index(fields=['user', 'provider', 'model'], name='ukgsg_user_provider_idx'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticgroup',
            index=models.Index(fields=['user', 'generated_at'], name='ukgsg_user_generated_idx'),
        ),
        migrations.AddConstraint(
            model_name='userknowledgegraphsemanticgroupmembership',
            constraint=models.UniqueConstraint(fields=('group', 'concept'), name='unique_ukg_semantic_group_concept'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticgroupmembership',
            index=models.Index(fields=['group', 'rank'], name='ukgsgm_group_rank_idx'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticgroupmembership',
            index=models.Index(fields=['concept'], name='ukgsgm_concept_idx'),
        ),
    ]
