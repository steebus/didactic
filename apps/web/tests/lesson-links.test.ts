import { describe, it, expect } from 'vitest'
import { lessonRoster, lessonSlug, resolveLesson, LESSON_SCHEME } from '@/lib/lessonLinks'
import { renderMarkdown, STUB_NOTE } from '@/lib/markdown'

const lesson = (title: string, id: string, topicTitle: string | null, here = true) => ({
  id, title, topicTitle, here,
})

describe('naming a lesson', () => {
  it('is the title, slugged the way a heading is', () => {
    expect(lessonSlug('Settlement and custody')).toBe('settlement-and-custody')
    expect(lessonSlug('Why now? (and not later)')).toBe('why-now-and-not-later')
  })

  it('takes a name and nothing that is not one', () => {
    expect(LESSON_SCHEME.exec('lesson:settlement-and-custody')?.[1]).toBe('settlement-and-custody')
    expect(LESSON_SCHEME.test('https://example.com')).toBe(false)
    expect(LESSON_SCHEME.test('lesson:')).toBe(false)
    // Nothing that could carry a path or a second scheme through.
    expect(LESSON_SCHEME.test('lesson:../../etc')).toBe(false)
    expect(LESSON_SCHEME.test('lesson:javascript:alert(1)')).toBe(false)
  })
})

describe('the roster', () => {
  it('reaches a lesson by the name of its title', () => {
    const roster = lessonRoster([lesson('Settlement and custody', 'abc', 'Brokerage')])

    expect(resolveLesson(roster, 'settlement-and-custody')).toEqual({
      href: '/lesson/abc',
      label: 'Settlement and custody',
    })
  })

  it('says where a lesson outside the topic sits, before the press', () => {
    const roster = lessonRoster([lesson('Worked example', 'far', 'Order routing', false)])

    expect(resolveLesson(roster, 'worked-example')?.label).toBe(
      'Worked example — in Order routing'
    )
  })

  it('gives a name two lessons answer to to the nearer one', () => {
    // "Worked example" under three routes of one subject is ordinary.
    const roster = lessonRoster([
      lesson('Worked example', 'far', 'Order routing', false),
      lesson('Worked example', 'near', 'Brokerage', true),
    ])

    expect(resolveLesson(roster, 'worked-example')?.href).toBe('/lesson/near')
  })

  it('answers to nothing it has never been told about', () => {
    expect(resolveLesson(lessonRoster([]), 'settlement-and-custody')).toBeNull()
  })
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
