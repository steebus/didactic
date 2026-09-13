import Anthropic from '@anthropic-ai/sdk'
import type { CurriculumShape, LessonStage } from '@didactic/core/types'
import { blockPromptSection } from '@didactic/core/blocks'
import { lessonSlug, type LessonLink } from '@didactic/core/lessonLinks'
import { passagePromptSection, type CitedPassage } from '../citations'

/** A lesson as the model proposes it, before it has an id. Branching is
 *  expressed with the model's own keys so it never has to invent uuids. */
export interface ProposedLesson {
  key: string
  title: string
  summary: string
  stage: LessonStage
  estimated_minutes: number
  requires: string[]
}

export interface ProposedCurriculum {
  title: string
  shape: CurriculumShape
  lessons: ProposedLesson[]
}

export interface CurriculumBrief {
  subjectTitles: string[]
  topicTitle: string
  topicSummary: string | null
  /** 1–5, and the reason the curriculum starts where it starts. */
  ability: number
  abilityConfidence: number
  /** What the user asked for, in their words. */
  goal: string | null
  /** Reference material the user handed over to steer the shape. */
  sources: Array<{ title: string; note: string | null; summary: string | null }>
  /** Topics the graph says come first, so the route does not re-teach
   *  ground the user already holds or skip ground they do not. */
  prerequisiteTopics: Array<{ title: string; ability: number }>
}

const STAGES: LessonStage[] = ['introductory', 'core', 'advanced']

/**
 * How many neighbouring lessons a body is written against.
 *
 * The list is read to the model in full, so it is a real cost in the
 * prompt and a real one in attention: past a point the model is being
 * shown a catalogue rather than a neighbourhood, and links it might
 * have made well it makes at random. Near before far, and a ceiling
 * on each so a wide subject cannot crowd out the reader's own topic.
 */
const LINKS_HERE = 40
const LINKS_OVER = 25

const TOOL = {
  name: 'record_curriculum',
  description:
    'Record a curriculum: an ordered or branching set of lessons taking one topic from introductory to advanced.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string' },
      shape: {
        type: 'string',
        enum: ['linear', 'branching'],
        description:
          'linear when the material has one sensible order; branching when it genuinely forks.',
      },
      lessons: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'A short slug, unique within this curriculum.' },
            title: { type: 'string' },
            summary: { type: 'string', description: 'One sentence on what the lesson covers.' },
            stage: { type: 'string', enum: STAGES },
            estimated_minutes: { type: 'number' },
            requires: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keys of lessons that must come first. Empty for a starting point.',
            },
          },
          required: ['key', 'title', 'summary', 'stage', 'estimated_minutes', 'requires'],
        },
      },
    },
    required: ['title', 'shape', 'lessons'],
  },
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('curriculum: ANTHROPIC_API_KEY is not set')
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

/**
 * Draft a curriculum for one topic. The result is a proposal: nothing is
 * a plan until the user approves it, so this deliberately does no
 * writing of its own.
 */
export async function proposeCurriculum(brief: CurriculumBrief): Promise<ProposedCurriculum> {
  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_curriculum' },
    messages: [{
      role: 'user',
      content: `Draft a curriculum for the topic "${brief.topicTitle}"${
        brief.subjectTitles.length ? `, which sits under ${brief.subjectTitles.join(' and ')}` : ''
      }.
${brief.topicSummary ? `\nThe topic, in short: ${brief.topicSummary}` : ''}

Their current level is roughly ${brief.ability} out of 5${
        brief.abilityConfidence < 0.4 ? ', though the app has little evidence for that yet' : ''
      }. Start where that leaves off rather than from nothing, and run through to advanced.

${brief.goal ? `What they asked for: ${brief.goal}` : 'They gave no particular goal, so cover the topic properly.'}

${brief.prerequisiteTopics.length
  ? `The graph says these come first, with their current levels:\n${
      brief.prerequisiteTopics.map(t => `- ${t.title} (${t.ability}/5)`).join('\n')
    }\nDo not re-teach what they already hold; do cover what they do not.`
  : ''}

${brief.sources.length
  ? `They handed over this material to steer it. Follow it where it is specific:\n${
      brief.sources.map(s =>
        `- ${s.title}${s.note ? ` — ${s.note}` : ''}${s.summary ? `\n  ${s.summary}` : ''}`
      ).join('\n')
    }`
  : ''}

8 to 16 lessons. Use "requires" to say what must come first: a linear curriculum chains each lesson to the one before, a branching one has several starting points and forks where the material genuinely diverges. Never make a lesson require itself or form a loop.`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    throw new Error('curriculum: no structured output')
  }

  const raw = tool.input as {
    title?: string
    shape?: string
    lessons?: Array<Partial<ProposedLesson>>
  }

  // The model's shape is a promise, not a guarantee. Drop anything
  // without a key and a title, then drop prereqs pointing at lessons
  // that did not survive.
  const lessons = (raw.lessons ?? [])
    .filter(l => typeof l?.key === 'string' && typeof l?.title === 'string')
    .map(l => ({
      key: l.key!.trim(),
      title: l.title!.trim(),
      summary: typeof l.summary === 'string' ? l.summary : '',
      stage: STAGES.includes(l.stage as LessonStage) ? (l.stage as LessonStage) : 'core',
      estimated_minutes: Number.isFinite(l.estimated_minutes) ? Math.round(l.estimated_minutes!) : 20,
      requires: Array.isArray(l.requires) ? l.requires.filter(r => typeof r === 'string') : [],
    }))
    .filter(l => l.key.length > 0 && l.title.length > 0)

  const keys = new Set(lessons.map(l => l.key))

  return {
    title: typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : `${brief.topicTitle}, end to end`,
    shape: raw.shape === 'branching' ? 'branching' : 'linear',
    lessons: lessons.map(l => ({
      ...l,
      requires: [...new Set(l.requires.filter(r => r !== l.key && keys.has(r)))],
    })),
  }
}

/**
 * How much of a lesson is written in one request.
 *
 * Not how long a lesson may be -- that is ROUNDS x this -- but how much
 * work one HTTP request is allowed to do. The function that calls this
 * is cut off at sixty seconds by the platform, and eight thousand
 * tokens of prose takes rather longer than that to generate, so a
 * full-length lesson could not be written inside one request at all: it
 * was killed part way, the reader was told it had failed, and nothing
 * was saved.
 *
 * So a lesson is written in rounds, each one its own request, each one
 * saved. Two and a half thousand tokens is comfortably inside the
 * minute with the database round trips either side of it, and is most
 * of a lesson on its own -- most finish in one round and never know the
 * difference.
 */
const ROUND_TOKENS = 2500

/**
 * How many rounds a lesson may take before it is called finished
 * whatever state it is in.
 *
 * Six is far more than any honest lesson needs -- fifteen thousand
 * tokens, several times the longest thing this app has written. It is
 * here so that a model which will not stop cannot bill indefinitely,
 * not as a length anyone should reach.
 */
export const ROUNDS_MAX = 6

/**
 * What the model is told when it is handed its own half-written lesson.
 *
 * It is a user turn rather than a continued assistant one. Handing the
 * model the start of its own answer -- an assistant prefill -- is how
 * this used to be done, and it is refused outright by every current
 * model: `claude-sonnet-5` answers a last-turn assistant prefill with a
 * 400. So every lesson long enough to reach the ceiling failed on the
 * request that was meant to finish it, which is the other half of why
 * a long lesson never appeared.
 */
const CARRY_ON =
  'Carry straight on from exactly where that stops, mid-sentence if that is where it stops. ' +
  'Do not repeat a word of it, do not summarise it, do not start again, and do not say you are continuing. ' +
  'Write only the rest of the lesson.'

/**
 * Write one round of a lesson.
 *
 * Called when the lesson is first opened rather than at generation
 * time: most drafted lessons are never reached, and a curriculum the
 * user reshapes would waste every word written early.
 *
 * One model call, and it answers with everything written so far and
 * whether that is the whole lesson. The caller saves what it gets
 * either way and comes back for the rest, so no single request has to
 * fit a whole lesson inside the platform's minute.
 */
export async function generateLessonBody(
  input: {
    topicTitle: string
    curriculumTitle: string
    goal: string | null
    lesson: { title: string; summary: string | null; stage: LessonStage; estimatedMinutes: number | null }
    /** Titles of the lessons already completed, so it can build on them. */
    covered: string[]
    /** Material the reader chose to steer the curriculum. */
    sources: Array<{ title: string; summary: string | null; url?: string | null }>
    /** Everything else already filed against this topic, read or not. The
     *  lesson can point at it rather than sending the reader looking for
     *  material they already have. */
    library: Array<{ title: string; summary: string | null; url: string | null; status: string }>
    /** Filed against neighbouring topics in the same subjects. A reader's
     *  library is not sorted the way the map is, so the piece that
     *  explains what this lesson leans on often sits one topic over. */
    nearby?: Array<{ title: string; summary: string | null; url: string | null; status: string }>
    /** The other lessons on the reader's map that this one may point at:
     *  its own topic first, then the topics its subjects hold. Named in
     *  the prose rather than addressed, so the link is resolved when the
     *  lesson is read. See `lessonLinks.ts`. */
    links?: LessonLink[]
    /** Passages from the reader's own documents, nearest to what this
     *  lesson is about, with the pages a citation must print. Written
     *  into the prompt whole: the agent cites what it can see and
     *  nothing else. See `lib/citations.ts`. */
    passages?: CitedPassage[]
  },
  /**
   * The lesson as far as it has been written, where this is carrying on
   * from a round that filled up. Empty on the first round.
   */
  carried?: string
): Promise<{ text: string; finished: boolean }> {
  const here = (input.links ?? []).filter(l => l.here).slice(0, LINKS_HERE)
  const over = (input.links ?? []).filter(l => !l.here).slice(0, LINKS_OVER)
  const named = (l: LessonLink) =>
    `- "${l.title}" -> lesson:${lessonSlug(l.title)}${
      l.here || !l.topicTitle ? '' : ` (under ${l.topicTitle})`
    }`

  const prompt = `Write the lesson "${input.lesson.title}" from the curriculum "${input.curriculumTitle}" on the topic "${input.topicTitle}".
${input.lesson.summary ? `\nWhat it should cover: ${input.lesson.summary}` : ''}
It is a ${input.lesson.stage} lesson${
        input.lesson.estimatedMinutes ? ` and should take about ${input.lesson.estimatedMinutes} minutes to work through` : ''
      }.
${input.goal ? `\nThe reader's stated goal for the curriculum: ${input.goal}` : ''}
${input.covered.length
  ? `\nThey have already worked through:\n${input.covered.map(t => `- ${t}`).join('\n')}\nBuild on that rather than repeating it.`
  : '\nThis is early in the curriculum, so assume no prior lessons.'}
${input.sources.length
  ? `\nThe reader chose this material to steer the curriculum:\n${
      input.sources.map(s =>
        `- ${s.title}${s.url ? ` (${s.url})` : ''}${s.summary ? `: ${s.summary}` : ''}`
      ).join('\n')
    }`
  : ''}
${input.library.length
  ? `\nTheir own material, filed against this very topic. This is the shelf to reach for first. Where a point genuinely connects to one of these, link it inline as a markdown link on the words that make the point, so the reader can go straight to something they already have, and say in passing what it gives them that this lesson does not. Prefer something they have read when building on a point, and something they have not when pointing further on. Do not force connections, do not list them at the end, and never invent a URL:\n${
      input.library.map(r =>
        `- ${r.title}${r.url ? ` (${r.url})` : ' (no link)'} — ${
          r.status === 'consumed' ? 'they have read this' : 'unread'
        }${r.summary ? `: ${r.summary}` : ''}`
      ).join('\n')
    }`
  : ''}
${input.nearby?.length
  ? `\nAlso theirs, filed one topic over in the same subjects. A reader's library is not sorted the way the map is, and the piece that explains what this lesson leans on is often filed under a neighbour. Reach for these where the connection is real and worth the detour, and name the topic it sits under so the detour is signposted:\n${
      input.nearby.map(r =>
        `- ${r.title}${r.url ? ` (${r.url})` : ' (no link)'} — ${
          r.status === 'consumed' ? 'they have read this' : 'unread'
        }${r.summary ? `: ${r.summary}` : ''}`
      ).join('\n')
    }`
  : ''}

${here.length || over.length
  ? `\nThe reader's own map, as lessons. A lesson that stands alone is a lesson that teaches the reader nothing about where they are, so point at these: link one inline, as a markdown link on the words that make the point, where this lesson genuinely leans on it or genuinely leads to it. The target is \`lesson:\` and the name below, exactly as written -- not a URL, not a title, not a name of your own. Two or three across the whole lesson is plenty, and none at all is better than a forced one. Never list them at the end and never link the lesson you are writing.${
      over.length
        ? ' The ones marked with a topic sit outside the topic this lesson is in, so say in passing what the reader would go there for.'
        : ''
    }\n${[...here, ...over].map(named).join('\n')}`
  : ''}

${passagePromptSection(input.passages ?? [])}

Never announce a block or label it in the prose -- no "steps:", no "here is a chart", no "see the table below". Each block prints its own title, so a line introducing one is a line printed twice.

Use markdown headings and prose. Explain the idea, show one worked example, and finish with something concrete to try. No preamble, no "in this lesson we will".

Mathematics is typeset: write TeX between $ for notation inside a sentence and between $$ for an equation on a line of its own. Give a display equation its own line, with a blank line either side -- several $$...$$ run together on one line read as one wall rather than as three steps. Use it where notation is genuinely clearer than words, and not for a number that is only a number: $b^n$ and $\log_b(x) = y$ earn it, "20-40%" does not.

${blockPromptSection()}`

  const client = getClient()

  // The prompt is the same on every round of a lesson -- the same
  // topic, library and map -- and only the prose after it grows. Marked
  // for caching, a second round reads that whole prefix back at about a
  // tenth of the price instead of paying for it again.
  const asked: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
    },
  ]

  // Carrying on is a user turn, not a continued assistant one. Handing
  // the model the start of its own answer is an assistant prefill, and
  // every current model refuses one: it comes back a 400 rather than a
  // finished lesson.
  const messages: Anthropic.MessageParam[] = carried
    ? [...asked, { role: 'assistant', content: carried }, { role: 'user', content: CARRY_ON }]
    : asked

  // Streamed. A round is most of a minute of generation, and a request
  // that sends nothing for that long is a request something between
  // here and the model will eventually give up on.
  const stream = client.messages.stream({
    model: 'claude-sonnet-5',
    max_tokens: ROUND_TOKENS,
    messages,
  })
  const res = await stream.finalMessage()

  const block = res.content.find(c => c.type === 'text')
  if (!block || block.type !== 'text') throw new Error('curriculum: no text returned')

  // Whether the model stopped because it had finished, or because it
  // ran out of room and there is more to come.
  const finished = res.stop_reason !== 'max_tokens'
  if (!finished) {
    console.error(
      `curriculum: "${input.lesson.title}" filled a round at ${
        res.usage?.output_tokens ?? '?'
      } tokens; there is more to write`
    )
  }

  // The whole lesson so far, not just this round's share: what is
  // stored is always the complete prose, so a round that never comes
  // leaves a readable lesson rather than a fragment.
  //
  // Trailing whitespace goes because the next round is asked to carry
  // on from the last character, and a turn that ends in a space is
  // refused by the API besides.
  return { text: (carried ? carried + block.text : block.text).trimEnd(), finished }
}
