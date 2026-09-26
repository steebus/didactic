import Anthropic from '@anthropic-ai/sdk'
import { NO_THINKING } from './thinking'
import { toolList } from './toolInput'

/**
 * Naming the subjects nobody sowed.
 *
 * The kinship reading (`core/sprouting`) finds a handful of topics the
 * reader's material keeps putting together and no subject accounts for.
 * It can count what holds them together; it cannot say what they are.
 * This is the one call that does: shown each set of topics with its
 * descriptions and the material that binds it, and every subject already
 * on the map, it names each one and says why.
 *
 * It writes nothing. And it may decline: "not a subject" is an answer
 * the tool offers outright, the way the grouping call may leave a topic
 * ungrouped, because a clump of unrelated topics that happen to share a
 * reading list should be passed over rather than dressed up with a name.
 */

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** Sprouts named per call. The rest wait for the next visit. */
export const NAMED_PER_CALL = 6

/** One set of topics to be named. */
export interface SproutToName {
  /** The kept row's id, which the answer is keyed by. */
  id: string
  topics: Array<{ id: string; title: string; summary: string | null; filedUnder: string[] }>
  /** Titles of the resources carrying at least two of its topics. */
  material: string[]
}

/** What the model said about one of them. */
export interface SproutNaming {
  id: string
  verdict: 'subject' | 'not_a_subject'
  title: string
  why: string
  coreTopicIds: string[]
}

const TOOL: Anthropic.Tool = {
  name: 'record_sprouts',
  description: 'Record a name and a reason for each set of topics, or pass on it.',
  input_schema: {
    type: 'object',
    properties: {
      sprouts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The id of the set, exactly as given.' },
            verdict: {
              type: 'string',
              enum: ['subject', 'not_a_subject'],
              description:
                'subject: these belong together as something a person could set out to learn. not_a_subject: they only share a reading list.',
            },
            title: {
              type: 'string',
              description:
                'Two to four words naming the subject, as it would head a shelf. Not any existing subject. Empty when passing.',
            },
            why: {
              type: 'string',
              description:
                'Two or three plain sentences on what joins these topics, naming the material that joins them. When passing, one sentence on why not.',
            },
            core_topic_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'The two to four topic ids at its heart, most central first.',
            },
          },
          required: ['id', 'verdict', 'title', 'why', 'core_topic_ids'],
        },
      },
    },
    required: ['sprouts'],
  },
}

/**
 * Name up to `NAMED_PER_CALL` sprouts in one call.
 *
 * Answers only for the sets it was given and only with ids it was given;
 * anything else in the reply is dropped rather than trusted.
 */
export async function nameTheSprouts(input: {
  sprouts: SproutToName[]
  subjects: string[]
}): Promise<SproutNaming[]> {
  const batch = input.sprouts.slice(0, NAMED_PER_CALL)
  if (batch.length === 0) return []

  const topicIds = new Map(batch.map(s => [s.id, new Set(s.topics.map(t => t.id))]))

  const describe = (s: SproutToName) =>
    `SET ${s.id}
Topics:
${s.topics
  .map(t => `- ${t.id}: ${t.title}${t.summary ? ` — ${t.summary}` : ''} [${t.filedUnder.length ? `filed under ${t.filedUnder.join(', ')}` : 'filed under nothing'}]`)
  .join('\n')}
Held together by:
${s.material.map(m => `- ${m}`).join('\n')}`

  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 3000,
    thinking: NO_THINKING,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_sprouts' },
    messages: [{
      role: 'user',
      content: `A reader keeps a map of what they are learning, divided into subjects they named themselves. Reading the map with the subjects taken out, some topics keep turning up together in what the reader saves. Each set below is one of those. Your job is to say, for each, whether it is a subject the reader could name and set out to learn, and if so what to call it.

Name the subject the topics are ABOUT, in the words a person would use for a shelf: "Film Photography", "Data Visualisation", "Monetary History". Two to four words. It must not be one of the reader's existing subjects, and it should not be so broad that it swallows one ("Technology", "Science").

Say why in two or three plain sentences, naming the material that joins them — that is the evidence, and the reader will check it.

**Passing is a real answer.** Topics can share a reading list and still have nothing to do with each other: an article that touched on three unrelated things, or a course that covered a spread. Where the only thing joining a set is that it was read together, answer not_a_subject. Do not invent a name to cover a grab-bag.

Use the ids exactly as given.

THE READER'S SUBJECTS: ${input.subjects.length ? input.subjects.join('; ') : '(none yet)'}

${batch.map(describe).join('\n\n')}`,
    }],
  })

  // A truncated answer is some sets named and some silently not: better
  // none, and ask again on the next visit.
  if (res.stop_reason === 'max_tokens') return []
  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') return []

  const out: SproutNaming[] = []
  const seen = new Set<string>()
  for (const raw of toolList(tool.input, 'sprouts') as Array<Record<string, unknown>>) {
    const id = typeof raw?.id === 'string' ? raw.id : ''
    const members = topicIds.get(id)
    if (!members || seen.has(id)) continue
    seen.add(id)

    const verdict = raw.verdict === 'not_a_subject' ? 'not_a_subject' : 'subject'
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const why = typeof raw.why === 'string' ? raw.why.trim() : ''
    // A subject with no name is not an answer; leave it for next time.
    if (verdict === 'subject' && !title) continue

    out.push({
      id,
      verdict,
      title,
      why,
      coreTopicIds: (toolList(raw, 'core_topic_ids') as unknown[])
        .filter((t): t is string => typeof t === 'string' && members.has(t)),
    })
  }
  return out
}
