import { describe, it, expect } from 'vitest'
import {
  byDay,
  dayName,
  dayOf,
  strandOf,
  clips,
  gist,
  opens,
  ENTRY_CLIP,
  MARK_CLIP,
  STRAND_LABEL,
  tallyOf,
} from '../src/timeline'

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

describe('gist', () => {
  const mark = (over: Record<string, unknown> = {}) => ({ kind: 'mark', quote: null, note: null, ...over }) as never

  it('leads a passage with the passage, even when a note sits under it', () => {
    // The quote is what was kept, and it is what the row is recognised
    // by a month later.
    expect(gist(mark({ quote: 'Price is what you pay.', note: 'Compare with Graham.' })))
      .toBe('Price is what you pay.')
  })

  it('leads a note on a lesson with the note', () => {
    expect(gist(mark({ note: 'This is the bit I keep forgetting.' })))
      .toBe('This is the bit I keep forgetting.')
  })

  it('clips with an ellipsis written into the text', () => {
    const long = 'a'.repeat(MARK_CLIP + 40)
    const out = gist(mark({ quote: long }))
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBe(MARK_CLIP + 1)
  })

  it("gives an entry the entry's longer clip", () => {
    const long = 'b'.repeat(ENTRY_CLIP + 40)
    expect(gist(mark({ kind: 'diary', note: long }))).toHaveLength(ENTRY_CLIP + 1)
  })

  it('is empty when there is nothing to show', () => {
    expect(gist(mark({}))).toBe('')
  })
})

describe('opens', () => {
  const mark = (over: Record<string, unknown> = {}) => ({ kind: 'mark', quote: null, note: null, ...over }) as never

  it('is false for a passage that fits and has nothing under it', () => {
    // A toggle that opens onto the same sentence teaches the reader
    // that the toggles are not worth pressing.
    expect(opens(mark({ quote: 'Short enough.' }))).toBe(false)
  })

  it('is true for a passage with a note under it', () => {
    expect(opens(mark({ quote: 'Short enough.', note: 'But worth saying why.' }))).toBe(true)
  })

  it('is true for anything longer than its own clip', () => {
    expect(opens(mark({ quote: 'x'.repeat(MARK_CLIP + 1) }))).toBe(true)
    expect(opens(mark({ note: 'x'.repeat(MARK_CLIP + 1) }))).toBe(true)
    expect(opens(mark({ kind: 'diary', note: 'x'.repeat(ENTRY_CLIP + 1) }))).toBe(true)
  })

  it('holds an entry to the entry clip, not the mark clip', () => {
    expect(opens(mark({ kind: 'diary', note: 'x'.repeat(MARK_CLIP + 1) }))).toBe(false)
  })

  it('ignores whitespace-only notes', () => {
    expect(opens(mark({ quote: 'Kept.', note: '   ' }))).toBe(false)
  })
})

describe('STRAND_LABEL', () => {
  it('names every strand the sheet can print', () => {
    expect(STRAND_LABEL.entry).toBe('Entry')
    expect(STRAND_LABEL.passage).toBe('Passage')
    expect(STRAND_LABEL.note).toBe('Note')
  })
})

describe('tallyOf', () => {
  const rows = (kinds: string[]) => kinds.map(kind => ({ kind })) as never[]

  it('counts the two apart, because they are two different things', () => {
    expect(tallyOf(rows(['mark', 'mark', 'diary']))).toBe('2 marks · 1 entry')
  })

  it('prints only what there is', () => {
    expect(tallyOf(rows(['mark']))).toBe('1 mark')
    expect(tallyOf(rows(['diary', 'diary']))).toBe('2 entries')
    expect(tallyOf(rows([]))).toBe('')
  })
})
