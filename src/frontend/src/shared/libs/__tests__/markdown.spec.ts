import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '@/shared/libs/markdown'

describe('renderMarkdown', () => {
  it('renders fenced code with a language badge and syntax highlighting classes', () => {
    const html = renderMarkdown('```ts\nconst answer: number = 42\n```')

    expect(html).toContain('class="markdown-code-block"')
    expect(html).toContain('class="markdown-code-block__language">TypeScript</span>')
    expect(html).toContain('language-typescript')
    expect(html).toContain('hljs-keyword')
  })

  it('falls back to a plain code badge for unsupported languages without injecting raw HTML', () => {
    const html = renderMarkdown('```unknown\n<script>alert(1)</script>\n```')

    expect(html).toContain('class="markdown-code-block__language">Code</span>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})
