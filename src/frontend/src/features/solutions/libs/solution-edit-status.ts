import type { SolutionEditApprovalState } from '@/features/solutions/api/solutionEdits'

export type SolutionEditStatusTone = 'pending' | 'approved' | 'rejected'

export function formatSolutionEditStatus(status: SolutionEditApprovalState) {
  if (status === true) {
    return 'Одобрено'
  }

  if (status === false) {
    return 'Отклонено'
  }

  return 'Ожидает'
}

export function resolveSolutionEditStatusTone(status: SolutionEditApprovalState): SolutionEditStatusTone {
  if (status === true) {
    return 'approved'
  }

  if (status === false) {
    return 'rejected'
  }

  return 'pending'
}
