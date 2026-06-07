# Кратко: хранит настройки Django и внешних сервисов.
from pathlib import Path
from dotenv import load_dotenv
import os
from datetime import timedelta

load_dotenv()

VOTE_TYPE_CHOICES = [
    ('up', 'Upvote'),
    ('down', 'Downvote'),
]


def get_float_env(name, default):
    """Возвращает данные float env."""
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == '':
        return default
    try:
        value = float(raw_value)
    except ValueError:
        return default
    return value if value > 0 else default


def get_int_env(name, default):
    """Возвращает данные int env."""
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == '':
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return value if value > 0 else default


def get_bool_env(name, default):
    """Возвращает данные bool env."""
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == '':
        return default
    normalized = raw_value.strip().lower()
    if normalized in {'1', 'true', 'yes', 'on'}:
        return True
    if normalized in {'0', 'false', 'no', 'off'}:
        return False
    return default


DJANGO_TEST_SQLITE = os.getenv('DJANGO_TEST_SQLITE', '').strip().lower() in {'1', 'true', 'yes', 'on'}
KNOWLEDGE_GRAPH_AI_ENABLED = get_bool_env('KNOWLEDGE_GRAPH_AI_ENABLED', False)
KNOWLEDGE_GRAPH_AI_DRY_RUN = get_bool_env('KNOWLEDGE_GRAPH_AI_DRY_RUN', True)
KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER = os.getenv('KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER', 'gigachat').strip().lower()
KNOWLEDGE_GRAPH_EMBEDDING_API_KEY = os.getenv('KNOWLEDGE_GRAPH_EMBEDDING_API_KEY')
KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL = os.getenv('KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL')
KNOWLEDGE_GRAPH_EMBEDDING_MODEL = os.getenv('KNOWLEDGE_GRAPH_EMBEDDING_MODEL')
KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS = get_int_env('KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS', 1536)
KNOWLEDGE_GRAPH_EMBEDDING_TIMEOUT_SECONDS = get_float_env('KNOWLEDGE_GRAPH_EMBEDDING_TIMEOUT_SECONDS', 10.0)
KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS = get_float_env(
    'KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS',
    0.0,
)
KNOWLEDGE_GRAPH_CHAT_PROVIDER = os.getenv('KNOWLEDGE_GRAPH_CHAT_PROVIDER', 'deepseek').strip().lower()
KNOWLEDGE_GRAPH_CHAT_API_KEY = os.getenv('KNOWLEDGE_GRAPH_CHAT_API_KEY')
KNOWLEDGE_GRAPH_CHAT_BASE_URL = os.getenv('KNOWLEDGE_GRAPH_CHAT_BASE_URL', 'https://api.deepseek.com')
KNOWLEDGE_GRAPH_CHAT_MODEL = os.getenv('KNOWLEDGE_GRAPH_CHAT_MODEL')
KNOWLEDGE_GRAPH_CHAT_TIMEOUT_SECONDS = get_float_env('KNOWLEDGE_GRAPH_CHAT_TIMEOUT_SECONDS', 20.0)
KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS = get_float_env(
    'KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS',
    0.0,
)
KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP = get_float_env('KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP', 0.0)
KNOWLEDGE_GRAPH_GIGACHAT_SCOPE = os.getenv('KNOWLEDGE_GRAPH_GIGACHAT_SCOPE', 'GIGACHAT_API_PERS')
KNOWLEDGE_GRAPH_GIGACHAT_AUTH_URL = os.getenv('KNOWLEDGE_GRAPH_GIGACHAT_AUTH_URL')
KNOWLEDGE_GRAPH_GIGACHAT_VERIFY_SSL_CERTS = get_bool_env('KNOWLEDGE_GRAPH_GIGACHAT_VERIFY_SSL_CERTS', True)
KNOWLEDGE_GRAPH_GIGACHAT_CA_BUNDLE_FILE = os.getenv('KNOWLEDGE_GRAPH_GIGACHAT_CA_BUNDLE_FILE')
KNOWLEDGE_GRAPH_GIGACHAT_MAX_RETRIES = get_int_env('KNOWLEDGE_GRAPH_GIGACHAT_MAX_RETRIES', 0)


QUESTION_DRAFT_ASSISTANT_OPENAI_API_KEY = os.getenv('QUESTION_DRAFT_ASSISTANT_OPENAI_API_KEY')
QUESTION_DRAFT_ASSISTANT_OPENAI_BASE_URL = os.getenv(
    'QUESTION_DRAFT_ASSISTANT_OPENAI_BASE_URL',
    'https://api.openai.com/v1/chat/completions',
)
QUESTION_DRAFT_ASSISTANT_OPENAI_MODEL = os.getenv('QUESTION_DRAFT_ASSISTANT_OPENAI_MODEL')
QUESTION_DRAFT_ASSISTANT_OPENAI_TIMEOUT_SECONDS = get_float_env(
    'QUESTION_DRAFT_ASSISTANT_OPENAI_TIMEOUT_SECONDS',
    10.0,
)

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'False').strip().lower() in {'1', 'true', 'yes', 'on'}

ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", default="*").split(",")


# Приложения
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'drf_spectacular',
    'django_filters',
    'corsheaders',
    'storages',
]

LOCAL_APPS = [
    'apps.user',
    'apps.qa',
    'apps.knowledge',
    'apps.notifications',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# Список Middleware для обработки запросов
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173',
).split(',')

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# База данных
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

if DJANGO_TEST_SQLITE:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'test.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': os.getenv('DATABASE_NAME'),
            'USER': os.getenv('DATABASE_USER'),
            'PASSWORD': os.getenv('DATABASE_USER_PASSWORD'),
            'HOST': os.getenv('DATABASE_HOST'),
            'PORT': os.getenv('DATABASE_PORT'),
        }
    }


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

AUTH_USER_MODEL = 'user.CustomUser'

# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'

# Настройка DRF
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.LimitOffsetPagination',
    'PAGE_SIZE': 5,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_RATES': {
        'knowledge_graph_rebuild': os.getenv('KNOWLEDGE_GRAPH_REBUILD_RATE_LIMIT', '3/hour'),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=15),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'USER_ID_FIELD': 'user_id',
    'USER_ID_CLAIM': 'user_id'
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'StackOverflow 2.0',
    'DESCRIPTION': 'API для проекта StackOverflow 2.0',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'ENUM_NAME_OVERRIDES': {
        'VoteTypeEnum': VOTE_TYPE_CHOICES,
    },
    'EXTENSIONS': {
        'drf_spectacular.extensions': [
            'drf_spectacular.contrib.django_filters.DjangoFilterExtension',
        ],
    },
}
# S3 Boto3 Storage Configuration
CLOUD_TENANT_ID = os.getenv('CLOUD_TENANT_ID')
CLOUD_ACCESS_KEY = os.getenv('CLOUD_ACCESS_KEY')

if CLOUD_TENANT_ID and CLOUD_ACCESS_KEY:
    AWS_ACCESS_KEY_ID = f"{CLOUD_TENANT_ID}:{CLOUD_ACCESS_KEY}"
else:
    AWS_ACCESS_KEY_ID = CLOUD_ACCESS_KEY

AWS_SECRET_ACCESS_KEY = os.getenv('CLOUD_SECRET_KEY')
AWS_STORAGE_BUCKET_NAME = os.getenv('CLOUD_BUCKET_NAME', 'stackoverflow-avatars')
AWS_S3_ENDPOINT_URL = os.getenv('CLOUD_ENDPOINT_URL', 'https://s3.cloud.ru')
AWS_S3_REGION_NAME = os.getenv('CLOUD_REGION', 'ru-central-1')

AWS_DEFAULT_ACL = 'public-read'
AWS_S3_FILE_OVERWRITE = True
AWS_QUERYSTRING_AUTH = True

if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }
