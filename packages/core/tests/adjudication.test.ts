import { describe, it, expect } from 'vitest'
import {
  arrived,
  closeness,
  counsel,
  established,
  filedUnder,
  holdings,
  overlap,
  sharedSubjects,
} from '../src/adjudication'
import type { TopicEvidence } from '../src/shapes'

const nothing: TopicEvidence = {
  subjects: [],
  sources: [],
  resources: 0,
  lessons: 0,
  marks: 0,
  exposures: 0,
}

const held = (over: Partial<TopicEvidence>): TopicEvidence => ({ ...nothing, ...over })

describe('closeness', () => {
  it('says how close in words, not in a number', () => {
    expect(closeness(0.95)).toBe('almost the same wording')
    expect(closeness(0.9)).toBe('very close wording')
    expect(closeness(0.84)).toBe('close wording')
  })
})

describe('holdings', () => {
  it('says plainly when a topic is holding nothing', () => {
    // Not "0 resources · 0 lessons": a row of zeroes reads as a table
    // that failed to load, and the fact itself is the useful part.
    expect(holdings(nothing)).toBe('Nothing filed against it yet')
  })

  it('prints only what there is', () => {
    expect(holdings(held({ resources: 4, marks: 1 }))).toBe('4 resources · 1 mark')
  })

  it('counts a reading as a reading', () => {
    expect(holdings(held({ exposures: 1 }))).toBe('read once')
    expect(holdings(held({ exposures: 3 }))).toBe('read 3 times')
  })

  it('singularises everything it counts', () => {
    expect(holdings(held({ resources: 1, lessons: 1, marks: 1 }))).toBe(
      '1 resource · 1 lesson · 1 mark'
    )
  })
})

describe('established', () => {
  it('is about having been read, not about having been filed', () => {
    // A resource filed against a topic is intent. Only a lesson, a mark
    // or an exposure says anyone has actually been there -- which is
    // the distinction the whole product rests on.
    expect(established(held({ resources: 9 }))).toBe(false)
    expect(established(held({ marks: 1 }))).toBe(true)
    expect(established(held({ lessons: 1 }))).toBe(true)
    expect(established(held({ exposures: 1 }))).toBe(true)
  })
})

describe('counsel', () => {
  it('warns hardest when both sides hold history', () => {
    const line = counsel(held({ marks: 2 }), held({ exposures: 1 }), true)
    expect(line).toContain('cannot be undone')
    expect(line).toContain('keep them separate')
  })

  it('says a bare name costs nothing to fold in', () => {
    expect(counsel(nothing, held({ lessons: 3 }), true)).toContain('bare name')
  })

  it('falls back to the wording when a description is missing', () => {
    expect(counsel(nothing, nothing, false)).toContain('only the wording to go on')
  })

  it('never tells the reader to merge', () => {
    // The model may raise a question and may never settle one, and
    // neither may this line.
    const lines = [
      counsel(held({ marks: 2 }), held({ exposures: 1 }), true),
      counsel(nothing, held({ lessons: 3 }), true),
      counsel(nothing, nothing, false),
      counsel(nothing, nothing, true),
    ]
    for (const line of lines) expect(line).not.toMatch(/^Merge them/)
  })
})

describe('filedUnder', () => {
  it('names the beds, or says there are none', () => {
    expect(filedUnder(nothing)).toBe('Filed under nothing yet')
    expect(
      filedUnder(held({ subjects: [{ id: 'a', title: 'Investing' }, { id: 'b', title: 'Markets' }] }))
    ).toBe('Investing, Markets')
  })
})

describe('sharedSubjects', () => {
  it('finds the beds both sit in', () => {
    const a = held({ subjects: [{ id: 'a', title: 'Investing' }, { id: 'b', title: 'Markets' }] })
    const b = held({ subjects: [{ id: 'b', title: 'Markets' }] })
    expect(sharedSubjects(a, b)).toEqual(['Markets'])
  })

  it('is empty when they sit apart, which is an argument against merging', () => {
    const a = held({ subjects: [{ id: 'a', title: 'Investing' }] })
    const b = held({ subjects: [{ id: 'c', title: 'Photography' }] })
    expect(sharedSubjects(a, b)).toEqual([])
  })
})

describe('overlap', () => {
  it('names the bed they share, which is the argument for one thing', () => {
    const a = held({ subjects: [{ id: 'a', title: 'Investing' }] })
    const b = held({ subjects: [{ id: 'a', title: 'Investing' }] })
    expect(overlap(a, b)).toBe('Both sit under Investing.')
  })

  it('says when one of them is not filed anywhere', () => {
    expect(overlap(nothing, held({ subjects: [{ id: 'a', title: 'Investing' }] })))
      .toContain('not filed anywhere yet')
  })

  it('says different beds are usually two things', () => {
    const a = held({ subjects: [{ id: 'a', title: 'Investing' }] })
    const b = held({ subjects: [{ id: 'c', title: 'Photography' }] })
    expect(overlap(a, b)).toContain('usually two things')
  })
})

describe('arrived', () => {
  const now = new Date('2026-09-14T12:00:00Z')
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString()

  it('reads at the scale the decision is made on', () => {
    expect(arrived(ago(1), now)).toBe('just now')
    expect(arrived(ago(20), now)).toBe('20 minutes ago')
    expect(arrived(ago(60), now)).toBe('1 hour ago')
    expect(arrived(ago(60 * 5), now)).toBe('5 hours ago')
    expect(arrived(ago(60 * 24), now)).toBe('1 day ago')
    expect(arrived(ago(60 * 24 * 9), now)).toBe('9 days ago')
  })

  it('becomes a date past a month', () => {
    // "47 days ago" is a number nobody converts back into a week they
    // remember.
    expect(arrived('2026-07-04T09:00:00', now)).toBe('4 July')
  })

  it('says so rather than printing Invalid Date', () => {
    expect(arrived('not a date', now)).toBe('undated')
  })
})
