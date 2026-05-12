# Generated manually for owner-scoped semantic rebuild diagnostics.

from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('knowledge', '0004_user_knowledge_graph_layout'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserKnowledgeGraphSemanticState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('disabled', 'Disabled'), ('dry_run', 'Dry run'), ('succeeded', 'Succeeded'), ('empty', 'Empty'), ('budget_exceeded', 'Budget exceeded'), ('configuration_error', 'Configuration error'), ('provider_error', 'Provider error'), ('timeout', 'Timeout'), ('malformed_response', 'Malformed response')], default='pending', max_length=40)),
                ('reason_code', models.CharField(blank=True, default='', max_length=80)),
                ('phase', models.CharField(blank=True, default='', max_length=80)),
                ('enabled', models.BooleanField(default=False)),
                ('dry_run', models.BooleanField(default=True)),
                ('source_provider', models.CharField(blank=True, default='', max_length=128)),
                ('source_model', models.CharField(blank=True, default='', max_length=128)),
                ('grouping_provider', models.CharField(blank=True, default='', max_length=128)),
                ('grouping_model', models.CharField(blank=True, default='', max_length=128)),
                ('source_item_count', models.PositiveIntegerField(default=0)),
                ('estimated_token_count', models.PositiveIntegerField(default=0)),
                ('estimated_cost', models.DecimalField(decimal_places=6, default=Decimal('0.000000'), max_digits=12)),
                ('budget_cap', models.DecimalField(decimal_places=6, default=Decimal('0.000000'), max_digits=12)),
                ('last_error_message', models.CharField(blank=True, default='', max_length=255)),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='knowledge_graph_semantic_state', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_knowledge_graph_semantic_states',
            },
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticstate',
            index=models.Index(fields=['user'], name='ukgsemantic_user_idx'),
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphsemanticstate',
            index=models.Index(fields=['status'], name='ukgsemantic_status_idx'),
        ),
    ]
