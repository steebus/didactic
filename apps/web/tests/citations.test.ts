import { describe, it, expect } from 'vitest'
import { unsupportedCitations, passagePromptSection, type CitedPassage } from '@/lib/citations'
import { renderMarkdown } from '@/lib/markdown'
import { sourceRoster, type SourceLink } from '@didactic/core/sourceLinks'

const passage = (over: Partial<CitedPassage> = {}): CitedPassage => ({
  id: 'p1',
  resourceId: 'r1',
  sourceTitle: 'Rules of Play',
  slug: 'rules-of-play',
  pageFrom: 112,
  pageTo: 113,
  heading: 'Systems',
  content: 'A game is a system in which players engage in an artificial conflict.',
  ...over,
})

describe('unsupportedCitations', () => {
  it('passes a citation of a page it was actually shown', () => {
    const body = 'The [classic statement](source:rules-of-play#p112) of it.'
    expect(unsupportedCitations(body, [passage()])).toEqual([])
  })

  it('passes a page inside a passage that runs over', () => {
    const body = 'As [put there](source:rules-of-play#p113).'
    expect(unsupportedCitations(body, [passage()])).toEqual([])
  })

  it('catches a page nobody handed over', () => {
    // The failure this exists for: a real book, a plausible page, and
    // nothing behind it. It reads exactly like a real citation.
    const body = 'As [argued](source:rules-of-play#p400) at length.'
    expect(unsupportedCitations(body, [passage()])).toEqual([
      { slug: 'rules-of-play', page: 400 },
    ])
  })

  it('catches a document that was never in the prompt', () => {
    const body = 'See [the other book](source:a-theory-of-fun#p12).'
    expect(unsupportedCitations(body, [passage()])).toEqual([
      { slug: 'a-theory-of-fun', page: 12 },
    ])
  })

  it('allows citing the work as a whole, if it was drawn from', () => {
    const body = 'Throughout [the book](source:rules-of-play).'
    expect(unsupportedCitations(body, [passage()])).toEqual([])
  })

  it('refuses the work as a whole when it was not drawn from', () => {
    const body = 'Throughout [some book](source:never-shown).'
    expect(unsupportedCitations(body, [passage()])).toEqual([
      { slug: 'never-shown', page: null },
    ])
  })

  it('finds nothing to complain about in a lesson that cites nothing', () => {
    expect(unsupportedCitations('Just prose, and a [lesson](lesson:x).', [passage()])).toEqual([])
  })
})

describe('passagePromptSection', () => {
  it('is empty when there is nothing to cite, so the prompt is unchanged', () => {
    expect(passagePromptSection([])).toBe('')
  })

  it('prints the exact name the agent must copy beside every passage', () => {
    const section = passagePromptSection([passage()])

    expect(section).toContain('source:rules-of-play#p112')
    expect(section).toContain('page 112')
    expect(section).toContain('Systems')
    expect(section).toContain('artificial conflict')
  })

  it('tells the agent that citing nothing is a legitimate answer', () => {
    // Without this the agent reliably finds a reason to cite all six,
    // and a lesson with a citation on every paragraph is a lesson
    // nobody checked.
    expect(passagePromptSection([passage()])).toMatch(/cite nothing/i)
  })
})

describe('a citation, rendered', () => {
  const shelf: SourceLink[] = [{ id: 'r1', title: 'Rules of Play', pageCount: 300 }]
  const roster = sourceRoster(shelf)

  it('becomes a link to the passage', () => {
    const html = renderMarkdown(
      'The [classic statement](source:rules-of-play#p112) of it.',
      undefined,
      undefined,
      roster
    )

    expect(html).toContain('href="/source/r1?page=112"')
    expect(html).toContain('title="Rules of Play, page 112"')
    expect(html).toContain('data-cite')
    expect(html).toContain('classic statement')
  })

  it('prints as a stub when the document has left the shelf', () => {
    const html = renderMarkdown(
      'The [classic statement](source:a-book-nobody-has#p9) of it.',
      undefined,
      undefined,
      roster
    )

    expect(html).toContain('data-stub')
    expect(html).not.toContain('href=')
    // The sentence still says what it needed to say.
    expect(html).toContain('classic statement')
  })

  it('prints as a stub when the page is past the end of the document', () => {
    // A page the agent invented. It must not be given a working link:
    // the reader would follow it, find something else, and trust it.
    const html = renderMarkdown(
      'As [argued](source:rules-of-play#p900).',
      undefined,
      undefined,
      roster
    )

    expect(html).toContain('data-stub')
    expect(html).not.toContain('href="/source/')
  })

  it('prints as a stub when nothing was handed over to resolve against', () => {
    const html = renderMarkdown('A [citation](source:rules-of-play#p1).')
    expect(html).toContain('data-stub')
  })

  it('leaves an ordinary link alone', () => {
    const html = renderMarkdown('[out](https://example.com)', undefined, undefined, roster)

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).not.toContain('data-cite')
  })

  it('does not follow a citation written inside a code fence', () => {
    // marked has decided what is prose and what is a specimen before a
    // link token exists, so this is printed rather than linked.
    const html = renderMarkdown(
      '```\n[x](source:rules-of-play#p1)\n```',
      undefined,
      undefined,
      roster
    )

    expect(html).not.toContain('href="/source/')
    expect(html).toContain('source:rules-of-play#p1')
  })

  it('survives the sanitiser with its page intact', () => {
    // The page rides in the href rather than in an attribute, so
    // whatever the sanitiser does to attributes it cannot lose it.
    const html = renderMarkdown('[a](source:rules-of-play#p57)', undefined, undefined, roster)
    expect(html).toContain('page=57')
  })
})
