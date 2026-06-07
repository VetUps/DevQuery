# Кратко: помогает проверить черновик вопроса.
from rest_framework import serializers

from apps.qa.serializers import MAX_QUESTION_TAGS, normalize_question_tags
from .question_draft_assistant_provider import (
    DraftAssistantProviderConfigurationError,
    DraftAssistantProviderError,
    DraftAssistantProviderMalformedResponse,
    DraftAssistantProviderTimeout,
    OpenAICompatibleQuestionDraftAssistantProvider,
    QuestionDraftAssistantProvider,
    parse_raw_assistant_response,
)


class QuestionDraftAssistantService:
    STATUS_OK = 'ok'
    ASSISTANT_UNAVAILABLE_STATUS = 'assistant_unavailable'
    MODE_CREATE = 'create'

    WARNING_PROVIDER_NOT_CONFIGURED = 'provider_not_configured'
    WARNING_PROVIDER_ERROR = 'provider_error'
    WARNING_PROVIDER_TIMEOUT = 'provider_timeout'
    WARNING_MALFORMED_PROVIDER_OUTPUT = 'malformed_provider_output'
    WARNING_INVALID_SUGGESTED_TAG = 'invalid_suggested_tag'
    WARNING_TOO_MANY_SUGGESTED_TAGS = 'too_many_suggested_tags'

    def __init__(self, provider: QuestionDraftAssistantProvider | None = None):
        """Готовит объект к работе и сохраняет начальные данные."""
        self.provider = provider if provider is not None else OpenAICompatibleQuestionDraftAssistantProvider()

    def review_draft(self, *, user, draft):
        """Проверяет черновик вопроса через помощника и возвращает безопасный ответ."""
        mode = draft.get('mode', self.MODE_CREATE)

        if self.provider is None:
            return self._safe_unavailable_dto(
                mode=mode,
                warning_code=self.WARNING_PROVIDER_NOT_CONFIGURED,
                warning_message='Помощник не настроен.',
            )

        try:
            raw_response = self.provider.review_draft(user=user, draft=draft)
            parsed_response = parse_raw_assistant_response(raw_response)
        except DraftAssistantProviderTimeout:
            return self._safe_unavailable_dto(
                mode=mode,
                warning_code=self.WARNING_PROVIDER_TIMEOUT,
                warning_message='Помощник не успел ответить. Попробуйте позже.',
            )
        except DraftAssistantProviderConfigurationError:
            return self._safe_unavailable_dto(
                mode=mode,
                warning_code=self.WARNING_PROVIDER_NOT_CONFIGURED,
                warning_message='Помощник не настроен.',
            )
        except DraftAssistantProviderMalformedResponse:
            return self._safe_unavailable_dto(
                mode=mode,
                warning_code=self.WARNING_MALFORMED_PROVIDER_OUTPUT,
                warning_message='Помощник вернул некорректный ответ. Можно продолжить вручную.',
            )
        except DraftAssistantProviderError:
            return self._safe_unavailable_dto(
                mode=mode,
                warning_code=self.WARNING_PROVIDER_ERROR,
                warning_message='Помощник временно недоступен. Можно продолжить вручную.',
            )

        suggested_tags, tag_warnings = self._normalize_suggested_tags(parsed_response['suggested_tags'])

        return {
            'status': self.STATUS_OK,
            'mode': mode,
            'summary': parsed_response['summary'],
            'findings': parsed_response['findings'],
            'suggested_title': parsed_response['suggested_title'],
            'suggested_body': parsed_response['suggested_body'],
            'suggested_tags': suggested_tags,
            'warnings': tag_warnings,
        }

    def _safe_unavailable_dto(self, *, mode, warning_code, warning_message):
        """Возвращает безопасный ответ, когда помощник недоступен."""
        return {
            'status': self.ASSISTANT_UNAVAILABLE_STATUS,
            'mode': mode,
            'summary': '',
            'findings': [],
            'suggested_title': None,
            'suggested_body': None,
            'suggested_tags': [],
            'warnings': [
                {
                    'code': warning_code,
                    'message': warning_message,
                },
            ],
        }

    def _normalize_suggested_tags(self, raw_tags):
        """Приводит suggested теги к рабочему виду."""
        normalized_tags = []
        seen_tags = set()
        warnings = []

        for raw_tag in raw_tags:
            try:
                normalized_tag = normalize_question_tags([raw_tag])[0]
            except (serializers.ValidationError, IndexError):
                warnings.append({
                    'code': self.WARNING_INVALID_SUGGESTED_TAG,
                    'message': 'Один из предложенных тегов пропущен: он не соответствует правилам тегов.',
                })
                continue

            if normalized_tag in seen_tags:
                continue

            if len(normalized_tags) >= MAX_QUESTION_TAGS:
                warnings.append({
                    'code': self.WARNING_TOO_MANY_SUGGESTED_TAGS,
                    'message': f'Помощник предложил больше {MAX_QUESTION_TAGS} уникальных тегов; лишние теги пропущены.',
                })
                continue

            seen_tags.add(normalized_tag)
            normalized_tags.append(normalized_tag)

        return normalized_tags, warnings
