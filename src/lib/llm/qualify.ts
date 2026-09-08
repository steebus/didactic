import Anthropic from '@anthropic-ai/sdk'

/**
 * A question that probes whether the user actually holds a subject, in a
 * graded set from "anyone who has heard of this" to "you work in it".
 * `level` is the rung, 1-5, matched to the roots scale on the sowing
 * sheet so a set of answers reads against the same ruler the user set
 * themselves.
 */
export interface QualifyingQuestion {
  prompt: string
  level: number
  /** What a good answer would show. Printed as the question's hint. */
  probes: string
}

const TOOL = {
  name: 'record_qualifying_questions',
  description:
    'Record a graded set of questions that would establish how much of a subject someone actually holds.',
  input_schema: {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The question, addressed to the learner as "you".',
            },
            level: {
              type: 'number',
              description:
                '1-5. 1 is answerable by anyone who has read about the subject once; 5 only by someone who works in it.',
            },
            probes: {
              type: 'string',
              description:
                'One short clause naming what a good answer would show. No question mark.',
            },
          },
          required: ['prompt', 'level', 'probes'],
        },
      },
    },
    required: ['questions'],
  },
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('qualify: ANTHROPIC_API_KEY is not set')
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export interface QualifyBrief {
  subject: string
  /** The roots figure the user set, 0-5, if they have set one yet. */
  roots?: number | null
  /** What they say they already hold, in their words. */
  confident?: string | null
  /** How far they said they want to take it. */
  depth?: string | null
}

/**
 * Write the qualifying set for a subject. Called as soon as the subject
 * is named, so it is generating while the user is still filling in the
 * rest of the sheet: by the time they reach the bottom of the form the
 * questions are usually already there.
 *
 * Answers are optional and are evidence, not a test — nothing is scored
 * here. The set exists so the first ability figure rests on something
 * the user said about the subject rather than on the subject's name.
 */
export async function proposeQualifyingQuestions(
  brief: QualifyBrief
): Promise<QualifyingQuestion[]> {
  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_qualifying_questions' },
    messages: [{
      role: 'user',
      content: `Write 5 to 10 questions that would establish how much of "${brief.subject}" someone actually holds.

Order them by difficulty, easiest first, and spread them across the whole range: the first should be answerable by anyone who has read one article, the last only by someone who works in the subject regularly.
${brief.roots != null ? `\nThey put their own level at ${brief.roots} out of 5, so weight the set around that rung — but keep questions on either side of it, because the point is to check that figure rather than agree with it.` : ''}
${brief.confident ? `\nThey say they are already solid on: ${brief.confident}` : ''}
${brief.depth ? `\nHow far they want to take it: ${brief.depth}` : ''}

Rules:
- Ask about the subject itself, never about how confident they feel.
- Each question must be answerable in a sentence or two. No exercises, no "write a program that".
- A question is useless if its answer is yes or no. Ask what, how, or when.
- Do not number them or restate the difficulty in the text.`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    throw new Error('qualify: no structured output')
  }

  const raw = (tool.input as { questions?: Array<Partial<QualifyingQuestion>> }).questions

  // The model's shape is a promise, not a guarantee. Anything without a
  // question to print is dropped rather than rendering an empty row.
  const questions = (raw ?? [])
    .filter(q => typeof q?.prompt === 'string' && q.prompt.trim().length > 0)
    .map(q => ({
      prompt: q.prompt!.trim(),
      // An out-of-range rung would sort the set wrongly and print a
      // difficulty the user cannot read against the roots slider.
      level: Number.isFinite(q.level) ? Math.min(5, Math.max(1, Math.round(q.level!))) : 3,
      probes: typeof q.probes === 'string' ? q.probes.trim() : '',
    }))

  if (questions.length === 0) throw new Error('qualify: the set came back empty')

  // Difficulty order is the whole point of the set, and the model's own
  // ordering is only usually right. Sorting by the stated rung and
  // keeping the model's order within a rung makes the printed set match
  // the numbers beside it.
  return questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.level - b.q.level || a.i - b.i)
    .map(({ q }) => q)
    .slice(0, 10)
}
