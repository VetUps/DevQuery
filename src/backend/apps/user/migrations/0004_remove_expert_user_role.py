from django.db import migrations, models


def migrate_expert_user_role(apps, schema_editor):
    CustomUser = apps.get_model('user', 'CustomUser')
    CustomUser.objects.filter(user_role='expert').update(user_role='user')


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0003_reputationpolicyconfig'),
    ]

    operations = [
        migrations.RunPython(migrate_expert_user_role, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='customuser',
            name='user_role',
            field=models.CharField(
                choices=[('user', 'User'), ('admin', 'Admin')],
                default='user',
                help_text='Роль пользователя',
                max_length=15,
            ),
        ),
    ]
