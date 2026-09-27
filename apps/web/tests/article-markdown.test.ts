// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@/lib/extract/markdown'
import { extractFromHtml } from '@/lib/extract/url'
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

  it('keeps a line break as a line break, and two as a new paragraph', () => {
    const out = md('<p>Man is his own star;  <br>  and the soul that can<br>Render an honest man.<br><br>Cast the bantling.<br></p>')
    expect(out).toBe('Man is his own star;\\\nand the soul that can\\\nRender an honest man.\n\nCast the bantling.')
    const page = printed('<blockquote><p>One line<br>two line</p></blockquote>')
    expect(page.querySelectorAll('br')).toHaveLength(1)
    expect(page.querySelectorAll('p')).toHaveLength(1)
  })

  it('keeps line breaks in a loose run of text, a list item and a pre', () => {
    expect(printed('<div>First<br>second</div>').querySelectorAll('br')).toHaveLength(1)
    expect(printed('<ul><li>First<br>second</li></ul>').querySelector('li br')).not.toBeNull()
    expect(printed('<pre>let x = 1<br>let y = 2</pre>').querySelector('pre')?.textContent).toContain('1\nlet y')
  })

  it('reads a line after a break that begins like syntax as prose', () => {
    const page = printed('<p>Counted<br># of users<br>- and so<br>---</p>')
    expect(page.querySelector('h1, h2, ul, hr')).toBeNull()
    expect(page.textContent).toContain('# of users')
  })

  it('reads a break in a heading, a table cell or a caption as a space', () => {
    expect(md('<h2>Self-<br>Reliance</h2>')).toBe('## Self- Reliance')
    expect(md('<table><tr><td>a<br>b</td></tr></table>')).toContain('| a b |')
  })

  it('keeps emphasis and a link whole across a break', () => {
    const page = printed('<p><em>one<br><br>two</em> and <a href="/x">three<br>four</a></p>')
    expect(page.querySelector('em')?.textContent).toBe('onetwo')
    expect(page.querySelector('a')?.textContent).toBe('threefour')
  })
})

describe('pop-up notes', () => {
  const page = (body: string) =>
    `<html><head><title>Self-Reliance</title></head><body><article>${'<p>Filler that makes this an article. </p>'.repeat(
      8
    )}${body}</article></body></html>`

  it('sets a pop-up note as a numbered note at the foot', () => {
    const { html } = extractFromHtml(
      page(
        `<p>"Ne te quæsiveris extra." <a href="javascript:void(0);" onClick="return overlib('Do not seek yourself outside yourself.', STICKY)">eclat</a> and <a href="javascript:void(0)" onmouseover="overlib(&quot;Splendor; \\&quot;show\\&quot;.&quot;)">write on the lintels</a> here.</p>`
      ),
      BASE
    )
    const out = htmlToMarkdown(html, BASE)
    expect(out).toContain('eclat¹ and write on the lintels² here.')
    expect(out).toMatch(/\*\*Notes\*\*\n\n1\. Do not seek yourself outside yourself\.\n2\. Splendor; "show"\.$/)
    expect(out).not.toContain('javascript')
    // The foot is not a section of the article.
    expect(lessonSections(out).map(s => s.text)).not.toContain('Notes')
  })

  it('reads a note’s words and nothing else, and leaves a link that is only a script alone', () => {
    const { html } = extractFromHtml(
      page(
        `<p><a href="javascript:void(0)" onclick="overlib('<b>Bold</b> <img src=x onerror=alert(1)>note')">a</a> <a href="javascript:go()" onclick="go()">b</a> <a href="https://example.com/c" onclick="track('c')">c</a></p>`
      ),
      BASE
    )
    const out = htmlToMarkdown(html, BASE)
    expect(out).toContain('1. Bold note')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('2.')
    expect(out).toContain('a¹ b [c](https://example.com/c)')
  })

  it('escapes a note as prose', () => {
    const out = md('<p><span data-didactic-note="# $5 *each*">cost</span></p>')
    expect(out).toContain('1. \\# \\$5 \\*each\\*')
  })
})
