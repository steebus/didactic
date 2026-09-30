import { config } from '@didactic/core/config'
import type { ExposureDepth } from '@didactic/core/types'
import { askJev, type JevAnswer } from './jev'

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

/** The five answers, worded to be conservative where it matters. */
const MEANS: Record<Verdict, string> = {
  applied:
    'They describe actually doing it: building it, shipping it, using it in real work. Reading about how to do something is not applying it.',
  read: 'They read or studied it closely.',
  skim: 'They touched it in passing: an article glanced at, a talk half-watched.',
  struggled:
    'They say plainly that it is not landing, that they are confused, or that they cannot get it to work. Finding it hard but getting there is not struggling.',
  mentioned:
    'It is named in passing, or only as context for something else, and the entry claims nothing about their relationship to it.',
}

/**
 * How many sentences a quote is chosen from: one request's worth
 * (`jev.ts`). An entry longer than that is quoted from its opening.
 */
const QUOTABLE = 99

/**
 * Read one entry against the topics it names.
 *
 * Jev rather than a generative model, for two reasons. A verdict comes back with a distribution behind it, so one it
 * is unsure of can write nothing (`JEV_DIARY`) instead of the likeliest
 * thing. And the quote is *chosen* from the entry's own sentences
 * rather than written, so it cannot be a paraphrase: the model has no
 * way to say a sentence the writer did not write.
 *
 * `topics` is what the reader tagged. The answer is keyed by them, so
 * the model cannot reach a topic nobody pointed at.
 */
export async function readEntry(
  entry: string,
  /** `writtenFrom` marks the topic whose sheet the entry was written on,
   *  which the entry need not name to be about. */
  topics: Array<{ id: string; title: string; writtenFrom?: boolean }>
): Promise<Reading[]> {
  if (topics.length === 0) return []
  const text = entry.slice(0, MAX_CHARS)

  const answers = await askJev(
    { entry: text },
    Object.fromEntries(topics.map(t => [t.id, {
      type: 'choice' as const,
      instructions:
        `What does \`entry\`, a learning diary entry, show about the writer's relationship to "${t.title}"?` +
        (t.writtenFrom
          ? ' The entry was written on the sheet for this topic, so it may be about it without naming it. If it is plainly about something else, it is mentioned.'
          : ''),
      criteria: MEANS,
    }]))
  )

  const readings = topics.flatMap(t => {
    const answer = answers[t.id]
    if (!answer?.choice || !VERDICTS.includes(answer.choice as Verdict)) return []
    const sure = (answer.probabilities?.[answer.choice] ?? 0) >= config.JEV_DIARY
    return [{ topic: t, verdict: sure ? (answer.choice as Verdict) : 'mentioned' }]
  })

  // The quote, only where something will be written: a question whose
  // options are the entry's sentences, so what comes back is a sentence
  // the writer wrote. A quote that cannot be found costs the exposure
  // its reason, never the exposure.
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
    .map(s => s.segment.trim())
    .filter(Boolean)
    // ponytail: an entry past QUOTABLE sentences is quoted from its opening; rank by the topic's name if long entries turn up.
    .slice(0, QUOTABLE)
  const writing = readings.filter(r => depthOf(r.verdict) !== null)

  let quotes: Record<string, JevAnswer> = {}
  if (sentences.length > 1 && writing.length > 0) {
    try {
      quotes = await askJev(
        { entry: text },
        Object.fromEntries(writing.map(r => [r.topic.id, {
          type: 'choice' as const,
          instructions: `Which one sentence of the entry best shows this about the writer and "${r.topic.title}": ${MEANS[r.verdict]}`,
          criteria: Object.fromEntries(sentences.map((s, i) => [`s${i}`, s])),
        }]))
      )
    } catch (e) {
      console.error('diary: could not choose the quotes', e)
    }
  }

  return readings.map(({ topic, verdict }) => ({
    topicId: topic.id,
    verdict,
    because:
      depthOf(verdict) === null
        ? ''
        : sentences.length === 1
          ? sentences[0]
          : sentences[Number(quotes[topic.id]?.choice?.slice(1))] ?? '',
  }))
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
