import Anthropic from '@anthropic-ai/sdk'
import { readTopics, saveProbes, heading, type MapTopic, type Probe } from './shared'

/**
 * Build the exam.
 *
 * `merge_topics` deletes the topic it merged away (`043`), so the map
 * keeps no record of the decisions anyone has already made about
 * sameness -- there is no history to replay and no labelled set lying
 * around. What the map does hold is its current state, and that is a
 * label if you read it the right way round: every topic standing on it
 * today is one the reader has, by leaving it there, called its own
 * thing.
 *
 * So each sampled topic yields two probes, and the pair is the point:
 *
 *  - an **alias** -- the same topic under a name it was not entered
 *    under. It must resolve back to that topic. This is the question
 *    the user actually asked about: does it already exist in the system
 *    even if its name differs.
 *  - a **neighbour** -- a genuinely different topic that sits right
 *    next to it. A prerequisite, a narrower case, a sibling. It must
 *    not resolve to anything. This is the hard negative, and it is the
 *    one that matters, because linking here is the irreversible error.
 *
 * Generated once and cached. Both arms sit the same exam or the
 * comparison is worth nothing.
 */

const SAMPLE = Number(process.argv[2] ?? 40)
const BATCH = 8

if (!process.env.ANTHROPIC_API_KEY) throw new Error('bakeoff: ANTHROPIC_API_KEY is not set')
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOL = {
  name: 'record_probes',
  description: 'Record, for each topic given, one alias of it and one topic adjacent to it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      probes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'The topic key exactly as given, e.g. "t1".' },
            alias_name: {
              type: 'string',
              description:
                'The same topic under a different name — what someone else writing about it might have called it. Must not reuse the given title.',
            },
            alias_description: {
              type: 'string',
              description: 'One sentence describing it, as a reading of an article would produce.',
            },
            neighbour_name: {
              type: 'string',
              description:
                'A genuinely DIFFERENT topic that sits right beside this one: a prerequisite, a narrower case, or a sibling under the same subject. Something a careful reader would keep as its own topic.',
            },
            neighbour_description: { type: 'string', description: 'One sentence describing it.' },
          },
          required: [
            'topic',
            'alias_name',
            'alias_description',
            'neighbour_name',
            'neighbour_description',
          ],
        },
      },
    },
    required: ['probes'],
  },
}

async function probesFor(batch: MapTopic[]): Promise<Probe[]> {
  const keyed = batch.map((topic, i) => ({ key: `t${i + 1}`, topic }))

  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_probes' },
    messages: [
      {
        role: 'user',
        content: `These topics sit on a personal learning map. For each one, write two things.

First, an ALIAS: the same topic, under a name someone else might have used for it. Not a broader or narrower version — the same scope, different words. "Content Delivery Network" for "CDN Distribution". This is a topic the map should recognise it already has.

Second, a NEIGHBOUR: a topic that is genuinely NOT the same thing, but sits as close to it as anything plausibly could — a prerequisite, a narrower special case, or a sibling under the same subject. Close enough that the wording overlaps heavily. This is a topic the map should keep separate, and it is deliberately the hardest possible case.

Write descriptions the way a reading of an article would: one plain sentence, no preamble.

TOPICS:
${keyed
  .map(({ key, topic }) => `${key}: ${topic.title}${topic.summary ? ` — ${topic.summary}` : ''}`)
  .join('\n')}`,
      },
    ],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') return []

  const rows = ((tool.input as { probes?: unknown[] }).probes ?? []) as Array<
    Record<string, string>
  >
  const byKey = new Map(keyed.map(k => [k.key, k.topic]))
  const out: Probe[] = []

  for (const row of rows) {
    const topic = byKey.get(row.topic)
    if (!topic) continue

    // An "alias" that is just the title back is not a test of anything:
    // the embedding would match it on characters and every arm would
    // score. Dropped rather than counted.
    const alias = (row.alias_name ?? '').trim()
    if (alias && alias.toLowerCase() !== topic.title.toLowerCase()) {
      out.push({
        kind: 'alias',
        name: alias,
        description: (row.alias_description ?? '').trim(),
        topicId: topic.id,
        topicTitle: topic.title,
        subjectIds: topic.subjectIds,
      })
    }

    const neighbour = (row.neighbour_name ?? '').trim()
    if (neighbour && neighbour.toLowerCase() !== topic.title.toLowerCase()) {
      out.push({
        kind: 'neighbour',
        name: neighbour,
        description: (row.neighbour_description ?? '').trim(),
        topicId: topic.id,
        topicTitle: topic.title,
        subjectIds: topic.subjectIds,
      })
    }
  }

  return out
}

const topics = await readTopics()
heading(`Building probes from ${topics.length} active topics`)

// Sampled evenly across the map rather than at random, so one crowded
// subject cannot supply most of the exam.
const step = Math.max(1, Math.floor(topics.length / SAMPLE))
const sampled = topics.filter((_, i) => i % step === 0).slice(0, SAMPLE)
console.log(`Sampling ${sampled.length} of them, every ${step}${step === 1 ? 'st' : 'th'}.`)

const probes: Probe[] = []
for (let i = 0; i < sampled.length; i += BATCH) {
  const batch = sampled.slice(i, i + BATCH)
  process.stdout.write(`  batch ${i / BATCH + 1}… `)
  const built = await probesFor(batch)
  probes.push(...built)
  console.log(`${built.length} probes`)
}

saveProbes(probes)

heading('Built')
console.log(`${probes.filter(p => p.kind === 'alias').length} aliases (must resolve to their topic)`)
console.log(`${probes.filter(p => p.kind === 'neighbour').length} neighbours (must resolve to nothing)`)
console.log('\nWritten to scripts/bakeoff/probes.json. Delete that file to build a new exam.')
console.log('\nSample:')
for (const probe of probes.slice(0, 6)) {
  console.log(`  ${probe.kind.padEnd(9)} ${probe.name}  ←  ${probe.topicTitle}`)
}
