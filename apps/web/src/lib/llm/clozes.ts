import Anthropic from '@anthropic-ai/sdk'

/**
 * Reading a worked lesson for what is worth keeping.
 *
 * Two to four concepts, and two or more clozes under each. The second
 * number is the one that matters: a concept asked one way is a
 * phrasing memorised, not a thing held, and the whole claim of this
 * feature is that it can tell those apart a month later.
 *
 * The hard constraint is that a cloze quotes the lesson **verbatim**.
 * Every passage that comes back is checked against the body before it
 * is written down, and one that is not in it is dropped rather than
 * repaired. That is not fussiness: the passage is what the reading
 * highlights and what the reader recognises, so a passage the model
 * tidied on its way past is a card that can never be drawn in its own
 * lesson and a sentence the reader never actually read.
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
export const CLOZES_PER_CONCEPT_MIN = 2
export const CLOZES_PER_CONCEPT_MAX = 3

export interface ProposedCloze {
  /** The passage, quoted from the lesson exactly as it is written. */
  text: string
  /** The words inside it to take out. A substring of `text`. */
  blank: string
  hint?: string
}

export interface ProposedConcept {
  name: string
  gist: string
  clozes: ProposedCloze[]
}

const TOOL = {
  name: 'record_clozes',
  description:
    'Record the concepts a lesson teaches and, under each, the passages worth asking back.',
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
                'The concept, as a short noun phrase. What the reader would have to still hold for the lesson to have counted.',
            },
            gist: {
              type: 'string',
              description:
                'One sentence saying what the lesson said about it. Shown above the card, so it must not give the blank away.',
            },
            clozes: {
              type: 'array',
              description: `${CLOZES_PER_CONCEPT_MIN} to ${CLOZES_PER_CONCEPT_MAX} different ways of asking whether the reader still holds this concept.`,
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description:
                      'One complete sentence COPIED CHARACTER FOR CHARACTER from the lesson. Do not tidy, shorten, re-punctuate or join sentences. Between 40 and 300 characters.',
                  },
                  blank: {
                    type: 'string',
                    description:
                      'The words to take out of that sentence, copied from it exactly. One to six words, carrying the meaning: a term, a figure, a condition, a consequence. Never a whole clause, never the subject of the sentence alone.',
                  },
                  hint: {
                    type: 'string',
                    description:
                      'Optional. A few words that would nudge without answering. Omit unless the blank is genuinely ambiguous.',
                  },
                },
                required: ['text', 'blank'],
              },
            },
          },
          required: ['name', 'gist', 'clozes'],
        },
      },
    },
    required: ['concepts'],
  },
}

const BRIEF = `You are preparing spaced-repetition cards from a lesson the reader has just finished.

Find the ${CONCEPTS_MIN} to ${CONCEPTS_MAX} concepts that the lesson exists to teach — the things whose loss would mean the lesson had not stuck. Ignore scaffolding, orientation, and anything the lesson only mentions in passing.

For each concept, choose ${CLOZES_PER_CONCEPT_MIN} to ${CLOZES_PER_CONCEPT_MAX} sentences from the lesson and say which words to blank out. The rules:

1. Quote the sentence EXACTLY as the lesson writes it, character for character. It is shown back to the reader inside the lesson itself, so a sentence you improved is a sentence they will not recognise.
2. Choose sentences that are load-bearing on their own. A sentence that only means something after the one before it makes an unanswerable card.
3. Blank the words that carry the concept — the term, the figure, the condition, the direction of an effect. Never blank a word that the rest of the sentence gives away, and never blank so much that the sentence stops being a sentence.
4. Ask the same concept different ways. Two cards over the same clause are one card.
5. Skip a concept rather than inventing a card for it. Fewer, answerable cards beat four and two that cannot be answered.

Do not use headings, code fences, list markers or markdown links as the sentence.`

/**
 * Read a lesson and propose what to tend.
 *
 * Answers only what it could verify against the body: a passage that is
 * not in the lesson, or a blank that is not in its passage, is dropped
 * here rather than written to the database and found to be undrawable
 * weeks later. A concept left with nothing answerable is dropped with
 * it — two good cards under three concepts is a better morning than
 * four concepts and a card that makes no sense.
 */
export async function proposeClozes(
  title: string,
  body: string
): Promise<ProposedConcept[]> {
  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_clozes' },
    messages: [
      {
        role: 'user',
        content: `${BRIEF}

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
  return verify(concepts ?? [], body)
}

/**
 * Drop everything that is not actually in the lesson.
 *
 * The check is done on whitespace-collapsed text on both sides, and
 * nothing else is forgiven. Collapsing is necessary because the body is
 * markdown and a sentence can be wrapped across two lines in the source
 * and read as one in the prose; anything beyond that -- a changed dash,
 * a tidied quote mark -- is the model rewriting, and a rewritten
 * passage is exactly what this exists to refuse.
 */
export function verify(concepts: ProposedConcept[], body: string): ProposedConcept[] {
  const flat = collapse(body)
  const seen = new Set<string>()
  const kept: ProposedConcept[] = []

  for (const concept of concepts.slice(0, CONCEPTS_MAX)) {
    if (!concept?.name?.trim()) continue

    const clozes: ProposedCloze[] = []
    for (const cloze of concept.clozes ?? []) {
      const text = (cloze?.text ?? '').trim()
      const blank = (cloze?.blank ?? '').trim()
      if (!text || !blank) continue

      // Quoted, not composed.
      if (!flat.includes(collapse(text))) continue
      // And the blank is genuinely inside the passage it came with.
      if (!text.includes(blank)) continue
      // Enough sentence left to answer from, and not so much that the
      // card is a paragraph.
      if (text.length < 24 || text.length > 400) continue
      if (blank.length > text.length / 2) continue

      // The same passage asked twice is one card, however it is blanked
      // -- the second is the first with the answer in a different
      // place, which the reader will simply read off the first.
      const key = collapse(text).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      clozes.push({
        text,
        blank,
        hint: cloze.hint?.trim() || undefined,
      })
      if (clozes.length >= CLOZES_PER_CONCEPT_MAX) break
    }

    // A concept with one card is a phrasing memorised. Either it can be
    // asked more than one way or it is not a concept this lesson taught
    // well enough to test.
    if (clozes.length < CLOZES_PER_CONCEPT_MIN) continue

    kept.push({
      name: concept.name.trim(),
      gist: (concept.gist ?? '').trim(),
      clozes,
    })
  }

  return kept
}

/** Whitespace as the prose renders it, not as the markdown stores it. */
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
