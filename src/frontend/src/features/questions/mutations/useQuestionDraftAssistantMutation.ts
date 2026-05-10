import { useMutation } from '@tanstack/vue-query'

import {
  requestQuestionDraftAssist,
  type DraftAssistantResponse,
  type QuestionDraftAssistPayload,
} from '@/features/questions/api/questionDraftAssistant'

export function useQuestionDraftAssistantMutation() {
  return useMutation<DraftAssistantResponse, Error, QuestionDraftAssistPayload>({
    mutationFn: requestQuestionDraftAssist,
  })
}
