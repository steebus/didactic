import Anthropic from '@anthropic-ai/sdk'
import type { EdgeKind } from '../types'

/**
 * Where a topic added by hand belongs in the bed it was added to.
 *
 * The resolver reads a title against the map through an embedding and
 * a threshold, and that is the right first pass -- it is cheap, it
 * runs on every write path, and it catches "Postgres" against
 * "PostgreSQL". What it cannot do is read a bed. It compares one title
 * against the nearest titles anywhere on the map, one pair at a time,
 * and gte-small scores "HTTP methods" and "REST verbs" as two
 * different things while scoring every sibling in a tightly worded
 * subject as nearly the same one.
 *
 * So a topic typed into a subject landed filed but unplaced: a node
 * with no edges, which the outline prints as another root at the
 * bottom of the bed and the graph draws floating beside it. The bed
 * around it was never consulted, and the bed is the thing that says
 * where the topic goes.
 *
 * This is that reading. One call, shown the subject, the bed and the
 * new topic, answering two questions: is this one of these already,
 * and what does it sit under or before. It does not write anything --
 * the caller decides what a claim of sameness is worth, which is the
 * point: a model saying "same" where the embedding said "different"
 * is a question for the user, never a merge.
 */

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

const VALID_KINDS: EdgeKind[] = ['prereq', 'related', 'specialises', 'alternative']

/** A topic already in the bed, as the sort is shown it. */
export interface BedTopic {
  id: string
  title: string
  summary?: string | null
  /** The topic it sits under in the outline now, where it sits under
   *  one. The shape of the bed is half of what places a new topic. */
  under?: string | null
}

export interface Sorted {
  /**
   * An existing topic this is a restatement of, where the sort is sure
   * enough to say so. Never acted on as a merge on its own: it is the
   * second opinion the adjudication queue exists for.
   */
  sameAs: string | null
  /** How sure, 0-1. Below `SURE_ENOUGH` the claim is dropped. */
  confidence: number
  /** Where the topic sits: edges between it and the bed. */
  edges: Array<{ from: string; to: string; kind: EdgeKind; weight: number }>
  /** One line the sheet can print about what it did. */
  note: string | null
}

/** The bar a claim of sameness has to clear to be worth raising. */
export const SURE_ENOUGH = 0.7

/** How much of a bed the sort is shown. A wide subject runs to
 *  hundreds and the far end of it says nothing about where one topic
 *  goes; these are handed over nearest-first by the caller. */
export const BED_CEILING = 120

const TOOL = {
  name: 'record_filing',
  description:
    'Record where a newly added topic belongs among the topics already in a subject.',
  input_schema: {
    type: 'object' as const,
    properties: {
      same_as: {
        type: ['string', 'null'] as unknown as string,
        description:
          'The id of an existing topic this is genuinely the same topic as, under a different name. Null when it is its own topic. Only when they would be taught as one thing -- two names for one idea -- not merely when they are closely related.',
      },
      confidence: {
        type: 'number',
        description: '0-1: how sure you are of same_as. 0 when same_as is null.',
      },
      edges: {
        type: 'array',
        description:
          'How the new topic relates to the topics already here. Every edge must have the new topic at one end.',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source topic id.' },
            to: { type: 'string', description: 'Target topic id.' },
            kind: { type: 'string', enum: VALID_KINDS },
            weight: { type: 'number', description: '0-1 strength of the relationship.' },
          },
          required: ['from', 'to', 'kind', 'weight'],
        },
      },
      note: {
        type: 'string',
        description:
          'One short sentence, addressed to the reader, saying where you put it and why. No preamble.',
      },
    },
    required: ['same_as', 'confidence', 'edges', 'note'],
  },
}

/**
 * Read a new topic against the bed it was added to.
 *
 * Returns nothing rather than throwing when there is no bed to read
 * against or no key to read with: a topic that could not be sorted is
 * still a topic that was filed, and failing the add for want of a
 * placement would be the tail wagging the dog.
 */
export async function sortIntoBed(input: {
  subjectTitle: string
  topic: { id: string; title: string }
  bed: BedTopic[]
}): Promise<Sorted | null> {
  const bed = input.bed.filter(t => t.id !== input.topic.id).slice(0, BED_CEILING)
  if (bed.length === 0) return null

  const titleOf = new Map(bed.map(t => [t.id, t.title]))
  const ends = new Set([input.topic.id, ...bed.map(t => t.id)])

  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_filing' },
    messages: [{
      role: 'user',
      content: `A topic has just been added by hand to the subject "${input.subjectTitle}". Say where it belongs among the topics already there.

Two questions, and they are different. First: is this the same topic as one already here, written under another name? Two names for one thing is a yes; a narrower case, a prerequisite, or a near neighbour is a no -- those are edges, not sameness. Second, regardless of the first: how does it relate to what is here?

Kinds: prereq (A must be learned before B), related (adjacent), specialises (B is a narrower case of A), alternative (competing choice for the same job).

Every edge must have the new topic at one end, and the direction matters: "specialises" runs from the general topic to the narrower one, "prereq" from the earlier to the later. Those two are what put the topic under another in the outline, so reach for them where they are true and leave a topic at the top of the bed where nothing here contains or precedes it. Two or three edges is usually right. Use the ids exactly as given.

THE NEW TOPIC:
${input.topic.id}: ${input.topic.title}

ALREADY HERE:
${bed.map(t => `${t.id}: ${t.title}${
  t.under ? ` (under ${titleOf.get(t.under) ?? 'another topic'})` : ''
}${t.summary ? ` — ${t.summary}` : ''}`).join('\n')}`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') return null
  // A truncated answer is a half-read bed, and half a placement is
  // worse than none: it files the topic under the first thing the
  // model happened to reach before it ran out.
  if (res.stop_reason === 'max_tokens') return null

  const raw = tool.input as {
    same_as?: string | null
    confidence?: number
    edges?: Array<{ from: string; to: string; kind: string; weight: number }>
    note?: string
  }

  const confidence = Number.isFinite(raw.confidence) ? Number(raw.confidence) : 0
  const claimed = typeof raw.same_as === 'string' ? raw.same_as : null

  return {
    sameAs: claimed && titleOf.has(claimed) && confidence >= SURE_ENOUGH ? claimed : null,
    confidence,
    // Every edge has to touch the new topic and both ends have to be
    // real. A model relating two existing topics to each other is
    // answering a question nobody asked, and drawing it here would let
    // one hand-added topic quietly reshape the rest of the bed.
    edges: (Array.isArray(raw.edges) ? raw.edges : []).filter(
      e =>
        ends.has(e.from) &&
        ends.has(e.to) &&
        e.from !== e.to &&
        (e.from === input.topic.id || e.to === input.topic.id) &&
        VALID_KINDS.includes(e.kind as EdgeKind)
    ) as Array<{ from: string; to: string; kind: EdgeKind; weight: number }>,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
  }
}
