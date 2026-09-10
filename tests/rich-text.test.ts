// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { editorHtmlToMarkdown, markdownToEditorHtml } from '@/lib/richText'

/** Serialise what a contenteditable box would be holding. */
function box(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return editorHtmlToMarkdown(el)
}

describe('editorHtmlToMarkdown', () => {
  it('takes a box with nothing in it as nothing', () => {
    expect(box('')).toBe('')
    expect(box('<p><br></p>')).toBe('')
  })

  it('reads a bare run of text as one paragraph', () => {
    expect(box('Worth remembering.')).toBe('Worth remembering.')
  })

  it('marks up emphasis, whichever tag the browser reached for', () => {
    expect(box('<p>A <b>firm</b> and <i>quiet</i> point.</p>')).toBe(
      'A **firm** and *quiet* point.'
    )
    expect(box('<p>A <strong>firm</strong> and <em>quiet</em> point.</p>')).toBe(
      'A **firm** and *quiet* point.'
    )
  })

  it('keeps the marks against the words rather than the spaces', () => {
    // `** bold **` is emphasis in no parser at all.
    expect(box('<p>A<b> firm </b>point.</p>')).toBe('A **firm** point.')
  })

  it('parts paragraphs, however the browser drew them', () => {
    expect(box('<div>First.</div><div>Second.</div>')).toBe('First.\n\nSecond.')
    expect(box('<p>First.<br>Second.</p>')).toBe('First.\n\nSecond.')
  })

  it('keeps a bolded word in the line it was typed in', () => {
    // What a box holds after bolding a word and carrying on typing:
    // an element beside a bare text node, which is one paragraph.
    expect(box('<b>Cold and dry</b>&nbsp;is the whole of it.')).toBe(
      '**Cold and dry** is the whole of it.'
    )
  })

  it('reads a list the browser nested inside a paragraph', () => {
    // Starting a list mid-paragraph leaves the <ul> inside the <p>.
    expect(box('<p>Two things.<ul><li>One</li><li>Two</li></ul></p>')).toBe(
      'Two things.\n\n- One\n- Two'
    )
  })

  it('steps a nested list in rather than flattening it', () => {
    expect(box('<ul><li>One<ul><li>Under it</li></ul></li><li>Two</li></ul>')).toBe(
      '- One\n  - Under it\n- Two'
    )
  })

  it('writes both kinds of list', () => {
    expect(box('<ul><li>One</li><li>Two</li></ul>')).toBe('- One\n- Two')
    expect(box('<ol><li>One</li><li>Two</li></ol>')).toBe('1. One\n2. Two')
  })

  it('keeps a link', () => {
    expect(box('<p>See <a href="https://example.com/a">this</a>.</p>')).toBe(
      'See [this](https://example.com/a).'
    )
  })

  it('escapes what would otherwise be read as markup', () => {
    expect(box('<p>The * and the _ and the [ are literal.</p>')).toBe(
      'The \\* and the \\_ and the \\[ are literal.'
    )
    expect(box('<p># Not a heading</p>')).toBe('\\# Not a heading')
    expect(box('<p>- Not a list</p>')).toBe('\\- Not a list')
    expect(box('<p>1. Not a list</p>')).toBe('\\1. Not a list')
  })

  it('drops the non-breaking spaces a box leaves behind', () => {
    expect(box('<p>A point made.</p>')).toBe('A point made.')
  })

  it('takes code as written', () => {
    expect(box('<p>Call <code>a*b</code> on it.</p>')).toBe('Call `a*b` on it.')
  })
})

describe('markdownToEditorHtml', () => {
  it('fills the box with what the note says', () => {
    expect(markdownToEditorHtml('A **firm** point.')).toContain('<strong>firm</strong>')
    expect(markdownToEditorHtml('- One\n- Two')).toContain('<li>One</li>')
  })

  it('leaves an empty note empty rather than printing a stray paragraph', () => {
    expect(markdownToEditorHtml('')).toBe('')
    expect(markdownToEditorHtml('   ')).toBe('')
  })

  it('allows a note nothing a note has no business carrying', () => {
    const html = markdownToEditorHtml('# Heading\n\n<script>alert(1)</script>')
    expect(html).not.toContain('<h1')
    expect(html).not.toContain('script')
  })
})

describe('a note that goes round the loop', () => {
  const cases = [
    'Plain enough.',
    'A **firm** and *quiet* point.',
    'First.\n\nSecond.',
    '- One\n- Two',
    '1. One\n2. Two',
    'See [this](https://example.com/a).',
    'The \\* is literal.',
    'Call `a*b` on it.',
    '- One\n  - Under it\n- Two',
    'A line.\n\n- One\n- Two',
  ]

  for (const markdown of cases) {
    it(`comes back as it went in: ${JSON.stringify(markdown)}`, () => {
      const el = document.createElement('div')
      el.innerHTML = markdownToEditorHtml(markdown)
      expect(editorHtmlToMarkdown(el)).toBe(markdown)
    })
  }
})
