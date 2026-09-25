import { describe, it, expect } from 'vitest'
import { isAskContext, contextPreamble, foldInto } from '../src/ask'

describe('an ask context', () => {
  it('accepts the shape the panel sends', () => {
    expect(isAskContext({ route: 'lesson', entityId: 'a', title: 'Compounding' })).toBe(true)
  })

  it('rejects an unknown route, because the preamble would lie about where the reader is', () => {
    expect(isAskContext({ route: 'nowhere' })).toBe(false)
  })

  it('rejects a non-object', () => {
    expect(isAskContext(null)).toBe(false)
    expect(isAskContext('lesson')).toBe(false)
  })

  it('rejects a field of the wrong type, which is what a hand-written body looks like', () => {
    expect(isAskContext({ route: 'lesson', title: 42 })).toBe(false)
  })
})

describe('the preamble', () => {
  it('names the lesson and the section', () => {
    const out = contextPreamble({
      route: 'lesson',
      entityId: 'a',
      title: 'Compounding',
      sectionId: 'what-compounds',
    })
    expect(out).toContain('Compounding')
    expect(out).toContain('what-compounds')
  })

  it('carries the selected passage when there is one', () => {
    const out = contextPreamble({ route: 'lesson', title: 'X', quote: 'the rate is annual' })
    expect(out).toContain('the rate is annual')
  })

  it('says where the reader is even with nothing but a route', () => {
    expect(contextPreamble({ route: 'other' })).not.toBe('')
  })
})

describe('folding a discussion into a lesson', () => {
  const body = [
    '# Compounding',
    '',
    'Intro prose.',
    '',
    '## What compounds',
    '',
    'The first section.',
    '',
    '## What does not',
    '',
    'The second section.',
  ].join('\n')

  it('puts the section after the one it was asked from', () => {
    const out = foldInto(body, 'what-compounds', '## On rates\n\nAdded prose.')
    const first = out.indexOf('The first section.')
    const added = out.indexOf('Added prose.')
    const second = out.indexOf('The second section.')
    expect(first).toBeLessThan(added)
    expect(added).toBeLessThan(second)
  })

  it('keeps every word of the original', () => {
    const out = foldInto(body, 'what-compounds', '## On rates\n\nAdded prose.')
    for (const line of ['Intro prose.', 'The first section.', 'The second section.']) {
      expect(out).toContain(line)
    }
  })

  it('appends when the section is gone, because a regenerated lesson must not swallow the fold', () => {
    const out = foldInto(body, 'a-heading-that-went-away', '## On rates\n\nAdded prose.')
    expect(out).toContain('Added prose.')
    expect(out.indexOf('The second section.')).toBeLessThan(out.indexOf('Added prose.'))
  })

  it('appends when there is no heading at all', () => {
    const out = foldInto('Just prose, no headings.', 'anything', '## On rates\n\nAdded.')
    expect(out).toContain('Just prose, no headings.')
    expect(out).toContain('Added.')
  })

  it('appends when no section was recorded', () => {
    const out = foldInto(body, undefined, '## On rates\n\nAdded prose.')
    expect(out.indexOf('The second section.')).toBeLessThan(out.indexOf('Added prose.'))
  })

  it('folds after the last section by appending, not into the middle of it', () => {
    const out = foldInto(body, 'what-does-not', '## On rates\n\nAdded prose.')
    expect(out.indexOf('The second section.')).toBeLessThan(out.indexOf('Added prose.'))
  })
})
