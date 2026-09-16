/**
 * Cards: the smallest honest way of asking whether a lesson stuck.
 *
 * A lesson is read once. What it left behind is the thing worth
 * knowing, and the only way to find out whether it is still there is to
 * ask. This module is what asking looks like, in three shapes:
 *
 * - **cloze** — a sentence with one to three words taken out of it.
 *   The words taken out are the terminology; the rest of the sentence
 *   is the context that makes recalling it possible rather than a
 *   guess.
 * - **qa** — a question and its answer, a term and its definition, or
 *   the definition and the term. The flip is deliberate: knowing what
 *   a word means and producing the word for a meaning are two different
 *   things to hold, and a reader who has only ever been asked one way
 *   has only ever held it one way.
 * - **truefalse** — a statement, whether it holds, and one line saying
 *   why. The line is not decoration: a statement judged false with no
 *   reason given leaves the reader knowing they were wrong and not what
 *   is right.
 *
 * Until 046 there was only the first, and a card had to quote the
 * lesson **verbatim**. That rule was the whole of its honesty -- the
 * reading and the asking were the same words -- and it is also what
 * made the cards bad, because a lesson does not write in sentences
 * shaped like questions. What came back was whichever sentence happened
 * to be quotable with whichever clause happened to be removable taken
 * out of it, so blanks ran to eight and ten words and the answer was a
 * paraphrase nobody could have produced or checked.
 *
 * What survives of the rule is `anchor`: the lesson sentence a card
 * came out of, where there is one, checked against the body before it
 * is written down. It is what the plum wash in the reading is drawn on,
 * so the wash goes on meaning exactly what it always meant -- *the
 * garden is holding on to this sentence* -- while the card itself is
 * free to be written for the purpose. A card without one is perfectly
 * answerable and simply is not drawn on the prose, which is already
 * what happened to any cloze whose lesson had since been rewritten.
 *
 * Everything here is stored as words rather than as offsets into a
 * lesson body, for the reason a mark is (`020_highlights.sql`): a body
 * is written on demand and regenerable, so an offset into the prose
 * points at nothing the next time the lesson is asked for.
 *
 * This module is the shapes and the wording. The scheduling is
 * `./fsrs`; the two are kept apart because the scheduler is fitted
 * arithmetic that should be testable without a card anywhere near it.
 */

import type { CardState, Memory, Rating } from './fsrs'
import { AGAIN, EASY, GOOD, HARD } from './fsrs'

/**
 * A concept a lesson taught, and the tracker opened against it.
 *
 * Two to four per worked lesson. The concept is the unit the reader
 * thinks in -- "ability is separate from exposure" -- and the clozes
 * under it are two or more different ways of asking whether they still
 * hold it, so a concept is not passed on the strength of having
 * memorised one sentence's phrasing.
 */
export interface ClozeConcept {
  id: string
  lesson_id: string
  topic_id: string | null
  name: string
  /** What the lesson said about it, in a sentence. Shown on the card. */
  gist: string | null
  position: number
  created_at: string
}

/** How a card came to exist. The schema's own `created_by_kind`, less
 *  `skeleton`: nothing seeds a card, it is written from a lesson or
 *  made by the reader over a passage they chose. */
export type ClozeAuthor = 'ai' | 'user'

/**
 * Which of the three shapes a card is.
 *
 * The database's `card_kind` (046). A row's kind decides which of its
 * columns carry the question -- `clozes_shape` makes the database
 * refuse a row that is missing them -- and the single thing every
 * reader of a card must branch on.
 */
export type CardKind = 'cloze' | 'qa' | 'truefalse'

/** The three, in the order a lesson's deck is usually written. */
export const CARD_KINDS = ['cloze', 'qa', 'truefalse'] as const

/** What each is called where the reader is told which they are meeting. */
export const KIND_LABEL: Record<CardKind, string> = {
  cloze: 'Fill the blank',
  qa: 'Question',
  truefalse: 'True or false',
}

/** The two words a `truefalse` card's answer may be. Stored as text
 *  rather than a boolean so one column serves every kind and a back is
 *  always simply a thing to print. */
export const TRUE_WORD = 'True'
export const FALSE_WORD = 'False'

/** A card row, with its scheduling state on it. */
export interface Cloze {
  id: string
  concept_id: string | null
  lesson_id: string
  topic_id: string | null
  /** Which shape this is. Every row written before 046 is a `cloze`. */
  kind: CardKind
  /** The passage, blank included in full. Null on a standard card. */
  text: string | null
  /** Enough of what came before to tell two identical passages apart. */
  prefix: string | null
  /** The words taken out: `text.slice(blank_start, blank_end)`. */
  blank: string | null
  blank_start: number | null
  blank_end: number | null
  /** The front of a standard card: a question, a term, or a statement
   *  to judge. Null on a cloze, whose front is `text`. */
  question: string | null
  /** The back. On a `truefalse`, the literal word `True` or `False`. */
  answer: string | null
  /** One line saying *why*, shown with the back and never before it. */
  note: string | null
  /**
   * The lesson sentence this came out of, quoted exactly, or null.
   *
   * What the plum wash in the reading is drawn on. A card no longer has
   * to quote the lesson to exist -- only to be drawn in it. Read
   * through `cardAnchor`, which falls back to the passage itself for
   * every cloze written before 046, when the passage *was* the quote.
   */
  anchor: string | null
  /** A nudge shown on request, never by default. Usually null. */
  hint: string | null
  created_by: ClozeAuthor

  /* --- the scheduler's state, flattened onto the row --- */
  stability: number | null
  difficulty: number | null
  state: CardState
  reps: number
  lapses: number
  due: string
  last_reviewed_at: string | null

  created_at: string
  updated_at: string
}

/** A card with enough around it to be answered away from its lesson. */
export interface ClozeCard extends Cloze {
  concept: { id: string; name: string; gist: string | null } | null
  lesson: { id: string; title: string } | null
  topic: { id: string; title: string } | null
}

/** What is waiting, for a tally in a nav and a notice in a corner. */
export interface ClozeCount {
  /** Cards due now or overdue. The figure the Tend link prints. */
  due: number
  /** Every card the reader holds, due or not. */
  total: number
  /** The earliest due instant among those not yet due. Null if none. */
  next: string | null
}

/** Read the scheduler's state off a row. */
export function memoryOf(cloze: Cloze): Memory {
  return {
    stability: cloze.stability,
    difficulty: cloze.difficulty,
    state: cloze.state,
    reps: cloze.reps,
    lapses: cloze.lapses,
    due: cloze.due,
    lastReviewedAt: cloze.last_reviewed_at,
  }
}

/** Write it back, in the column names the table uses. */
export function memoryColumns(memory: Memory) {
  return {
    stability: memory.stability,
    difficulty: memory.difficulty,
    state: memory.state,
    reps: memory.reps,
    lapses: memory.lapses,
    due: memory.due,
    last_reviewed_at: memory.lastReviewedAt,
  }
}

/** Whether this one is wanted now. Overdue counts, which is the point. */
export const isDue = (cloze: Pick<Cloze, 'due'>, now: Date = new Date()) =>
  new Date(cloze.due).getTime() <= now.getTime()

/**
 * The four answers the Tend sheet offers.
 *
 * All four rungs, because the scheduler is fitted on all four: the
 * weights were measured against reviews graded this way, and offering
 * three of them would be answering on a ruler the arithmetic was not
 * fitted to. *Hard* is not a softer *again* -- it is a recall, and it
 * lengthens the interval like the other two -- but it lengthens it
 * least, which is the whole of what it is for. A card the reader
 * dragged back from somewhere should not be treated as one they simply
 * had.
 *
 * The labels say what happened rather than grading the reader, which
 * is what keeps the four distinguishable at the moment of answering:
 * it was gone, it only just came, it came with a little work, it was
 * already there.
 */
export const TENDING = [
  {
    rating: AGAIN,
    label: 'Gone',
    note: 'Could not bring it back.',
  },
  {
    rating: HARD,
    label: 'A struggle',
    note: 'Came back, but only just.',
  },
  {
    rating: GOOD,
    label: 'Got it',
    note: 'Came back with a little work.',
  },
  {
    rating: EASY,
    label: 'Easy',
    note: 'Came back at once.',
  },
] as const satisfies ReadonlyArray<{ rating: Rating; label: string; note: string }>

/** What a blank is drawn as when the card is face up. */
export const BLANK_MARK = '————'

/** The passage in three pieces, so a card can draw the blank itself. */
export interface ClozeFace {
  before: string
  blank: string
  after: string
}

/**
 * Split a cloze at its blank.
 *
 * Defensive about the offsets, because they are numbers in a database
 * and the passage beside them can be edited: an offset that no longer
 * lands inside the text falls back to looking the blank up by its
 * words, and a blank that is not in the text at all gives a face with
 * nothing hidden rather than a card that throws.
 */
export function clozeFace(cloze: Pick<Cloze, 'text' | 'blank' | 'blank_start' | 'blank_end'>): ClozeFace {
  const text = cloze.text ?? ''
  const blank = cloze.blank ?? ''
  const sound =
    cloze.blank_start !== null &&
    cloze.blank_end !== null &&
    cloze.blank_start >= 0 &&
    cloze.blank_end <= text.length &&
    cloze.blank_start < cloze.blank_end &&
    text.slice(cloze.blank_start, cloze.blank_end) === blank

  const start = sound ? (cloze.blank_start as number) : text.indexOf(blank)
  if (start === -1 || !blank) return { before: text, blank: '', after: '' }

  return {
    before: text.slice(0, start),
    blank: text.slice(start, start + blank.length),
    after: text.slice(start + blank.length),
  }
}

/** The card face as one string, for a title, a list row or a test. */
export function maskCloze(
  cloze: Pick<Cloze, 'text' | 'blank' | 'blank_start' | 'blank_end'>,
  mark: string = BLANK_MARK
): string {
  const { before, blank, after } = clozeFace(cloze)
  return blank ? `${before}${mark}${after}` : before
}

/**
 * Where the mathematics sits in a passage.
 *
 * Character ranges over the passage's own text, `$$…$$` before `$…$` so
 * a display formula is one span rather than two empty ones. The same
 * shape of rule the renderer uses, kept here because what it is needed
 * for is a judgement about a cloze -- and a cloze is judged on both
 * platforms, by the same rule, before anything is written down.
 */
export function mathSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  const taken = (at: number) => spans.some(s => at >= s.start && at < s.end)

  for (const pattern of [
    /\$\$[^$]+?\$\$/g,
    /\$(?![\s$])(?:\\.|[^$\\\n])*?(?<![\s\\])\$(?!\d)/g,
  ]) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined || taken(match.index)) continue
      spans.push({ start: match.index, end: match.index + match[0].length })
    }
  }

  return spans.sort((a, b) => a.start - b.start)
}

/**
 * How many words a blank may be.
 *
 * Three is the shape that works: a blank is a piece of terminology, and
 * terminology is one word, or two, or occasionally three. The refusal
 * sits at five rather than three because the rule is lived with by hand
 * as well as by the model -- a reader who wants four words for a named
 * quantity is making a slightly worse card, not a broken one, and does
 * not need to be argued with. What is refused is the shape the verbatim
 * cards kept producing: "the physical length of that path", where the
 * answer is a clause nobody can recall word for word and nobody can
 * honestly grade themselves on having recalled.
 *
 * The model is held tighter still where it is generating, because that
 * is where the standard is actually set and a four-word blank written
 * by the thousand is how the old cards got to eight.
 */
export const BLANK_WORDS_WANTED = 3
export const BLANK_WORDS_MAX = 5

/** The words in a run of text, for counting rather than for cutting. */
const wordsIn = (s: string) => s.trim().split(/\s+/).filter(Boolean)

/** What can be wrong with a cloze, said as a sentence or null. */
export function clozeProblem(text: string, blank: string, at?: number): string | null {
  const passage = text.trim()
  if (passage.length < 12) return 'A cloze needs a whole sentence to stand in.'
  if (passage.length > 400) return 'That passage is too long to answer in one go.'
  if (!blank.trim()) return 'Choose the words to take out.'
  if (blank.trim().length > passage.length / 2) {
    return 'That leaves too little of the sentence to go on.'
  }
  // A blank is a term, not a clause. A hole this wide is a sentence to
  // write out from memory, which is a thing nobody can grade themselves
  // on honestly -- and it is exactly what the old verbatim cards did.
  if (wordsIn(blank).length > BLANK_WORDS_MAX) {
    return `A blank is a term, not a clause — take out ${BLANK_WORDS_MAX} words at most, and ${BLANK_WORDS_WANTED} is usually plenty.`
  }
  const start = at !== undefined && text.slice(at, at + blank.length) === blank
    ? at
    : text.indexOf(blank)
  if (start === -1) return 'Those words are not in the passage.'

  // A blank may take a whole equation or leave it alone, and nothing in
  // between. The card draws the passage in three pieces -- what comes
  // before the blank, the blank, what comes after -- and each piece is
  // typeset in its own right, so a blank cutting through `$2^x = 100$`
  // leaves two halves of a formula that can only be printed as the raw
  // TeX they now are.
  const end = start + blank.length
  for (const span of mathSpans(text)) {
    const clear = end <= span.start || start >= span.end
    const whole = start <= span.start && end >= span.end
    if (!clear && !whole) return 'A blank has to take a whole formula, or none of one.'
  }

  return null
}

/**
 * Where a blank sits in a passage.
 *
 * Used when the reader makes one by hand: they select a sentence and
 * then some words inside it, and this turns the second into offsets
 * into the first. `from` is a hint -- the offset the selection itself
 * reported -- which settles the case of a word that appears twice in
 * the same sentence.
 */
export function locateBlank(text: string, blank: string, from?: number): { start: number; end: number } | null {
  if (!blank) return null
  if (from !== undefined && text.slice(from, from + blank.length) === blank) {
    return { start: from, end: from + blank.length }
  }
  const start = text.indexOf(blank)
  return start === -1 ? null : { start, end: start + blank.length }
}

/**
 * What is waiting, in a sentence.
 *
 * One wording, read by the nav tally's title, the notice in the corner
 * and the head of the Tend sheet, so the three cannot come to disagree
 * about what the same number means.
 */
export function tendPhrase(due: number): string {
  if (due === 0) return 'Nothing is due'
  return `${due} ${due === 1 ? 'card is' : 'cards are'} due`
}

/** The same count said as a bare noun, for a heading or a button. */
export const cardsPhrase = (n: number) => `${n} ${n === 1 ? 'card' : 'cards'}`

/** How a concept's cards are holding up, for the head of the sheet. */
export function conceptStanding(clozes: Cloze[], now: Date = new Date()): {
  due: number
  held: number
  fresh: number
} {
  let due = 0
  let held = 0
  let fresh = 0
  for (const cloze of clozes) {
    if (cloze.state === 'new') fresh++
    else if ((cloze.stability ?? 0) >= 21) held++
    if (isDue(cloze, now)) due++
  }
  return { due, held, fresh }
}

/* ------------------------------------------------------------------ *
 *  The three shapes, read the same way
 * ------------------------------------------------------------------ */

/** Enough of a card to say what shape it is and read its two faces. */
export type CardShape = Pick<
  Cloze,
  'kind' | 'text' | 'blank' | 'blank_start' | 'blank_end' | 'question' | 'answer' | 'note' | 'anchor'
>

/**
 * Whether a card carries a front and a back rather than a passage.
 *
 * Asked this way round -- *is it one of the two standard shapes* --
 * rather than *is it a cloze*, so that a row whose kind is missing
 * reads as a cloze. Two ways that happens and both are real: a row
 * written before 046, and a row read in the minutes between the web
 * deploying and the migration landing, since the two go up on the same
 * push but are not a transaction. Every card that exists in either case
 * is a cloze, and a card drawn as a cloze is at worst drawn plainly
 * where a card drawn as a question with no question is drawn blank.
 */
const isStandard = (kind: CardKind | undefined | null) =>
  kind === 'qa' || kind === 'truefalse'

/**
 * The sentence in the lesson this card is drawn on, or null.
 *
 * The fallback is the whole of the backwards compatibility: every card
 * written before 046 quoted its lesson verbatim, so its passage *is*
 * its anchor and nothing has to be backfilled for the wash to keep
 * appearing exactly where it did. A card written since carries the
 * anchor explicitly, or carries none and is simply not drawn.
 *
 * A standard card never falls back — a question was never in the
 * lesson, and washing a sentence a question was merely *about* would
 * be the app claiming a correspondence it does not have.
 */
export function cardAnchor(card: Pick<CardShape, 'kind' | 'text' | 'anchor'>): string | null {
  if (card.anchor?.trim()) return card.anchor
  return isStandard(card.kind) ? null : (card.text?.trim() || null)
}

/**
 * The front of a card as one plain string.
 *
 * For a list row, a title, a duplicate check or a test — anywhere the
 * question has to be one value rather than three pieces to typeset. The
 * rendered card does not go through here: a cloze is drawn in three
 * pieces so the blank can be a rule rather than a run of dashes in the
 * prose, and the mathematics either side of it can be typeset.
 */
export function cardFront(card: CardShape, mark: string = BLANK_MARK): string {
  if (!isStandard(card.kind)) return maskCloze(card, mark)
  return card.question?.trim() ?? ''
}

/** The back, as one plain string. The `note` is not part of it: it is
 *  shown beside the answer, not as the answer. */
export function cardBack(card: CardShape): string {
  if (!isStandard(card.kind)) return card.blank?.trim() ?? ''
  return card.answer?.trim() ?? ''
}

/** Whether a `truefalse` card's statement holds. Null for the other two
 *  kinds, and for an answer that is neither word — a card the database
 *  would refuse, read defensively because this runs on rows. */
export function cardTruth(card: Pick<CardShape, 'kind' | 'answer'>): boolean | null {
  if (card.kind !== 'truefalse') return null
  const said = card.answer?.trim().toLowerCase()
  if (said === TRUE_WORD.toLowerCase()) return true
  if (said === FALSE_WORD.toLowerCase()) return false
  return null
}

/**
 * What can be wrong with a card of any shape, said as a sentence.
 *
 * `clozeProblem` still holds the whole of the cloze judgement and is
 * still called directly by everything that only ever deals in clozes
 * (the maker, the passage editor). This is the front door for the two
 * new shapes and for anything handed a row whose kind it does not know
 * in advance — the API routes, chiefly, which must not take a client's
 * word for what shape it sent.
 *
 * The same rule both platforms hold a card to, in one place, so a card
 * the web refuses cannot be the card the phone writes.
 */
export function cardProblem(card: CardShape, at?: number): string | null {
  if (!isStandard(card.kind)) {
    return clozeProblem(card.text ?? '', card.blank ?? '', at)
  }

  const front = (card.question ?? '').trim()
  const back = (card.answer ?? '').trim()

  if (front.length < 8) return 'A card needs a question to ask.'
  if (front.length > 400) return 'That is too long to take in on one card.'
  if (!back) return 'A card needs its answer.'

  if (card.kind === 'truefalse') {
    // Exactly the two words, because the card draws them as a verdict
    // rather than as prose: anything else would be printed under a
    // heading that says it is one or the other.
    const truth = cardTruth(card)
    if (truth === null) return `A true-or-false card is answered ${TRUE_WORD} or ${FALSE_WORD}.`
    // Not decoration. A statement judged false with no reason given
    // leaves the reader knowing they were wrong and not what is right.
    if (!(card.note ?? '').trim()) return 'Say in one line why it is so.'
    return null
  }

  if (back.length > 400) return 'That answer is too long to check yourself against.'
  // A question whose answer is sitting inside it is a card that can be
  // read off rather than recalled — the standard-card version of a
  // blank the rest of the sentence gives away.
  if (back.length > 3 && front.toLowerCase().includes(back.toLowerCase())) {
    return 'The question gives the answer away.'
  }

  return null
}

/**
 * The same cards, in an order nobody can learn.
 *
 * A due queue read oldest-first is answered in the order it was
 * planted, which means a lesson's cards arrive in a block and each one
 * is answered with the last one still in mind. That is not recall, it
 * is a run-on, and it tells the scheduler the reader holds things they
 * only just read. Shuffling is what makes each card meet the reader
 * cold, which is the only state an answer is worth grading in.
 *
 * Fisher–Yates over a copy, with the source of randomness passed in so
 * the shuffle is a testable thing rather than a thing that is merely
 * believed.
 */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const deck = [...items]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/**
 * Is this the same question as one already asked?
 *
 * Fronts compared with their punctuation, case and spacing taken off,
 * because "What is a CDN?" and "What is a CDN" are one card and the
 * reader who meets both will answer the second from the first. Used
 * when more cards are generated against a lesson that already has
 * some: the model is told what is standing, and this is what is done
 * about the ones it writes anyway.
 */
export const cardKey = (front: string) =>
  front
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
