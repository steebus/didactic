import Anthropic from '@anthropic-ai/sdk'
import { NO_THINKING } from './thinking'
import { asArray } from './concepts'

/**
 * Whether what a resource was about is already on the map, and where
 * the rest of it belongs.
 *
 * The resolver answers the first question from names alone: an
 * embedding of a concept's name against the embeddings of topic names,
 * and a threshold. That is the right first pass and it stays the first
 * pass -- it is cheap, it is tuned against real rows, and it is what
 * finds the candidates at all. What it cannot do is read: gte-small
 * reads shared vocabulary as similarity and two wordings of one idea as
 * difference, and a name is all it is given.
 *
 * And subjects were decided without reading anything. `039` files new
 * topics into whatever subjects the resource's matches already sit in,
 * which is right when something matched and files nothing when nothing
 * did -- so a book whose concepts' names were not close enough to any
 * topic already on the map left every one of them loose, whatever
 * subject they plainly belonged to.
 *
 * This is the reading. One call, shown each new concept with its
 * description, its nearest topics on the map with theirs and the
 * subjects they sit in, and every subject with a sample of what it
 * holds. It answers two questions per concept: is this one of those
 * topics already, and which subjects does it belong under, if any. It
 * writes nothing; `settleResolution` decides what a verdict is worth
 * against the embedding's own.
 */

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** The bar an answer about sameness has to clear, either way. The same
 *  bar the bed sort uses for the same question. */
export const SURE_ENOUGH = 0.7

/** How many of a concept's nearest topics it is judged against. The
 *  far end of the candidate list is noise the call pays for. */
export const NEAREST_SHOWN = 5

/** How much of each subject is printed to say what it covers. Subjects
 *  carry no description of their own; what they hold is the nearest
 *  thing to one. */
export const SUBJECT_SAMPLE = 12

export interface ConceptToJudge {
  /** A short handle for the prompt, e.g. `c3`. Never a topic id: these
   *  are not on the map yet. */
  key: string
  name: string
  description: string | null
  nearest: Array<{
    id: string
    title: string
    summary: string | null
    similarity: number
    /** Titles of the subjects it is filed under. */
    subjects: string[]
  }>
}

export interface SubjectToJudge {
  id: string
  title: string
  /** A sample of the topic titles filed under it. */
  topics: string[]
}

export interface Verdict {
  /** The nearest topic this concept is, where the reading is sure. */
  sameAs: string | null
  /** Sure it is none of the topics it was shown. */
  distinct: boolean
  /** The subjects it belongs under. Empty means it stands alone. */
  subjects: string[]
}

const TOOL = {
  name: 'record_judgements',
  description:
    'Record, for each new concept, whether it is an existing topic and which subjects it belongs under.',
  input_schema: {
    type: 'object' as const,
    properties: {
      judgements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            concept: { type: 'string', description: 'The concept key exactly as given, e.g. "c1".' },
            same_as: {
              type: ['string', 'null'] as unknown as string,
              description:
                "The id of one of this concept's nearest topics that it genuinely is, under another name. Null when it is its own topic.",
            },
            confidence: {
              type: 'number',
              description:
                '0-1: how sure you are of same_as, whichever way it went -- 0.9 with null means sure it is none of them.',
            },
            subjects: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Ids of the subjects this concept belongs under. Empty when none of them is a natural home for it.',
            },
          },
          required: ['concept', 'same_as', 'confidence', 'subjects'],
        },
      },
    },
    required: ['judgements'],
  },
}

/**
 * Judge a resource's concepts against the map.
 *
 * Returns null rather than throwing when there is nothing to judge
 * against, when the answer came back truncated, or when it came back in
 * no usable shape: the caller falls back to judging by names, which is
 * what ingestion did before any of this, and a resource filed that way
 * is still a resource filed.
 */
export async function judgeConcepts(input: {
  resourceTitle: string
  concepts: ConceptToJudge[]
  subjects: SubjectToJudge[]
}): Promise<Map<string, Verdict> | null> {
  const concepts = input.concepts
  if (concepts.length === 0) return null
  if (input.subjects.length === 0 && concepts.every(c => c.nearest.length === 0)) return null

  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    // A line or two of JSON per concept; a book's reading is twenty-odd
    // of them. Headroom for the answer that arrives serialised as a
    // string, which spends several times the tokens.
    max_tokens: 6000,
    thinking: NO_THINKING,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_judgements' },
    messages: [{ role: 'user', content: prompt(input.resourceTitle, concepts, input.subjects) }],
  })

  // Half an answer is worse than none: the concepts it did not reach
  // would be judged by names while the rest were read, and nothing would
  // say which were which.
  if (res.stop_reason === 'max_tokens') return null

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') return null

  return readJudgements(tool.input, concepts, input.subjects)
}

function prompt(resourceTitle: string, concepts: ConceptToJudge[], subjects: SubjectToJudge[]) {
  const described = (summary: string | null) => (summary ? ` — ${summary}` : ' — (no description)')

  return `A resource, "${resourceTitle}", has just been read, and these concepts were found in it. For each one, answer two questions.

First: is it one of the existing topics listed under it, written under another name? Two names for one idea -- things that would be taught as one thing -- is a yes. A narrower case, a broader one, a prerequisite, or a close neighbour is a no. Read the descriptions, not just the names: similar names with different scopes are different topics, and different names with one scope are the same topic.

Second, whatever the first answer: which of the subjects below does it belong under? A subject is a field someone is learning; a topic belongs under it when someone studying that field would expect to meet it there. It can belong under more than one. Where none is a natural home -- only loosely adjacent, or sharing a word -- give none: a topic that stands on its own is left for the reader to decide about, and that is better than filing it somewhere it does not belong.

Use the ids exactly as given.

CONCEPTS:
${concepts.map(c => `${c.key}: ${c.name}${described(c.description)}
${c.nearest.length === 0
    ? '  nearest existing topics: none'
    : `  nearest existing topics:\n${c.nearest.map(n =>
        `    ${n.id}: ${n.title}${described(n.summary)}${n.subjects.length ? ` [in ${n.subjects.join(', ')}]` : ' [in no subject]'}`
      ).join('\n')}`}`).join('\n\n')}

SUBJECTS:
${subjects.length === 0
    ? 'none yet'
    : subjects.map(s => `${s.id}: ${s.title}${s.topics.length ? ` — holds ${s.topics.join('; ')}` : ''}`).join('\n')}`
}

/**
 * What came back, made safe to use.
 *
 * Every id is checked against what was shown: a same_as that is not one
 * of that concept's own nearest topics, or a subject that is not on the
 * list, is dropped rather than trusted. A concept the answer skipped has
 * no verdict and is judged by name.
 */
export function readJudgements(
  input: unknown,
  concepts: ConceptToJudge[],
  subjects: SubjectToJudge[]
): Map<string, Verdict> | null {
  const held = (input ?? {}) as Record<string, unknown>
  const rows = asArray(held.judgements)
  if (rows.length === 0) return null

  const byKey = new Map(concepts.map(c => [c.key, c]))
  const subjectIds = new Set(subjects.map(s => s.id))
  const verdicts = new Map<string, Verdict>()

  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>
    const concept = typeof row.concept === 'string' ? byKey.get(row.concept.trim()) : undefined
    if (!concept || verdicts.has(concept.key)) continue

    const confidence = typeof row.confidence === 'number' ? row.confidence : 0
    const sure = confidence >= SURE_ENOUGH
    const claimed = typeof row.same_as === 'string' ? row.same_as.trim() : ''
    const isNearest = concept.nearest.some(n => n.id === claimed)

    verdicts.set(concept.key, {
      sameAs: sure && isNearest ? claimed : null,
      // Sure of "none of them" only counts as distinct when nothing was
      // named. A same_as that named something unknown is a confused
      // answer, not a confident no.
      distinct: sure && !claimed,
      subjects: [...new Set(asArray(row.subjects)
        .filter((s): s is string => typeof s === 'string')
        .map(s => s.trim())
        .filter(s => subjectIds.has(s)))],
    })
  }

  return verdicts.size > 0 ? verdicts : null
}
