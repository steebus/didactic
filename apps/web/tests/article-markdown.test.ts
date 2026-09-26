// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@/lib/extract/markdown'
import { renderMarkdown } from '@/lib/markdown'
import { lessonSections } from '@didactic/core/sections'

/**
 * An article, brought into the shape a lesson is read in.
 *
 * Tested through to what the reader prints, not only to the markdown:
 * what matters is that the words on the page are the article's words,
 * that its headings are listed as sections, and that nothing it says
 * is mistaken for syntax on the way.
 */
const BASE = 'https://example.com/posts/custody'
const md = (html: string) => htmlToMarkdown(html, BASE)
const printed = (html: string) => {
  const holder = document.createElement('div')
  holder.innerHTML = renderMarkdown(md(html))
  return holder
}

describe('htmlToMarkdown', () => {
  it('keeps headings, so the article has sections to summarise', () => {
    const out = md('<h2>What custody is</h2><p>The broker holds it.</p><h3>Who holds what</h3><p>You own it.</p>')
    expect(lessonSections(out).map(s => s.text)).toEqual(['What custody is', 'Who holds what'])
  })

  it('keeps paragraphs apart and collapses the page’s whitespace', () => {
    expect(md('<p>One\n   two.</p><p>Three.</p>')).toBe('One two.\n\nThree.')
  })

  it('keeps lists, nested ones indented under their item', () => {
    const out = md('<ul><li>First<ul><li>inner</li></ul></li><li>Second</li></ul><ol start="3"><li>Third</li></ol>')
    expect(out).toContain('- First')
    expect(out).toContain('  - inner')
    expect(out).toContain('- Second')
    expect(out).toContain('3. Third')
  })

  it('makes links and pictures absolute, and drops anything that is not http', () => {
    const out = md(
      '<p><a href="/about">About</a> and <a href="javascript:alert(1)">this</a> <img src="../img/a.png" alt="A chart"></p>'
    )
    expect(out).toContain('[About](https://example.com/about)')
    expect(out).not.toContain('javascript')
    expect(out).toContain('this')
    expect(out).toContain('![A chart](https://example.com/img/a.png)')
  })

  it('reads prices as prices, not as mathematics', () => {
    const page = printed('<p>It costs $5 and then $10 a month.</p>')
    expect(page.textContent).toContain('It costs $5 and then $10 a month.')
    expect(page.querySelector('math')).toBeNull()
  })

  it('reads a paragraph that begins like a list or a heading as a paragraph', () => {
    const page = printed('<p># of users</p><p>2. Then this</p><p>- and so</p>')
    expect(page.querySelector('h1, ol, ul')).toBeNull()
    expect(page.textContent).toContain('# of users')
    expect(page.textContent).toContain('2. Then this')
  })

  it('keeps emphasis and inline code, and does not let a stray asterisk start one', () => {
    const page = printed('<p>A <strong>bold</strong> claim, <em>quietly</em>, about <code>x*y</code> and 5 * 3.</p>')
    expect(page.querySelector('strong')?.textContent).toBe('bold')
    expect(page.querySelector('em')?.textContent).toBe('quietly')
    expect(page.querySelector('code')?.textContent).toBe('x*y')
    expect(page.textContent).toContain('5 * 3')
  })

  it('keeps code blocks as code, never as one of the lesson’s interactive blocks', () => {
    const out = md('<pre><code class="language-chart">{"kind": "line"}</code></pre>')
    expect(out.startsWith('```\n')).toBe(true)
    expect(printed('<pre><code>let x = 1\nlet y = 2</code></pre>').querySelector('pre')?.textContent).toContain(
      'let y = 2'
    )
  })

  it('keeps quotes and plain tables', () => {
    const page = printed(
      '<blockquote><p>Said well.</p></blockquote><table><tr><th>Fee</th><th>Rate</th></tr><tr><td>Custody</td><td>0.1%</td></tr></table>'
    )
    expect(page.querySelector('blockquote')?.textContent).toContain('Said well.')
    expect(page.querySelectorAll('td')).toHaveLength(2)
  })

  it('drops what was only ever the page’s', () => {
    const out = md('<p>Kept.</p><script>alert(1)</script><style>p{}</style><form><input value="x"></form>')
    expect(out).toBe('Kept.')
  })
})
