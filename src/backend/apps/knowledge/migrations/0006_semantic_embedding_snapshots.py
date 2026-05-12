# Generated manually for M016 S03 owner-scoped semantic snapshot storage.

from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('knowledge', '0005_user_knowledge_graph_semantic_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='changed_source_item_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='reused_snapshot_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='snapshot_item_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userknowledgegraphsemanticstate',
            name='neighbor_candidate_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name='UserKnowledgeGraphEmbeddingSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_type', models.CharField(max_length=40)),
                ('source_id', models.CharField(max_length=64)),
                ('provider', models.CharField(max_length=128)),
                ('model', models.CharField(max_length=128)),
                ('dimensions', models.PositiveIntegerField()),
                ('content_hash', models.CharField(max_length=64)),
                ('vector_payload', models.JSONField(default=list)),
                ('generated_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='knowledge_graph_embedding_snapshots', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_knowledge_graph_embedding_snapshots',
            },
        ),
        migrations.CreateModel(
            name='UserKnowledgeGraphSemanticCandidate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(max_length=128)),
                ('model', models.CharField(max_length=128)),
                ('dimensions', models.PositiveIntegerField()),
                ('similarity_score', models.DecimalField(decimal_places=5, max_digits=6, validators=[django.core.validators.MinValueValidator(Decimal('0.00000')), django.core.validators.MaxValueValidator(Decimal('1.00000'))])),
                ('rank', models.PositiveIntegerField()),
                ('generated_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('source_snapshot', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outgoing_semantic_candidates', to='knowledge.userknowledgegraphembeddingsnapshot')),
                ('target_snapshot', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='incoming_semantic_candidates', to='knowledge.userknowledgegraphembeddingsnapshot')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='knowledge_graph_semantic_candidates', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_knowledge_graph_semantic_candidates',
            },
        ),
        migrations.AddConstraint(
            model_name='userknowledgegraphembeddingsnapshot',
            constraint=models.UniqueConstraint(fields=('user', 'source_type', 'source_id', 'provider', 'model', 'dimensions', 'content_hash'), name='unique_ukg_embedding_snapshot'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphembeddingsnapshot',
            index=models.Index(fields=['user', 'provider', 'model', 'content_hash'], name='ukges_user_provider_hash_idx'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphembeddingsnapshot',
            index=models.Index(fields=['user', 'source_type', 'source_id'], name='ukges_user_source_idx'),
        ),
        migrations.AddConstraint(
            model_name='userknowledgegraphsemanticcandidate',
            constraint=models.UniqueConstraint(fields=('user', 'provider', 'model', 'dimensions', 'rank'), name='unique_ukg_semantic_rank'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticcandidate',
            index=models.Index(fields=['user', 'rank'], name='ukgsc_user_rank_idx'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticcandidate',
            index=models.Index(fields=['user', 'provider', 'model', 'dimensions'], name='ukgsc_user_provider_idx'),
        ),
    ]
