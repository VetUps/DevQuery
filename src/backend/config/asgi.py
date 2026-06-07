# Кратко: подключает Django к серверу приложения.
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.settings')

application = get_asgi_application()
