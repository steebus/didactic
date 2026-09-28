import Anthropic from '@anthropic-ai/sdk'
import { searchCommons } from '@/lib/pictures'

/**
 * Pictures on Commons a lesson could use, found before it is written.
 *
 * A lesson's title is a poor search: Commons matches every word, so
 * "HTTP Methods, Status Codes, and Headers in Depth" finds scanned
 * reports about wadeable waters, and "Sessions" on its own finds a
 * senator. What finds the right files is the plain name of the thing --
 * "HTTP cookie" -- matched against file names alone, so Haiku is asked
 * for those, and Commons is asked them.
 *
 * Deterministic at temperature 0 for the same reason the prompt is
 * cached: every round of a lesson asks the same thing, and a shortlist
 * that changed between rounds would break the cache it rides in.
 *
 * Returns an empty list rather than throwing: a lesson without a
 * shortlist is a lesson written the way they all used to be.
 */

const MODEL = 'claude-haiku-4-5-20251001'

export async function picturesForLesson(input: {
  topicTitle: string
  lessonTitle: string
  lessonSummary: string | null
}): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  try {
    const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: MODEL,
      max_tokens: 100,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content:
            `A lesson is about to be written: "${input.lessonTitle}", in the topic ` +
            `"${input.topicTitle}".${input.lessonSummary ? ` ${input.lessonSummary}` : ''}\n\n` +
            `Give four short searches for Wikimedia Commons that would find the diagrams or ` +
            `photographs this lesson most needs the reader to see. Each is matched against file ` +
            `names only, and every word must appear in the name, so two or three words each, in ` +
            `the plainest name for the thing -- "HTTP cookie", "TLS handshake", "seed germination" ` +
            `-- and specific enough not to find something else by the same name. One per line, ` +
            `nothing else.`,
        },
      ],
    })
    const block = res.content.find(c => c.type === 'text')
    const queries = block?.type === 'text'
      ? block.text.split('\n').map(l => l.replace(/^[\s\-*\d.]+|["']/g, '').trim()).filter(Boolean).slice(0, 4)
      : []
    return queries.length ? await searchCommons(queries) : []
  } catch (e) {
    console.error('pictures: could not search Commons for the lesson', e)
    return []
  }
}
