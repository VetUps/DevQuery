// Кратко: держит основную логику этого файла.
import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { updateQuestion, type QuestionDetail, type UpdateQuestionPayload } from '@/features/questions/api/questions'

interface UpdateQuestionVariables {
  questionId: string
  payload: UpdateQuestionPayload
}

export function useUpdateQuestionMutation() {
  return useMutation<QuestionDetail, Error, UpdateQuestionVariables>({
    mutationFn: ({ questionId, payload }) => updateQuestion(questionId, payload),
    onSuccess: async (updatedQuestion) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['questions', 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['questions', 'detail', updatedQuestion.question_id] }),
      ])
    },
  })
}
