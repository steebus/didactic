import Anthropic from '@anthropic-ai/sdk'
import type { ExposureDepth } from '@didactic/core/types'

/**
 * Reading a diary entry back for what it says about the topics it
 * names.
 *
 * This is the softest evidence in the app and the strongest write path
 * in it, which is an uncomfortable combination and the reason for most
 * of the rules below. An entry is prose about a week; what comes out of
 * it moves figures the reader cannot edit by hand.
 *
 * So the model is asked to do one narrow thing: for each topic the
 * entry *already names*, say what the entry shows about it, and quote
 * the words that show it. It does not choose the topics -- those come
 * from the tags the reader themselves wrote with `@`. It cannot reach a
 * topic that is not in front of it, and it cannot invent one.
 *
 * Four verdicts, mapped onto depths the scorer already knows:
 *
 *  - `applied`  -- they did the thing. Built it, shipped it, used it at
 *                  work. This is the only verdict that passes the 3.5
 *                  consumption ceiling, and it is the one the ceiling
 *                  was always waiting for.
 *  - `read`     -- they read or studied it closely.
 *  - `skim`     -- they touched it: a passing mention, an article
 *                  glanced at, a talk half-watched.
 *  - `struggled`-- they said it is not landing. Adds no ability and
 *                  holds the topic's figure open until something
 *                  answers it.
 *
 * And a fifth answer that writes nothing: `mentioned`, for a topic the
 * entry names without making any claim about. "I read about caching,
 * which reminded me of Postgres" says nothing about Postgres. A model
 * with only four options would have had to pick one of them, and the
 * cheapest way to get a bad `read` is to leave no way to say "nothing".
 */

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('diary: ANTHROPIC_API_KEY is not set')
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** Well past the length of anything anyone types in one sitting. */
const MAX_CHARS = 20_000

/** What a verdict may be. `mentioned` writes nothing. */
export const VERDICTS = ['applied', 'read', 'skim', 'struggled', 'mentioned'] as const
export type Verdict = (typeof VERDICTS)[number]

export interface Reading {
  topicId: string
  verdict: Verdict
  /** The entry's own words that led to the verdict. Becomes the
   *  exposure's reason, so the topic sheet explains itself. */
  because: string
}

const TOOL = {
  name: 'record_reading',
  description: 'Record what a learning diary entry shows about each topic it names.',
  input_schema: {
    type: 'object' as const,
    properties: {
      readings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topicId: {
              type: 'string',
              description: 'The id of one of the topics listed. Never anything else.',
            },
            verdict: {
              type: 'string',
              enum: [...VERDICTS],
              description:
                'applied: they built, shipped or used it. read: they read or studied it closely. skim: they touched it in passing. struggled: they say it is not landing or they do not understand it. mentioned: the entry names it but claims nothing about it.',
            },
            because: {
              type: 'string',
              description:
                "A short quote from the entry, in the writer's own words, that shows this. Not a paraphrase.",
            },
          },
          required: ['topicId', 'verdict', 'because'],
        },
      },
    },
    required: ['readings'],
  },
}

/**
 * Read one entry against the topics it names.
 *
 * `topics` is what the reader tagged. Anything the model answers about
 * that is not in this list is dropped on the way back -- the tags are
 * the reader's, and a model that invented a topic would be writing
 * against something nobody pointed at.
 */
export async function readEntry(
  entry: string,
  topics: Array<{ id: string; title: string }>
): Promise<Reading[]> {
  if (topics.length === 0) return []

  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_reading' },
    messages: [
      {
        role: 'user',
        content: `Below is a learning diary entry, and the topics it names. For each topic, say what the entry shows about the writer's relationship to it.

Be conservative. This decides figures the writer cannot edit by hand, so:

- Only say "applied" if they describe actually doing the thing — building it, shipping it, using it in real work. Reading about how to do something is not applying it.
- Only say "struggled" if they say plainly that it is not landing, that they are confused, or that they cannot get it to work. Finding something hard but getting there is not struggling.
- Use "mentioned" freely. A topic named in passing, or named only as context for something else, gets "mentioned" and nothing is recorded against it. This is the right answer more often than not.
- Quote the writer's own words in "because". Do not paraphrase, and do not write a sentence they did not write.

Topics named in this entry:
${topics.map(t => `- ${t.title} (id: ${t.id})`).join('\n')}

The entry:

${entry.slice(0, MAX_CHARS)}`,
      },
    ],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') throw new Error('readEntry: no structured output')

  const input = tool.input as { readings: Reading[] }
  const known = new Set(topics.map(t => t.id))

  // Only topics the reader actually named, only verdicts that exist,
  // and one reading per topic -- the last wins, which is no worse than
  // any other rule and stops a duplicate becoming two exposures.
  const byTopic = new Map<string, Reading>()
  for (const r of input.readings ?? []) {
    if (!known.has(r.topicId)) continue
    if (!VERDICTS.includes(r.verdict)) continue
    byTopic.set(r.topicId, { ...r, because: (r.because ?? '').trim() })
  }

  return [...byTopic.values()]
}

/**
 * The depth a verdict is recorded at, or null for one that writes
 * nothing.
 *
 * `mentioned` is deliberately not a depth: there is no weight that
 * means "the reader typed this word", and inventing one would put a row
 * in the log that says nothing and still counts toward confidence.
 */
export function depthOf(verdict: Verdict): ExposureDepth | null {
  return verdict === 'mentioned' ? null : verdict
}
