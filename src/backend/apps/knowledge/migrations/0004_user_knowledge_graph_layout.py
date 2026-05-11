# Generated manually for owner-scoped knowledge graph layout persistence.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('knowledge', '0003_user_knowledge_graph_state'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserKnowledgeGraphLayout',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('schema_version', models.PositiveSmallIntegerField(default=1)),
                ('positions', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='knowledge_graph_layout', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_knowledge_graph_layouts',
            },
        ),
        migrations.AddIndex(
            model_name='userknowledgegraphlayout',
            index=models.Index(fields=['user'], name='ukglayout_user_idx'),
        ),
    ]
