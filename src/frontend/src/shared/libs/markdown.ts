// Кратко: держит основную логику этого файла.
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import { marked, type Tokens } from 'marked'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)

const languageAliases: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
}

const languageLabels: Record<string, string> = {
  bash: 'Bash',
  java: 'Java',
  javascript: 'JavaScript',
  python: 'Python',
  sql: 'SQL',
  typescript: 'TypeScript',
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeLanguage(rawLanguage?: string) {
  const language = String(rawLanguage ?? '').trim().split(/\s+/)[0].toLowerCase()

  if (!language) {
    return ''
  }

  return languageAliases[language] ?? language
}

function renderCodeBlock(token: Tokens.Code) {
  const normalizedLanguage = normalizeLanguage(token.lang)
  const canHighlight = Boolean(normalizedLanguage && hljs.getLanguage(normalizedLanguage))
  const highlightedCode = canHighlight
    ? hljs.highlight(token.text, { language: normalizedLanguage, ignoreIllegals: true }).value
    : escapeHtml(token.text)
  const languageLabel = canHighlight ? languageLabels[normalizedLanguage] ?? normalizedLanguage : 'Code'
  const languageClass = canHighlight ? ` language-${normalizedLanguage}` : ''

  return `<figure class="markdown-code-block"><figcaption class="markdown-code-block__header"><span class="markdown-code-block__language">${escapeHtml(languageLabel)}</span></figcaption><pre class="markdown-code-block__pre"><code class="hljs${languageClass}">${highlightedCode}</code></pre></figure>`
}

marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    code(token: Tokens.Code) {
      return renderCodeBlock(token)
    },
  },
})

export function renderMarkdown(source: string) {
  const normalizedSource = source.trim()

  if (!normalizedSource) {
    return ''
  }

  const rendered = marked.parse(normalizedSource) as string

  return DOMPurify.sanitize(rendered)
}
