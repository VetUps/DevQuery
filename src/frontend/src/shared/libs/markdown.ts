import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true,
})

export function renderMarkdown(source: string) {
  const normalizedSource = source.trim()

  if (!normalizedSource) {
    return ''
  }

  const rendered = marked.parse(normalizedSource) as string

  return DOMPurify.sanitize(rendered)
}
