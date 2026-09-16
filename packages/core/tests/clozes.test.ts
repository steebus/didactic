import { describe, it, expect } from 'vitest'
import {
  BLANK_MARK,
  TENDING,
  BLANK_WORDS_MAX,
  FALSE_WORD,
  TRUE_WORD,
  cardAnchor,
  cardBack,
  cardFront,
  cardKey,
  cardProblem,
  cardTruth,
  clozeFace,
  clozeProblem,
  conceptStanding,
  shuffled,
  isDue,
  locateBlank,
  mathSpans,
  maskCloze,
  memoryColumns,
  memoryOf,
  tendPhrase,
  type Cloze,
} from '../src/clozes'
import { AGAIN, EASY, GOOD, HARD, freshMemory, review, waitPhrase } from '../src/fsrs'

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
    kind: 'cloze',
    text,
    prefix: null,
    blank,
    blank_start: start,
    blank_end: start + blank.length,
    question: null,
    answer: null,
    note: null,
    anchor: null,
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
  it('offers every rung the scheduler was fitted on, in order', () => {
    // All four. The weights were measured against reviews graded this
    // way, so a sheet offering fewer answers on a ruler the fit does
    // not know.
    expect(TENDING.map(t => t.rating)).toEqual([AGAIN, HARD, GOOD, EASY])
  })

  it('says what each one means, so the reader is not guessing', () => {
    for (const rung of TENDING) {
      expect(rung.label.length).toBeGreaterThan(0)
      expect(rung.note.endsWith('.')).toBe(true)
    }
  })

  it('gives the four different words, which is what makes them choosable', () => {
    expect(new Set(TENDING.map(t => t.label)).size).toBe(4)
    expect(new Set(TENDING.map(t => t.note)).size).toBe(4)
  })
})

describe('tendPhrase', () => {
  it('counts, and agrees with itself', () => {
    expect(tendPhrase(0)).toBe('Nothing is due')
    expect(tendPhrase(1)).toBe('1 card is due')
    expect(tendPhrase(9)).toBe('9 cards are due')
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

describe('the four answers against the scheduler they are fitted to', () => {
  // The labels are only honest if the arithmetic behind them agrees:
  // a struggle must lengthen the interval, and lengthen it less than
  // getting it did. This is the test that would catch a rung wired to
  // the wrong number.
  const held = () => ({
    ...memoryOf(cloze()),
    stability: 14,
    difficulty: 5,
    state: 'review' as const,
    lastReviewedAt: '2026-09-12T09:00:00.000Z',
  })

  it('lengthens the wait for every answer but the miss', () => {
    const at = new Date('2026-09-26T09:00:00.000Z')
    const waits = TENDING.map(rung => review(held(), rung.rating, at).intervalDays)
    const [gone, struggle, got, easy] = waits

    expect(gone).toBeLessThan(1)
    expect(struggle).toBeGreaterThanOrEqual(1)
    expect(struggle).toBeLessThan(got)
    expect(got).toBeLessThan(easy)
  })

  it('offers a first-time card the waits the design record prints', () => {
    // DESIGN.md and PARITY.md quote this row. They are quoting the
    // weights and `waitPhrase` together, and neither document can
    // notice when one of them moves -- so the row is pinned here.
    const fresh = freshMemory(new Date('2026-09-12T09:00:00.000Z'))
    const row = TENDING.map(
      rung => `${rung.label} \u00b7 ${waitPhrase(review(fresh, rung.rating).intervalDays)}`
    )
    expect(row).toEqual([
      'Gone \u00b7 10 min',
      'A struggle \u00b7 1 d',
      'Got it \u00b7 3 d',
      'Easy \u00b7 15 d',
    ])
  })

  it('reads a struggle as a recall, not as a lapse', () => {
    const at = new Date('2026-09-26T09:00:00.000Z')
    const struggle = review(held(), HARD, at).memory
    expect(struggle.state).toBe('review')
    expect(struggle.lapses).toBe(0)
    // And it still makes the card harder, which "only just" means.
    expect(struggle.difficulty!).toBeGreaterThan(held().difficulty!)
  })
})

describe('a blank against the mathematics in a passage', () => {
  const EQUATION = 'The equation $2^x = 100$ has no ordinary answer.'

  it('finds the formulas in a passage', () => {
    expect(mathSpans(EQUATION)).toEqual([{ start: 13, end: 24 }])
    expect(mathSpans('none here')).toEqual([])
  })

  it('reads a display formula as one span, not two empty ones', () => {
    expect(mathSpans('see $$a = b$$ there')).toEqual([{ start: 4, end: 13 }])
  })

  it('leaves prices out of it, as the renderer does', () => {
    expect(mathSpans('It cost $5 and then $10 more.')).toEqual([])
  })

  it('allows a blank clear of the formula', () => {
    expect(clozeProblem(EQUATION, 'ordinary')).toBeNull()
  })

  it('allows a blank that takes the whole formula, delimiters and all', () => {
    expect(clozeProblem(EQUATION, '$2^x = 100$')).toBeNull()
  })

  it('refuses a blank that cuts a formula in half', () => {
    // The card draws the passage in three pieces and typesets each, so
    // half an equation either side of a hole is two broken formulas.
    expect(clozeProblem(EQUATION, '100$')).toMatch(/whole formula/)
    expect(clozeProblem(EQUATION, 'The equation $2^x')).toMatch(/whole formula/)
  })

  it('refuses a blank buried inside a formula', () => {
    expect(clozeProblem(EQUATION, '100')).toMatch(/whole formula/)
  })
})

/* ------------------------------------------------------------------ *
 *  The three shapes (046)
 * ------------------------------------------------------------------ */

/** A standard card, built off the same fixture so the two shapes are
 *  tested as the one row type they actually are. */
const standard = (over: Partial<Cloze> = {}): Cloze =>
  cloze({
    kind: 'qa',
    text: null,
    blank: null,
    blank_start: null,
    blank_end: null,
    question: 'What is a CDN?',
    answer: 'Edge servers that serve content from near the visitor.',
    ...over,
  })

describe('a card of any shape, read the same way', () => {
  it('reads a cloze front as the passage with its blank drawn', () => {
    expect(cardFront(cloze())).toBe(
      `Saving a resource is intent; only ${BLANK_MARK} it counts.`
    )
    expect(cardBack(cloze())).toBe('consuming')
  })

  it('reads a question card front and back off its own two columns', () => {
    expect(cardFront(standard())).toBe('What is a CDN?')
    expect(cardBack(standard())).toBe('Edge servers that serve content from near the visitor.')
  })

  it('says whether a true-or-false holds, and nothing for the others', () => {
    expect(cardTruth(standard({ kind: 'truefalse', answer: TRUE_WORD }))).toBe(true)
    expect(cardTruth(standard({ kind: 'truefalse', answer: FALSE_WORD }))).toBe(false)
    expect(cardTruth(standard())).toBeNull()
    expect(cardTruth(cloze())).toBeNull()
  })

  /* A row the database would refuse, read defensively: this runs on
     rows, and a card that throws is a sitting that stops. */
  it('says nothing rather than guessing for a verdict that is neither word', () => {
    expect(cardTruth(standard({ kind: 'truefalse', answer: 'Sometimes' }))).toBeNull()
  })
})

describe('the sentence a card is drawn on', () => {
  it('takes the anchor where there is one', () => {
    expect(cardAnchor(cloze({ anchor: 'The lesson said this.' }))).toBe('The lesson said this.')
  })

  /* Every cloze written before 046 quoted its lesson, so its passage is
     its anchor. Nothing has to be backfilled for the wash to keep
     appearing exactly where it always did. */
  it('falls back to the passage for a cloze that has none', () => {
    expect(cardAnchor(cloze())).toBe(PASSAGE)
  })

  /* A question was never in the lesson. Washing a sentence it was
     merely *about* would claim a correspondence the app does not have. */
  it('never falls back for a standard card', () => {
    expect(cardAnchor(standard())).toBeNull()
  })
})

describe('what can be wrong with a card', () => {
  it('passes each of the three shapes written properly', () => {
    expect(cardProblem(cloze())).toBeNull()
    expect(cardProblem(standard())).toBeNull()
    expect(
      cardProblem(
        standard({
          kind: 'truefalse',
          question: 'A CDN makes the response body smaller.',
          answer: FALSE_WORD,
          note: 'It shortens the distance, not the payload.',
        })
      )
    ).toBeNull()
  })

  it('refuses a question with no answer, and an answer with no question', () => {
    expect(cardProblem(standard({ answer: null }))).toBe('A card needs its answer.')
    expect(cardProblem(standard({ question: 'Eh?' }))).toBe('A card needs a question to ask.')
  })

  it('refuses a question that gives its own answer away', () => {
    expect(
      cardProblem(standard({ question: 'Is a CDN a network of edge servers?', answer: 'edge servers' }))
    ).toBe('The question gives the answer away.')
  })

  it('refuses a verdict that is neither word, and one with no reason', () => {
    const statement = { kind: 'truefalse' as const, question: 'A CDN shrinks the payload.' }
    expect(cardProblem(standard({ ...statement, answer: 'Sometimes', note: 'Why' }))).toBe(
      `A true-or-false card is answered ${TRUE_WORD} or ${FALSE_WORD}.`
    )
    expect(cardProblem(standard({ ...statement, answer: FALSE_WORD, note: null }))).toBe(
      'Say in one line why it is so.'
    )
  })

  /* The rule the whole overhaul turns on. A blank this wide is a
     sentence to write out from memory, which nobody can grade
     themselves on honestly -- and it is exactly what the verbatim cards
     produced by the thousand. */
  it('refuses a blank the length of a clause', () => {
    const wide = 'A request from Sydney pays for the physical length of that path every time.'
    const problem = clozeProblem(wide, 'the physical length of that path')
    expect(problem).toContain(`${BLANK_WORDS_MAX} words at most`)
  })

  it('passes the blank that clause should have been', () => {
    const wide = 'A request from Sydney pays for the physical length of that path every time.'
    expect(clozeProblem(wide, 'physical length')).toBeNull()
  })

  it('sends a cloze through the same judgement it always had', () => {
    expect(cardProblem(cloze({ blank: 'nowhere in it' }))).toBe(
      'Those words are not in the passage.'
    )
  })
})

describe('shuffling a sitting', () => {
  it('keeps every card, and only the cards it was given', () => {
    const deck = ['a', 'b', 'c', 'd', 'e']
    expect(shuffled(deck).sort()).toEqual([...deck].sort())
  })

  it('leaves the deck it was handed alone', () => {
    const deck = ['a', 'b', 'c']
    shuffled(deck, () => 0)
    expect(deck).toEqual(['a', 'b', 'c'])
  })

  /* Fisher–Yates, walked from the top with the source of randomness
     handed in, so the order is a fact rather than a belief. `() => 0`
     swaps each position with the first, which rotates the deck. */
  it('deals the order its randomness asked for', () => {
    // Walked from the end: each position in turn is swapped with the
    // first, which slides the deck up and drops the top card last.
    expect(shuffled(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('survives an empty deck and a deck of one', () => {
    expect(shuffled([])).toEqual([])
    expect(shuffled(['only'])).toEqual(['only'])
  })
})

describe('telling two questions apart', () => {
  it('reads one question asked twice as one question', () => {
    expect(cardKey('What is a CDN?')).toBe(cardKey('what is a cdn'))
    expect(cardKey('  Two   spaces. ')).toBe(cardKey('two spaces'))
  })

  it('keeps two genuinely different questions apart', () => {
    expect(cardKey('What is a CDN?')).not.toBe(cardKey('What is a cache?'))
  })
})

/* A row read in the minutes between the web deploying and the migration
   landing has no `kind` at all, and every card that exists then is a
   cloze. Read as a question it would draw blank; read as a cloze it
   draws plainly, which is the failure worth having. */
describe('a row whose kind has not arrived yet', () => {
  const nameless = { ...cloze(), kind: undefined as unknown as Cloze['kind'] }

  it('reads as a cloze, front and back', () => {
    expect(cardFront(nameless)).toContain(BLANK_MARK)
    expect(cardBack(nameless)).toBe('consuming')
  })

  it('still offers its passage to the prose', () => {
    expect(cardAnchor(nameless)).toBe(PASSAGE)
  })

  it('is judged as a cloze', () => {
    expect(cardProblem(nameless)).toBeNull()
  })
})
