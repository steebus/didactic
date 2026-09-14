import { describe, it, expect } from 'vitest'
import { byDay, dayName, dayOf, strandOf, clips, ENTRY_CLIP } from '../src/timeline'

const at = (created_at: string, over: Record<string, unknown> = {}) => ({ created_at, ...over })

describe('byDay', () => {
  it('gathers a day into one run', () => {
    const days = byDay([
      at('2026-09-14T22:00:00'),
      at('2026-09-14T09:00:00'),
      at('2026-09-11T12:00:00'),
    ])
    expect(days.map(d => d.date)).toEqual(['2026-09-14', '2026-09-11'])
    expect(days[0].entries).toHaveLength(2)
  })

  it('keeps each day running the same way as the timeline', () => {
    // Newest first throughout: a timeline read downward is a walk
    // backwards, and a day running the other way would be a small
    // reversal inside a large one.
    const days = byDay([at('2026-09-14T22:00:00'), at('2026-09-14T09:00:00')])
    expect(days[0].entries[0].created_at).toBe('2026-09-14T22:00:00')
  })

  it('starts a new run when the day changes and comes back', () => {
    // Rows arrive ordered, but nothing here assumes it: two runs of the
    // same date stay two runs rather than being silently merged, which
    // is what a grouping keyed by date would have done.
    const days = byDay([
      at('2026-09-14T10:00:00'),
      at('2026-09-11T10:00:00'),
      at('2026-09-14T09:00:00'),
    ])
    expect(days).toHaveLength(3)
  })

  it('has nothing to say about nothing', () => {
    expect(byDay([])).toEqual([])
  })
})

describe('dayName', () => {
  const now = new Date('2026-09-14T12:00:00')

  it('names the two days a reader locates by memory', () => {
    expect(dayName('2026-09-14', now)).toBe('Today')
    expect(dayName('2026-09-13', now)).toBe('Yesterday')
  })

  it('dates the rest, without the year when it is this one', () => {
    expect(dayName('2026-09-11', now)).toBe('11 September')
  })

  it('prints the year once it is not this one', () => {
    expect(dayName('2025-12-30', now)).toBe('30 December 2025')
  })

  it('says so rather than printing NaN', () => {
    expect(dayName('unknown', now)).toBe('Undated')
    expect(dayName('nonsense', now)).toBe('Undated')
  })

  it('crosses a month and a year without arithmetic errors', () => {
    expect(dayName('2025-12-31', new Date('2026-01-01T12:00:00'))).toBe('Yesterday')
    expect(dayName('2026-02-28', new Date('2026-03-01T12:00:00'))).toBe('Yesterday')
  })
})

describe('dayOf', () => {
  it('files a late evening under the day it was written', () => {
    // Local, not UTC: a UTC boundary would file a third of someone's
    // evenings under tomorrow.
    expect(dayOf('2026-09-14T23:30:00')).toBe('2026-09-14')
  })

  it('does not throw on something that is not a date', () => {
    expect(dayOf('not a date')).toBe('unknown')
  })
})

describe('strandOf', () => {
  it('tells the three kinds apart', () => {
    expect(strandOf({ kind: 'diary', quote: '' })).toBe('entry')
    expect(strandOf({ kind: 'mark', quote: 'a sentence' })).toBe('passage')
    // A mark with no passage is a note on the lesson as a whole, which
    // is neither a quotation nor an entry.
    expect(strandOf({ kind: 'mark', quote: '' })).toBe('note')
  })
})

describe('clips', () => {
  it('leaves a short entry whole', () => {
    expect(clips('Short.')).toBe(false)
    expect(clips(null)).toBe(false)
    expect(clips('x'.repeat(ENTRY_CLIP))).toBe(false)
  })

  it('opens one long enough to bury what is under it', () => {
    expect(clips('x'.repeat(ENTRY_CLIP + 1))).toBe(true)
  })
})
