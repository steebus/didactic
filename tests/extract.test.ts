import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractFromHtml } from '@/lib/extract/url'

const html = readFileSync(join(__dirname, 'fixtures/article.html'), 'utf-8')

describe('extractFromHtml', () => {
  it('pulls the title', () => {
    expect(extractFromHtml(html, 'https://example.com/a').title)
      .toBe('Understanding React Hooks')
  })

  it('keeps the article body', () => {
    const { text } = extractFromHtml(html, 'https://example.com/a')
    expect(text).toContain('useState hook returns a stateful value')
    expect(text).toContain('useEffect hook lets you perform side effects')
  })

  it('strips navigation and footer chrome', () => {
    const { text } = extractFromHtml(html, 'https://example.com/a')
    expect(text).not.toContain('Home | About | Contact')
    expect(text).not.toContain('Copyright 2026')
  })

  it('throws on unparseable input rather than returning empty text', () => {
    expect(() => extractFromHtml('<html><body></body></html>', 'https://example.com/a'))
      .toThrow('no readable content')
  })
})
