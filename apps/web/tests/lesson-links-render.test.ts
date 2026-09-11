import { describe, it, expect } from 'vitest'
import { lessonRoster } from '@didactic/core/lessonLinks'
import { renderMarkdown, STUB_NOTE } from '@/lib/markdown'

/**
 * Resolving a `lesson:` name is pure and lives in
 * `@didactic/core/lessonLinks`, where it is tested on its own. What is
 * under test here is the printing: `renderMarkdown` needs `marked` and
 * a DOM to sanitise against, so it stays in the app and so does this.
 */

const lesson = (title: string, id: string, topicTitle: string | null, here = true) => ({
  id, title, topicTitle, here,
})

describe('a lesson written into a map', () => {
  const roster = lessonRoster([lesson('Settlement and custody', 'abc', 'Brokerage')])

  it('prints a name it holds as a link to that lesson', () => {
    const html = renderMarkdown('A trade [settles](lesson:settlement-and-custody) later.', undefined, roster)

    expect(html).toContain('<a href="/lesson/abc"')
    expect(html).toContain('title="Settlement and custody"')
    expect(html).toContain('>settles</a>')
  })

  it('prints a name it does not hold as a stub, keeping the words', () => {
    const html = renderMarkdown('A trade [settles](lesson:clearing-houses) later.', undefined, roster)

    // The sentence was built on the words, so the words stay. What
    // goes is the way anywhere: no href, so nothing to press and
    // nothing in the tab order.
    expect(html).toContain('>settles</a>')
    expect(html).toContain('data-stub')
    expect(html).toContain(`title="${STUB_NOTE}"`)
    expect(html).not.toContain('href')
  })

  it('is all stubs where there is no map to read against', () => {
    const html = renderMarkdown('A trade [settles](lesson:settlement-and-custody) later.')

    expect(html).toContain('data-stub')
    expect(html).not.toContain('href')
  })

  it('leaves every other link exactly as it was', () => {
    const html = renderMarkdown('Read [the note](https://example.com/note).', undefined, roster)

    expect(html).toContain('href="https://example.com/note"')
    // Links out are still opened beside the reading.
    expect(html).toContain('target="_blank"')
    expect(html).not.toContain('data-stub')
  })

  it('does not follow a name written inside a specimen block', () => {
    const html = renderMarkdown(
      '```\n[settles](lesson:settlement-and-custody)\n```',
      undefined,
      roster
    )

    // A fenced example is printed, not read: the reader asked to see
    // the markup, not to be given the link it describes.
    expect(html).toContain('lesson:settlement-and-custody')
    expect(html).not.toContain('<a')
  })

  it('keeps the emphasis inside the words it links', () => {
    const html = renderMarkdown('[**settles** here](lesson:settlement-and-custody)', undefined, roster)

    expect(html).toContain('<strong>settles</strong> here</a>')
  })
})
