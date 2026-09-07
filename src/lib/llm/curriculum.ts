import Anthropic from '@anthropic-ai/sdk'
import type { CurriculumShape, LessonStage } from '../types'

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
 * Write one lesson. Called when the lesson is first opened rather than
 * at generation time: most drafted lessons are never reached, and a
 * curriculum the user reshapes would waste every word written early.
 */
export async function generateLessonBody(input: {
  topicTitle: string
  curriculumTitle: string
  goal: string | null
  lesson: { title: string; summary: string | null; stage: LessonStage; estimatedMinutes: number | null }
  /** Titles of the lessons already completed, so it can build on them. */
  covered: string[]
  sources: Array<{ title: string; summary: string | null }>
}): Promise<string> {
  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `Write the lesson "${input.lesson.title}" from the curriculum "${input.curriculumTitle}" on the topic "${input.topicTitle}".
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
      input.sources.map(s => `- ${s.title}${s.summary ? `: ${s.summary}` : ''}`).join('\n')
    }`
  : ''}

Use markdown headings and prose. Explain the idea, show one worked example, and finish with something concrete to try. No preamble, no "in this lesson we will".`,
    }],
  })

  const block = res.content.find(c => c.type === 'text')
  if (!block || block.type !== 'text') throw new Error('curriculum: no text returned')
  return block.text
}
