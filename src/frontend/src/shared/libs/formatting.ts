export function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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
