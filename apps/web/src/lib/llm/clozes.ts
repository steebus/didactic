import Anthropic from '@anthropic-ai/sdk'
import { NO_THINKING } from './thinking'
import {
  BLANK_WORDS_WANTED,
  FALSE_WORD,
  TRUE_WORD,
  cardBack,
  cardFront,
  cardKey,
  cardProblem,
  givesAway,
  type CardKind,
} from '@didactic/core/clozes'

/**
 * Reading a worked lesson for what is worth keeping.
 *
 * Two to four concepts, and two or more cards under each. The second
 * number is the one that matters: a concept asked one way is a phrasing
 * memorised, not a thing held, and the whole claim of this feature is
 * that it can tell those apart a month later.
 *
 * Until 046 the hard constraint was that a card quoted the lesson
 * **verbatim** — every passage was checked against the body and one
 * that had been tidied on the way past was dropped rather than
 * repaired. The reasoning was sound and the cards were bad, for a
 * reason the rule made unavoidable: a lesson does not write in
 * sentences shaped like questions. What came back was whichever
 * sentence happened to be quotable with whichever clause happened to be
 * removable taken out of it, so blanks ran to eight and ten words and
 * the answer was a paraphrase the reader could neither have produced
 * nor checked.
 *
 * A card is now written **from** the lesson rather than cut out of it,
 * and it may be a question and an answer rather than only a passage and
 * a blank. What survives of the old rule is `anchor`: the sentence the
 * card came out of, quoted exactly, still checked against the body
 * character for character and dropped to null when it is not found.
 * That is what the plum wash in the reading is drawn on, so the one
 * thing the verbatim rule actually bought — the reader recognising, in
 * the lesson, which sentences the garden is holding — is bought without
 * making it the constraint every card has to be written under.
 *
 * Nothing a card shows before it is answered may contain its answer,
 * and `verify` enforces that rather than trusting the brief: the front,
 * the nudge, and the concept's name, which is printed above every card
 * under it. The concept's `gist` is the one thing exempt, because 047
 * moved it to the back of the card -- it belongs to a concept carrying
 * two to four cards, and no one sentence can be written to avoid all of
 * their answers.
 *
 * Generation is **additive**. A lesson that already has cards is read
 * again with those cards in hand, and what comes back is the cards it
 * does not have; nothing standing is deleted, because a card the reader
 * has been answering for three months is the last thing to throw away
 * in the name of a better prompt.
 */

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('clozes: ANTHROPIC_API_KEY is not set')
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** How much of a lesson is read. Well past the length of one. */
const MAX_CHARS = 60_000

/** What the reader is asked to keep, per lesson. PRODUCT.md's bargain:
 *  enough to be worth the two minutes, little enough to be done. */
export const CONCEPTS_MIN = 2
export const CONCEPTS_MAX = 4
export const CARDS_PER_CONCEPT_MIN = 2
export const CARDS_PER_CONCEPT_MAX = 4

/** How many fronts already standing are shown to the model. Enough to
 *  cover a lesson tended three or four times over; past that the list
 *  costs more than the duplicates it prevents. */
const SEEN_SHOWN = 60

/** The most a blank may be when the model is the one choosing it.
 *  Tighter than what a reader is refused for by hand
 *  (`BLANK_WORDS_MAX`), because this is where the standard is set. */
const BLANK_WORDS_GENERATED = 4

export interface ProposedCard {
  kind: CardKind
  /** cloze: the sentence, blank included in full. */
  text?: string
  /** cloze: the words inside it to take out. A substring of `text`. */
  blank?: string
  /** qa / truefalse: the question, term, or statement. */
  question?: string
  /** qa: the answer or definition. truefalse: `True` or `False`. */
  answer?: string
  /** truefalse: one line saying why. */
  note?: string
  hint?: string
  /** The lesson sentence this came out of, quoted exactly. Optional,
   *  and dropped where it turns out not to be in the lesson. */
  anchor?: string
}

export interface ProposedConcept {
  name: string
  gist: string
  cards: ProposedCard[]
}

const TOOL = {
  name: 'record_cards',
  description:
    'Record the concepts a lesson teaches and, under each, the cards that ask whether the reader still holds them.',
  input_schema: {
    type: 'object' as const,
    properties: {
      concepts: {
        type: 'array',
        description: `${CONCEPTS_MIN} to ${CONCEPTS_MAX} concepts, in the order the lesson teaches them.`,
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'The concept, as a short noun phrase — a heading, not a claim. It is printed on every card under it BEFORE the reader answers, so it must name the area without stating any answer: "Jank and the frame budget", never "The 16.7ms frame budget". Reuse the exact name of a concept already standing when a card belongs under it.',
            },
            gist: {
              type: 'string',
              description:
                'One sentence saying what the lesson said about this concept. Shown on the BACK of every card under it, once the reader has answered, as reinforcement — so it may state the substance plainly and should.',
            },
            cards: {
              type: 'array',
              description: `${CARDS_PER_CONCEPT_MIN} to ${CARDS_PER_CONCEPT_MAX} different ways of asking whether the reader still holds this concept. Pick whichever shape suits the material.`,
              items: {
                type: 'object',
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['cloze', 'qa', 'truefalse'],
                    description:
                      'cloze: a sentence with one to three words taken out. qa: a question and its answer, or a term and its definition, or the definition and the term. truefalse: a statement, whether it holds, and why.',
                  },
                  text: {
                    type: 'string',
                    description:
                      'cloze only. One complete sentence, 40 to 300 characters, whose blank is the thing worth holding. Write it for the card — it does not have to be a sentence the lesson contains.',
                  },
                  blank: {
                    type: 'string',
                    description: `cloze only. The words to take out of that sentence, copied from it exactly. One to ${BLANK_WORDS_WANTED} words — a term, a figure, a named quantity. Never a clause.`,
                  },
                  question: {
                    type: 'string',
                    description:
                      'qa and truefalse only. For qa, the question, or the term whose definition is wanted, or the definition whose term is wanted. For truefalse, the statement to judge.',
                  },
                  answer: {
                    type: 'string',
                    description: `qa and truefalse only. For qa, the answer — a phrase or one short sentence, never a paragraph. For truefalse, exactly "${TRUE_WORD}" or "${FALSE_WORD}".`,
                  },
                  note: {
                    type: 'string',
                    description:
                      'truefalse only, and required there. One line saying why it is so. A false statement with no correction leaves the reader knowing they were wrong and not what is right.',
                  },
                  hint: {
                    type: 'string',
                    description:
                      'Optional. A few words that would nudge without answering. Omit unless the card is genuinely ambiguous.',
                  },
                  anchor: {
                    type: 'string',
                    description:
                      'Optional, and worth giving wherever it is honest. One sentence COPIED CHARACTER FOR CHARACTER from the lesson that this card came out of — it is highlighted in the reading so the reader can see which sentences are being held. Omit it rather than paraphrase: a sentence that is not in the lesson word for word is discarded.',
                  },
                },
                required: ['kind'],
              },
            },
          },
          required: ['name', 'gist', 'cards'],
        },
      },
    },
    required: ['concepts'],
  },
}

const BRIEF = `You are preparing spaced-repetition cards from a lesson the reader has just finished.

Find the ${CONCEPTS_MIN} to ${CONCEPTS_MAX} concepts that the lesson exists to teach — the things whose loss would mean the lesson had not stuck. Ignore scaffolding, orientation, and anything the lesson only mentions in passing.

For each concept, write ${CARDS_PER_CONCEPT_MIN} to ${CARDS_PER_CONCEPT_MAX} cards. Choose the shape that fits the material rather than filling a quota of each: a definition wants a term-and-definition card, a named quantity or a direction of effect wants a cloze, a claim the reader is likely to have half-absorbed wants a true-or-false.

**What a card is about.** Almost always a piece of key terminology and what it means — the term for the meaning, or the meaning for the term. The reader should finish the card able to use the word, not able to recognise a sentence.

**Cards do not have to quote the lesson.** Write the sentence, question or statement the concept deserves, in plain language, even where the lesson said it at greater length or across two paragraphs. What you must not do is teach something the lesson does not say.

**Cloze cards.** One complete sentence that stands on its own, with ONE to ${BLANK_WORDS_WANTED} words taken out. The blank is the term, the figure, the named condition — never a clause, never a whole predicate. These are the shape:
  - Many people have a [pet] at home, like a dog or a cat.
  - A bird flaps its [wings] to fly.
  - A request from Sydney to a server in Virginia pays for the [physical length] of that path every time, no matter how small the reply.
The rest of the sentence must give the reader something to recall from and must not give the answer away.

**Question-and-answer cards.** Either direction, and use both across a lesson: "What is a CDN?" → "A network of edge servers that serve content from near the visitor", and "A network of edge servers that serve content from near the visitor" → "A CDN". The answer is a phrase or one short sentence. Never write a question whose answer is sitting inside it.

**True-or-false cards.** A statement worth being wrong about — a plausible confusion the lesson corrects, not a triviality. Answer exactly "${TRUE_WORD}" or "${FALSE_WORD}", and always give the one-line reason.

**Nothing may hand over its own answer.** The concept's name is printed on every card under it before the reader answers, so it is a heading — the area, never a figure or a term some card asks for. The sentence of a cloze must not contain its own blanked words somewhere else in it, and a question must not contain its answer. A nudge nudges; it never answers. A card that can be read off is worse than no card at all: it is graded *Easy*, honestly, and the scheduler then files it away for four months on the strength of a reading.

The concept's \`gist\` is the exception and is shown on the back, after the answer, so write it plainly and let it say what the lesson actually said.

**Anchors.** Where the card came out of one particular sentence of the lesson, give that sentence in \`anchor\`, copied character for character. It is washed in the reading so the reader can see which sentences the garden holds. A sentence you have improved on its way past is not the sentence they read, so omit the anchor rather than paraphrase one.

**Mathematics** between $ or $$ is typeset when the card is shown. A cloze blank may take a whole formula, delimiters included, or stay clear of one — never part of one. "The equation $2^x = 100$ has no ordinary answer" may blank "$2^x = 100$" or "ordinary", never "100".

Skip a concept rather than inventing cards for it. Fewer, answerable cards beat four concepts and two cards that cannot be answered.`

/**
 * Read a lesson and propose what to tend.
 *
 * `standing` is what the lesson already carries, as fronts: the model
 * is shown them and told to write what is missing, and anything it
 * writes anyway that matches one is dropped in `verify`. Both, because
 * telling it is what produces genuinely different cards and dropping is
 * what guarantees no duplicates — a prompt is an instruction and a
 * filter is a promise.
 */
export async function proposeClozes(
  title: string,
  body: string,
  standing: string[] = []
): Promise<ProposedConcept[]> {
  const already = standing.slice(0, SEEN_SHOWN)
  const avoid = already.length
    ? `\n\nThis lesson already has these cards. Write cards that ask about something they do not, or ask the same thing from a genuinely different direction. Do not restate any of them:\n${already
        .map(front => `- ${front}`)
        .join('\n')}`
    : ''

  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 6000,
    thinking: NO_THINKING,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_cards' },
    messages: [
      {
        role: 'user',
        content: `${BRIEF}${avoid}

Lesson: ${title}

${body.slice(0, MAX_CHARS)}`,
      },
    ],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    throw new Error('proposeClozes: no structured output')
  }

  const { concepts } = tool.input as { concepts: ProposedConcept[] }
  return verify(concepts ?? [], body, standing)
}

/**
 * Drop everything that cannot be answered, and everything already asked.
 *
 * What is checked here is no longer whether the card is *in* the lesson
 * — that rule is gone, and it is why the cards are better — but whether
 * it holds together as a card: the shape its kind requires, a blank
 * that is genuinely inside its own sentence and short enough to be a
 * term, and a front nobody has been asked before.
 *
 * The anchor is the one thing still held to the old standard. It is
 * checked against whitespace-collapsed text on both sides, because the
 * body is markdown and a sentence can be wrapped across two lines in
 * the source and read as one in the prose; anything beyond that is the
 * model rewriting, and an anchor that has been rewritten is a wash that
 * lands on the wrong words or on nothing. An anchor that fails is
 * dropped — the card is kept, and simply is not drawn on the prose.
 */
export function verify(
  concepts: ProposedConcept[],
  body: string,
  standing: string[] = []
): ProposedConcept[] {
  const flat = collapse(body)
  const seen = new Set(standing.map(front => cardKey(front)).filter(Boolean))
  const kept: ProposedConcept[] = []

  for (const concept of concepts.slice(0, CONCEPTS_MAX)) {
    if (!concept?.name?.trim()) continue

    const cards: ProposedCard[] = []
    for (const proposed of concept.cards ?? []) {
      const card = tidy(proposed)
      if (!card) continue

      // The same judgement a card made by hand is held to, from the
      // same function in the shared package, rather than a second
      // opinion written here that could come to disagree with it.
      if (cardProblem(asShape(card))) continue

      // Nothing on the face of this card may hand over its back. The
      // brief says so and this is what makes it true: a crib is graded
      // *Easy*, honestly, and the scheduler files the card away for
      // four months on the strength of a reading. The concept's name
      // counts, because it is printed above every card under it -- and
      // the model chose that name once for two to four different
      // answers, which is exactly the shape of mistake it cannot see.
      // A `truefalse` is exempt: its back is one of two words and a
      // statement containing *true* has revealed nothing.
      if (card.kind !== 'truefalse') {
        const front = cardFront(asShape(card))
        const back = cardBack(asShape(card))
        if (givesAway(front, back)) continue
        if (givesAway(concept.name ?? '', back)) continue
        if (card.hint && givesAway(card.hint, back)) delete card.hint
      }

      // A blank the model chose is held to the tighter number: this is
      // where the standard is set, and a four-word blank generated by
      // the thousand is how the old cards got to eight.
      if (card.kind === 'cloze' && words(card.blank ?? '') > BLANK_WORDS_GENERATED) continue

      // The same question asked twice is one card — across the whole
      // lesson, not merely within one concept, and counting what was
      // already standing before this call.
      const key = cardKey(cardFront(asShape(card)))
      if (!key || seen.has(key)) continue
      seen.add(key)

      // Quoted, not composed. The card survives a failed anchor; only
      // the wash in the reading is lost, which is what already happened
      // to any card whose lesson had been rewritten under it.
      if (card.anchor && !flat.includes(collapse(card.anchor))) delete card.anchor

      cards.push(card)
      if (cards.length >= CARDS_PER_CONCEPT_MAX) break
    }

    // A concept with one card is a phrasing memorised. Either it can be
    // asked more than one way or it is not a concept this lesson taught
    // well enough to test.
    if (cards.length < CARDS_PER_CONCEPT_MIN) continue

    kept.push({
      name: concept.name.trim(),
      gist: (concept.gist ?? '').trim(),
      cards,
    })
  }

  return kept
}

/**
 * A proposed card with its strings trimmed and its kind settled, or
 * null where there was never a card there.
 *
 * `kind` is taken on trust only as far as being one of the three; a
 * model that omits it, or answers with a fourth, is read by what it
 * actually filled in — a row with a blank in a sentence is a cloze
 * whatever it was labelled. Cheaper than losing the card.
 */
function tidy(raw: ProposedCard | undefined): ProposedCard | null {
  if (!raw) return null

  const said = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const text = said(raw.text)
  const blank = said(raw.blank)
  const question = said(raw.question)
  const answer = said(raw.answer)
  const note = said(raw.note)
  const hint = said(raw.hint)
  const anchor = said(raw.anchor)

  const kind: CardKind =
    raw.kind === 'cloze' || raw.kind === 'qa' || raw.kind === 'truefalse'
      ? raw.kind
      : text && blank
        ? 'cloze'
        : note || isVerdict(answer)
          ? 'truefalse'
          : 'qa'

  const card: ProposedCard = { kind }
  if (kind === 'cloze') {
    if (!text || !blank) return null
    card.text = text
    card.blank = blank
  } else {
    if (!question || !answer) return null
    card.question = question
    // A model that answers "true" or "TRUE." has said the right thing
    // in the wrong case, and the card is drawn from this word.
    card.answer = kind === 'truefalse' ? verdict(answer) : answer
    if (note) card.note = note
  }
  if (hint) card.hint = hint
  if (anchor) card.anchor = anchor
  return card
}

/** Whether a word is one of the two verdicts, however it was cased. */
const isVerdict = (s: string) =>
  [TRUE_WORD, FALSE_WORD].includes(verdict(s))

/** The verdict word as the card prints it, or the answer untouched. */
function verdict(s: string) {
  const bare = s.trim().replace(/[.!]$/, '').toLowerCase()
  if (bare === 'true' || bare === 'yes') return TRUE_WORD
  if (bare === 'false' || bare === 'no') return FALSE_WORD
  return s.trim()
}

/** A proposal read as the shape the shared judgement takes. */
const asShape = (card: ProposedCard) => ({
  kind: card.kind,
  text: card.text ?? null,
  blank: card.blank ?? null,
  blank_start: null,
  blank_end: null,
  question: card.question ?? null,
  answer: card.answer ?? null,
  note: card.note ?? null,
  anchor: card.anchor ?? null,
})

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** Whitespace as the prose renders it, not as the markdown stores it. */
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
