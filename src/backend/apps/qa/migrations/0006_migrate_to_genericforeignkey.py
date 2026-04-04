# Generated manually to migrate comment to GenericForeignKey

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_comment_targets(apps, schema_editor):
    """Перенос данных из target_type/target_id в content_type/object_id"""
    Comment = apps.get_model('qa', 'Comment')
    ContentType = apps.get_model('contenttypes', 'ContentType')
    
    # Получаем ContentType для Question и Solution
    question_ct = ContentType.objects.get(app_label='qa', model='question')
    solution_ct = ContentType.objects.get(app_label='qa', model='solution')
    
    # Мигрируем комментарии
    for comment in Comment.objects.all():
        if comment.target_type == 'question':
            comment.content_type = question_ct
            comment.object_id = comment.target_id
        elif comment.target_type == 'solution':
            comment.content_type = solution_ct
            comment.object_id = comment.target_id
        comment.save()


class Migration(migrations.Migration):

    dependencies = [
        ('contenttypes', '0002_remove_content_type_name'),
        ('qa', '0005_alter_solutionedits_solution_edit_is_approved_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Шаг 1: Добавляем новые поля с null=True
        migrations.AddField(
            model_name='comment',
            name='content_type',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, 
                                    to='contenttypes.contenttype',
                                    help_text='Тип контента (вопрос или решение)'),
        ),
        migrations.AddField(
            model_name='comment',
            name='object_id',
            field=models.UUIDField(null=True, 
                                   help_text='ID объекта, к которому оставлен комментарий'),
        ),
        
        # Шаг 2: Переносим данные
        migrations.RunPython(migrate_comment_targets, reverse_code=migrations.RunPython.noop),
        
        # Шаг 3: Делаем поля NOT NULL
        migrations.AlterField(
            model_name='comment',
            name='content_type',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, 
                                    to='contenttypes.contenttype',
                                    help_text='Тип контента (вопрос или решение)'),
        ),
        migrations.AlterField(
            model_name='comment',
            name='object_id',
            field=models.UUIDField(help_text='ID объекта, к которому оставлен комментарий'),
        ),
        
        # Шаг 4: Добавляем индекс
        migrations.AddIndex(
            model_name='comment',
            index=models.Index(fields=['content_type', 'object_id'], name='comments_content_cd20f6_idx'),
        ),
        
        # Шаг 5: Удаляем старое поле target_id
        migrations.RemoveField(
            model_name='comment',
            name='target_id',
        ),
    ]
