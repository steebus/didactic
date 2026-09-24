import Anthropic from '@anthropic-ai/sdk'
import { ENTRY_CEILING } from '@didactic/core/learningPlan'

/**
 * The line a lesson agent leaves in the course's learning plan.
 *
 * Every later agent reads this log to find out what the course has
 * already taught, so it has to say what the lesson *did*, not what the
 * curriculum asked it to do. Those are different: the plan already
 * holds the asked-for summary from the drafting agent, and repeating it
 * back would make the log a copy of the lesson list and tell nobody
 * anything.
 *
 * Its own call rather than a line the lesson agent appends to its own
 * prose. A lesson is written in rounds and streamed, and the last round
 * is the only one that could carry such a line -- so it would have to
 * be asked for conditionally, and then found and cut back out of the
 * body. A marker the stripping missed would be printed to the reader as
 * part of their lesson. Not worth it for one sentence.
 *
 * Haiku, because this is a summary of text that is already in front of
 * it and the cheapest capable model is the right one. A lesson costs
 * several rounds of Sonnet; this adds a fraction of one of them.
 */

const MODEL = 'claude-haiku-4-5-20251001'

/**
 * How much of a lesson the summariser is shown.
 *
 * The opening and the close, not the middle, where a lesson runs past
 * this. What a lesson set out to do and what it concluded are at the
 * two ends, and the material between them is the working -- which is
 * exactly what a one-sentence summary is meant to leave out.
 */
const SHOWN = 6000

function excerpt(body: string): string {
  if (body.length <= SHOWN) return body
  const half = Math.floor(SHOWN / 2)
  return `${body.slice(0, half)}\n\n[...middle of the lesson omitted...]\n\n${body.slice(-half)}`
}

/**
 * One sentence on what a finished lesson actually taught.
 *
 * Returns null rather than throwing on anything that goes wrong. The
 * lesson has already been written and saved by the time this runs; a
 * missing line in the log costs the next agent some context, and
 * failing the request over it would cost the reader their lesson.
 */
export async function summariseForPlan(input: {
  lessonTitle: string
  curriculumTitle: string
  body: string
}): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!input.body.trim()) return null

  try {
    const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content:
            `This lesson, "${input.lessonTitle}", has just been written for the course ` +
            `"${input.curriculumTitle}". It will be logged in the course's learning plan, which ` +
            `every agent writing a later lesson reads to find out what has already been covered.\n\n` +
            `Write that log line. One sentence, under ${ENTRY_CEILING} characters. Say what this ` +
            `lesson actually taught -- the specific ideas and terms a later lesson can now assume ` +
            `the reader has met. Where it went somewhere the title would not have led you to ` +
            `expect, say that instead, because that is the part nobody else can infer.\n\n` +
            `No preamble, no "This lesson". Just the sentence.\n\n---\n\n${excerpt(input.body)}`,
        },
      ],
    })

    const block = res.content.find(c => c.type === 'text')
    if (!block || block.type !== 'text') return null

    const line = block.text.trim()
    return line || null
  } catch (e) {
    console.error('plan: could not summarise the lesson for the learning plan', e)
    return null
  }
}
