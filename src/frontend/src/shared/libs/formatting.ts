export function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatQuestionStatus(status: string) {
  const statusMap: Record<string, string> = {
    open: 'Открыт',
    closed: 'Закрыт',
    solved: 'Решён',
  }

  return statusMap[status] ?? status
}
