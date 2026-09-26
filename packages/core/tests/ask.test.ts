import { describe, it, expect } from 'vitest'
import { isAskContext, contextPreamble, foldInto, groupChats, askOrigin } from '../src/ask'

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

describe('folding, against what a heading actually is', () => {
  /**
   * The fold once found its own headings with a plain line regex, which
   * disagreed with the contents rail about fences, indents, trailing
   * hashes and duplicate names. The fence case corrupted the lesson; the
   * rest quietly appended. One grammar now answers both.
   */
  it('never lands inside a fenced block', () => {
    const body = [
      '# Shell basics',
      '',
      '## Pipes',
      '',
      'Pipes join commands.',
      '',
      '```sh',
      '# Copying files',
      'cp a b',
      '```',
      '',
      '## Copying files',
      '',
      'How cp works.',
    ].join('\n')

    const out = foldInto(body, 'pipes', '## Folded\n\nNEW')

    const fenceStart = out.indexOf('```sh')
    const fenceEnd = out.indexOf('```', fenceStart + 5)
    const added = out.indexOf('NEW')
    expect(added).toBeGreaterThan(-1)
    expect(added > fenceStart && added < fenceEnd).toBe(false)

    // The fence survives whole, and its contents stay inside it.
    expect(out).toContain('```sh\n# Copying files\ncp a b\n```')
  })

  it('finds a heading indented up to three spaces', () => {
    const body = ['# Top', '', '  ## Indented', '', 'One.', '', '## Next', '', 'Two.'].join('\n')
    const out = foldInto(body, 'indented', '## Folded\n\nNEW')
    expect(out.indexOf('One.')).toBeLessThan(out.indexOf('NEW'))
    expect(out.indexOf('NEW')).toBeLessThan(out.indexOf('Two.'))
  })

  it('finds a heading written with trailing hashes', () => {
    const body = ['# Top', '', '## Done ##', '', 'One.', '', '## Next ##', '', 'Two.'].join('\n')
    const out = foldInto(body, 'done', '## Folded\n\nNEW')
    expect(out.indexOf('One.')).toBeLessThan(out.indexOf('NEW'))
    expect(out.indexOf('NEW')).toBeLessThan(out.indexOf('Two.'))
  })

  it('finds a heading whose text carries markup', () => {
    const body = ['# Top', '', '## The **hard** part', '', 'One.', '', '## After', '', 'Two.'].join('\n')
    const out = foldInto(body, 'the-hard-part', '## Folded\n\nNEW')
    expect(out.indexOf('One.')).toBeLessThan(out.indexOf('NEW'))
    expect(out.indexOf('NEW')).toBeLessThan(out.indexOf('Two.'))
  })

  it('tells two sections of the same name apart', () => {
    const body = [
      '# Top', '', '## Example', '', 'First.', '',
      '## Middle', '', 'Mid.', '',
      '## Example', '', 'Second.', '',
      '## End', '', 'Last.',
    ].join('\n')

    // The second "Example" is `example-2` in the contents rail, and the
    // fold has to mean the same one by it.
    const out = foldInto(body, 'example-2', '## Folded\n\nNEW')
    expect(out.indexOf('Second.')).toBeLessThan(out.indexOf('NEW'))
    expect(out.indexOf('NEW')).toBeLessThan(out.indexOf('Last.'))
  })

  it('keeps every word of the body whatever it does', () => {
    const body = [
      '# Top', '', '## One', '', 'Alpha.', '',
      '```js', '## Not a heading', 'const x = 1', '```', '',
      '## Two', '', 'Beta.',
    ].join('\n')
    const out = foldInto(body, 'one', '## Folded\n\nNEW')
    for (const word of ['Alpha.', 'Beta.', 'const x = 1', '## Not a heading']) {
      expect(out).toContain(word)
    }
  })
})

describe('arranging a pile of old chats', () => {
  const at = (iso: string, title?: string, id = iso) => ({
    id,
    startedAt: iso,
    context: { route: 'lesson' as const, ...(title ? { title } : {}) },
  })

  const now = new Date('2026-09-25T12:00:00Z')

  it('groups by the day a person would name, not by a date on every row', () => {
    const groups = groupChats(
      [
        at('2026-09-25T09:00:00Z'),
        at('2026-09-24T09:00:00Z'),
        at('2026-09-21T09:00:00Z'),
        at('2026-05-02T09:00:00Z'),
      ],
      'date',
      now
    )
    expect(groups.map(g => g.title)).toEqual(['Today', 'Yesterday', 'This week', 'May 2026'])
  })

  it('keeps the newest group first, because the rows arrive that way', () => {
    const groups = groupChats([at('2026-09-25T09:00:00Z'), at('2026-09-24T09:00:00Z')], 'date', now)
    expect(groups[0].title).toBe('Today')
  })

  it('gathers by what the conversation was about', () => {
    const groups = groupChats(
      [
        at('2026-09-25T09:00:00Z', 'Compounding', 'a'),
        at('2026-09-24T09:00:00Z', 'Borrowing', 'b'),
        at('2026-09-23T09:00:00Z', 'Compounding', 'c'),
      ],
      'subject',
      now
    )
    expect(groups.map(g => g.title)).toEqual(['Borrowing', 'Compounding'])
    expect(groups[1].chats.map(c => c.id)).toEqual(['a', 'c'])
  })

  it('puts everything asked from nowhere in particular last, under one heading', () => {
    const groups = groupChats(
      [at('2026-09-25T09:00:00Z', undefined, 'a'), at('2026-09-24T09:00:00Z', 'Zebras', 'b')],
      'subject',
      now
    )
    expect(groups.map(g => g.title)).toEqual(['Zebras', 'Asked from elsewhere'])
  })

  it('gives every group a key that can be remembered and keyed on', () => {
    const groups = groupChats([at('2026-09-25T09:00:00Z', 'The hard part')], 'subject', now)
    expect(groups[0].key).toBe('the-hard-part')
  })

  it('has nothing to say about nothing', () => {
    expect(groupChats([], 'date', now)).toEqual([])
  })
})

describe('where a conversation was begun', () => {
  it('names the lesson, topic or subject it was asked from', () => {
    expect(
      askOrigin({ route: 'lesson', entityId: 'l1', title: 'DNS', sectionId: 'caching' })
    ).toEqual({ kind: 'lesson', id: 'l1', title: 'DNS', sectionId: 'caching' })
    expect(askOrigin({ route: 'subject', entityId: 's1', title: 'Networking' })).toEqual({
      kind: 'subject',
      id: 's1',
      title: 'Networking',
    })
  })

  it('falls back to the row for an id the context lost', () => {
    expect(askOrigin({ route: 'topic', title: 'TTL' }, { topicId: 't9' })?.id).toBe('t9')
    expect(askOrigin({ route: 'lesson' }, { lessonId: 'l9' })).toEqual({
      kind: 'lesson',
      id: 'l9',
      title: 'A lesson',
    })
  })

  it('offers nothing it cannot link to', () => {
    expect(askOrigin({ route: 'other' })).toBeNull()
    expect(askOrigin({ route: 'subject', title: 'Lost' })).toBeNull()
    expect(askOrigin({ route: 'cards' })).toEqual({ kind: 'cards', title: 'Your cards' })
  })
})
