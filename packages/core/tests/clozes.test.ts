import { describe, it, expect } from 'vitest'
import {
  BLANK_MARK,
  TENDING,
  clozeFace,
  clozeProblem,
  conceptStanding,
  isDue,
  locateBlank,
  maskCloze,
  memoryColumns,
  memoryOf,
  tendPhrase,
  type Cloze,
} from '../src/clozes'
import { AGAIN, EASY, GOOD, freshMemory } from '../src/fsrs'

const PASSAGE = 'Saving a resource is intent; only consuming it counts.'

function cloze(over: Partial<Cloze> = {}): Cloze {
  const blank = over.blank ?? 'consuming'
  const text = over.text ?? PASSAGE
  const start = text.indexOf(blank)
  return {
    id: 'c1',
    concept_id: 'k1',
    lesson_id: 'l1',
    topic_id: 't1',
    text,
    prefix: null,
    blank,
    blank_start: start,
    blank_end: start + blank.length,
    hint: null,
    created_by: 'ai',
    stability: null,
    difficulty: null,
    state: 'new',
    reps: 0,
    lapses: 0,
    due: '2026-09-12T09:00:00.000Z',
    last_reviewed_at: null,
    created_at: '2026-09-12T09:00:00.000Z',
    updated_at: '2026-09-12T09:00:00.000Z',
    ...over,
  }
}

describe('clozeFace', () => {
  it('splits the passage at the blank', () => {
    expect(clozeFace(cloze())).toEqual({
      before: 'Saving a resource is intent; only ',
      blank: 'consuming',
      after: ' it counts.',
    })
  })

  it('finds the blank by its words when the offsets have gone stale', () => {
    // The passage was edited and the offsets were not moved with it.
    const edited = cloze({ text: `In this app, ${PASSAGE}` })
    const face = clozeFace({ ...edited, blank_start: 34, blank_end: 43 })
    expect(face.blank).toBe('consuming')
    expect(face.before.endsWith('only ')).toBe(true)
  })

  it('hides nothing rather than throwing when the blank is not there at all', () => {
    const face = clozeFace(cloze({ blank: 'photosynthesis' }))
    expect(face).toEqual({ before: PASSAGE, blank: '', after: '' })
  })
})

describe('maskCloze', () => {
  it('draws the blank where the words were', () => {
    expect(maskCloze(cloze())).toBe(
      `Saving a resource is intent; only ${BLANK_MARK} it counts.`
    )
  })

  it('takes a mark of its own, for a list row or a title', () => {
    expect(maskCloze(cloze(), '[…]')).toBe(
      'Saving a resource is intent; only […] it counts.'
    )
  })
})

describe('clozeProblem', () => {
  it('passes an ordinary cloze', () => {
    expect(clozeProblem(PASSAGE, 'consuming')).toBeNull()
  })

  it('refuses a passage too short to stand in', () => {
    expect(clozeProblem('It counts.', 'counts')).toMatch(/whole sentence/)
  })

  it('refuses a passage too long to answer in one go', () => {
    expect(clozeProblem('word '.repeat(120), 'word')).toMatch(/too long/)
  })

  it('refuses an empty blank', () => {
    expect(clozeProblem(PASSAGE, '  ')).toMatch(/words to take out/)
  })

  it('refuses a blank that swallows the sentence', () => {
    expect(clozeProblem(PASSAGE, PASSAGE.slice(0, 40))).toMatch(/too little/)
  })

  it('refuses a blank that is not in the passage', () => {
    expect(clozeProblem(PASSAGE, 'photosynthesis')).toMatch(/not in the passage/)
  })

  it('takes the offset as the answer when the words appear twice', () => {
    const twice = 'Intent is not consuming, and consuming is not intent.'
    expect(clozeProblem(twice, 'consuming', 29)).toBeNull()
  })
})

describe('locateBlank', () => {
  it('finds the words', () => {
    expect(locateBlank(PASSAGE, 'consuming')).toEqual({ start: 34, end: 43 })
  })

  it('prefers the offset the selection reported, for words that repeat', () => {
    const twice = 'Intent is not consuming, and consuming is not intent.'
    expect(locateBlank(twice, 'consuming', 29)).toEqual({ start: 29, end: 38 })
    expect(locateBlank(twice, 'consuming')).toEqual({ start: 14, end: 23 })
  })

  it('falls back to the words when the offset is wrong', () => {
    expect(locateBlank(PASSAGE, 'consuming', 3)).toEqual({ start: 34, end: 43 })
  })

  it('answers with nothing when the words are absent', () => {
    expect(locateBlank(PASSAGE, 'photosynthesis')).toBeNull()
    expect(locateBlank(PASSAGE, '')).toBeNull()
  })
})

describe('the scheduler state on a row', () => {
  it('reads off and writes back the same thing', () => {
    const fresh = freshMemory(new Date('2026-09-12T09:00:00.000Z'))
    const row = cloze({ ...memoryColumns(fresh) })
    expect(memoryOf(row)).toEqual(fresh)
  })

  it('calls a cloze due when its moment has come or gone', () => {
    const now = new Date('2026-09-12T09:00:00.000Z')
    expect(isDue(cloze({ due: '2026-09-12T09:00:00.000Z' }), now)).toBe(true)
    expect(isDue(cloze({ due: '2026-09-11T09:00:00.000Z' }), now)).toBe(true)
    expect(isDue(cloze({ due: '2026-09-13T09:00:00.000Z' }), now)).toBe(false)
  })
})

describe('TENDING', () => {
  it('offers three answers, on the scheduler\'s own rungs', () => {
    expect(TENDING.map(t => t.rating)).toEqual([AGAIN, GOOD, EASY])
  })

  it('says what each one means, so the reader is not guessing', () => {
    for (const rung of TENDING) {
      expect(rung.label.length).toBeGreaterThan(0)
      expect(rung.note.endsWith('.')).toBe(true)
    }
  })
})

describe('tendPhrase', () => {
  it('counts, and agrees with itself', () => {
    expect(tendPhrase(0)).toBe('Nothing is due')
    expect(tendPhrase(1)).toBe('1 cloze is due')
    expect(tendPhrase(9)).toBe('9 clozes are due')
  })
})

describe('conceptStanding', () => {
  it('counts what is due, what is held and what is new', () => {
    const now = new Date('2026-09-12T09:00:00.000Z')
    const standing = conceptStanding(
      [
        cloze({ id: 'a', state: 'new', due: '2026-09-12T08:00:00.000Z' }),
        cloze({ id: 'b', state: 'review', stability: 60, due: '2026-11-01T09:00:00.000Z' }),
        cloze({ id: 'c', state: 'review', stability: 3, due: '2026-09-12T06:00:00.000Z' }),
      ],
      now
    )
    expect(standing).toEqual({ due: 2, held: 1, fresh: 1 })
  })
})
