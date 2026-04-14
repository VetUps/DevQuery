import type { SolutionEditRecord } from '@/features/solutions/api/solutionEdits'

export interface SolutionEditGroup {
  solutionId: string
  questionId: string
  questionTitle: string
  solutionExcerpt: string
  items: SolutionEditRecord[]
}

export function groupSolutionEditsBySolution(items: SolutionEditRecord[]) {
  const groups = new Map<string, SolutionEditGroup>()

  items.forEach((item) => {
    const existingGroup = groups.get(item.solution_id)

    if (existingGroup) {
      existingGroup.items.push(item)
      return
    }

    groups.set(item.solution_id, {
      solutionId: item.solution_id,
      questionId: item.solution_question_id,
      questionTitle: item.solution_question_title,
      solutionExcerpt: item.solution_excerpt,
      items: [item],
    })
  })

  return Array.from(groups.values())
}
