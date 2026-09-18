import Anthropic from '@anthropic-ai/sdk'
import { NO_THINKING } from './thinking'

/**
 * The bed gathered into named groups by subject matter.
 *
 * The order the bed already carries is one axis: simplest first, which
 * is what `033` kept and what the outline prints. It says nothing about
 * which topics are *about the same thing*, and in a subject of any size
 * that is the question the reader is actually asking -- thirty topics
 * on one ramp is a list to be read rather than scanned.
 *
 * So this reads the whole bed at once and proposes the other axis. It
 * is one call and it writes nothing by itself: the caller applies the
 * proposal, and the reader is free to rename, reorder, move and delete
 * afterwards. A proposal is a starting point, never a verdict -- which
 * is why the model is told to leave a topic ungrouped rather than reach
 * for a group that does not fit.
 */

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** Past this the prompt is long enough to be worth the cost of reading
 *  twice, and a bed this size is not one anybody is scanning anyway. */
const BED_CEILING = 120

/** A group as the model proposes it: a name and the topics in it. */
export interface ProposedGroup {
  title: string
  topicIds: string[]
}

const TOOL: Anthropic.Tool = {
  name: 'record_groups',
  description: 'Record how the bed divides into groups by subject matter.',
  input_schema: {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        description:
          'The groups, simplest first: a group of introductory material before one of advanced.',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description:
                'Two to four words naming what the group is about. No numbering, no "Part 1", no "Miscellaneous".',
            },
            topic_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Ids of the topics in this group, simplest first.',
            },
          },
          required: ['title', 'topic_ids'],
        },
      },
    },
    required: ['groups'],
  },
}

/**
 * Propose groups for a bed.
 *
 * Answers an empty list rather than throwing where there is nothing to
 * group: a bed of two topics has no shape to find, and a group holding
 * everything says exactly as much as no groups at all.
 */
export async function groupTheBed(input: {
  subjectTitle: string
  topics: Array<{ id: string; title: string; summary: string | null }>
}): Promise<ProposedGroup[]> {
  const bed = input.topics.slice(0, BED_CEILING)
  if (bed.length < 3) return []

  const ids = new Set(bed.map(t => t.id))

  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    thinking: NO_THINKING,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_groups' },
    messages: [{
      role: 'user',
      content: `Divide the subject "${input.subjectTitle}" into groups by subject matter, so a reader can scan it instead of reading it top to bottom.

A group gathers topics that are ABOUT THE SAME THING. That is the axis here. Complexity is the other one and it is already handled: order the groups simplest first, and the topics inside each group simplest first, but never make a group whose only claim is difficulty — "Basics" and "Advanced topics" are not subject matter and are exactly what this is replacing.

Aim for three to seven groups. Two topics is enough to make a group where they genuinely belong together.

**Leaving a topic out is a real answer and often the right one.** A topic that belongs with nothing else here stays ungrouped and prints on its own — that is an ordinary state of a bed, not a failure. Never invent a catch-all: no "Miscellaneous", no "Other", no "General". If a topic does not fit a group that means something, leave its id out entirely.

Use the ids exactly as given. Do not put an id in two groups, and do not invent one.

THE BED:
${bed.map(t => `${t.id}: ${t.title}${t.summary ? ` — ${t.summary}` : ''}`).join('\n')}`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') return []
  // A truncated answer is half a bed grouped, and the half left out
  // reads as "these belong nowhere" rather than "the model stopped".
  if (res.stop_reason === 'max_tokens') return []

  const raw = tool.input as {
    groups?: Array<{ title?: string; topic_ids?: string[] }>
  }

  const taken = new Set<string>()

  return (Array.isArray(raw.groups) ? raw.groups : [])
    .map(g => ({
      title: typeof g.title === 'string' ? g.title.trim() : '',
      // Every id has to be real, and a topic belongs to one group: the
      // first that claims it keeps it, so a model listing one topic
      // twice cannot make it appear twice in the bed.
      topicIds: (Array.isArray(g.topic_ids) ? g.topic_ids : []).filter(id => {
        if (typeof id !== 'string' || !ids.has(id) || taken.has(id)) return false
        taken.add(id)
        return true
      }),
    }))
    // A group with no title is unusable, and one holding nothing is a
    // box the reader would have to clear up after the model.
    .filter(g => g.title !== '' && g.topicIds.length > 0)
}
