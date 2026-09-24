/**
 * What a probability distribution over candidate topics is worth.
 *
 * The resolver used to answer this from a cosine similarity and two
 * thresholds, and `config.ts` is honest about where that left it: no
 * cutoff separates "React / React Hooks" at 0.916, which must never
 * merge, from "CDN Distribution / Content Delivery Network" at 0.852,
 * which should. The bands overlap because the measure is wrong for the
 * question -- gte-small scores shared vocabulary, and two topics under
 * one subject share all of it.
 *
 * So the embedding stops deciding and starts nominating. It is good at
 * the job nothing else can do -- narrowing thousands of topics to a
 * shortlist -- and bad at the one it was also being asked to do. An
 * evaluation model reads the shortlist and returns a distribution over
 * it, and this is the reading of that distribution.
 *
 * What a distribution buys over a similarity is that it was taken
 * across the whole shortlist at once. A cosine scores one pair at a
 * time and never sees the runner-up, so it cannot tell "certainly this
 * one" from "this one, narrowly, over three others" -- and those want
 * different handling. A normalised distribution says both in one
 * number, which is why the bar below is a single threshold: a winner
 * above it has already left every rival beneath it.
 *
 * Shared, because the phone will print the same verdict and a bar that
 * stood in two places would link a concept on one platform and queue it
 * on the other.
 */

import { config } from './config'

/** The option meaning "none of these; it is its own topic". Not a topic
 *  id, and checked for by identity rather than by shape, so a topic can
 *  never be called `none` by accident. */
export const NONE = 'none'

export type ResolutionAction =
  | { action: 'link'; topicId: string }
  | { action: 'pending'; nearestId: string }
  | { action: 'create' }

/** An intersection rather than an `extends`, because the action is a
 *  union and the discriminant has to survive: narrowing on `action`
 *  is what gives a caller `topicId` or `nearestId` without a cast. */
export type Reading = ResolutionAction & {
  /** What the winning option scored. For `create` this is p(none). */
  probability: number
  /** The gap to the option behind it. Zero where nothing was behind it. */
  margin: number
  /** Why it went this way, for the queue to print and for the harness
   *  to count. Not user-facing copy. */
  because: 'sure' | 'narrow-margin' | 'unsure' | 'distinct' | 'empty'
}

/**
 * Read a distribution into an action.
 *
 * Three ways to land, and they are not symmetric. A **link** needs both
 * a high probability and daylight behind it, because a merge folds two
 * histories into one and `merge_topics` deletes the loser -- there is
 * no undo and no record (`043`). A **create** needs `none` to win
 * outright, because a wrong create costs one press on the adjudication
 * queue. Everything else is a **pending**: the honest answer to an
 * ambiguous distribution is to ask, and asking is cheap.
 *
 * `probabilities` is optional on the wire -- not every provider returns
 * a distribution -- so a bare choice with no numbers behind it is read
 * as a question for the user rather than as a link. A model that
 * cannot say how sure it is has not earned an irreversible write.
 */
export function readDistribution(
  choice: string | undefined,
  probabilities: Readonly<Record<string, number>> | undefined
): Reading {
  const entries = Object.entries(probabilities ?? {})
    .filter(([, p]) => Number.isFinite(p))
    .sort((a, b) => b[1] - a[1])

  // No distribution at all. A choice on its own is a verdict without
  // its reasoning, and this function's whole job is to weigh the
  // reasoning, so it declines to link on one.
  if (entries.length === 0) {
    return choice && choice !== NONE
      ? { action: 'pending', nearestId: choice, probability: 0, margin: 0, because: 'empty' }
      : { action: 'create', probability: 0, margin: 0, because: 'empty' }
  }

  const [top, second] = entries
  const margin = top[1] - (second?.[1] ?? 0)

  if (top[0] === NONE) {
    // Sure it is none of them. Below the bar it is still a question --
    // "probably new" and "probably one of these" are both questions,
    // and only one of them has a topic to name.
    if (top[1] >= config.JEV_DISTINCT) {
      return { action: 'create', probability: top[1], margin, because: 'distinct' }
    }
    const nearest = entries.find(([id]) => id !== NONE)
    return nearest
      ? { action: 'pending', nearestId: nearest[0], probability: nearest[1], margin, because: 'unsure' }
      : { action: 'create', probability: top[1], margin, because: 'distinct' }
  }

  if (top[1] >= config.JEV_LINK) {
    return { action: 'link', topicId: top[0], probability: top[1], margin, because: 'sure' }
  }

  return {
    action: 'pending',
    nearestId: top[0],
    probability: top[1],
    margin,
    // The two ways to be unsure. Both are queued -- this only decides
    // how the queue words itself -- but a close race between two named
    // topics and a shrug at everything are different things to show
    // someone who has to press one of the buttons.
    because: margin < config.JEV_CLOSE ? 'narrow-margin' : 'unsure',
  }
}

/**
 * The subjects a concept belongs under, from one distribution.
 *
 * Membership is many-to-many and has been since `012` -- a topic
 * belongs to every subject it genuinely sits under, not to whichever
 * scored highest. So this takes everything above a floor rather than
 * the winner, and a distribution that puts 0.45 on two subjects files
 * the topic under both.
 *
 * `none` winning outright means the topic stands alone, which is a real
 * answer and not a failure to decide: `045` distinguishes a reading
 * that said "nowhere" from one that never ran, and so does this --
 * an empty array is the first, and the caller is expected to omit the
 * key entirely for the second.
 */
export function readSubjects(
  probabilities: Readonly<Record<string, number>> | undefined
): string[] {
  const entries = Object.entries(probabilities ?? {}).filter(([, p]) => Number.isFinite(p))
  if (entries.length === 0) return []

  const none = entries.find(([id]) => id === NONE)?.[1] ?? 0
  if (none >= config.JEV_DISTINCT) return []

  return entries
    .filter(([id, p]) => id !== NONE && p >= config.JEV_SUBJECT)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}

/**
 * How sure the reading was, in words.
 *
 * `adjudication.closeness` says the same thing about a cosine and its
 * own comment complains that the number means nothing to anyone who has
 * not been staring at embeddings. This one is a probability that
 * something read both descriptions, so it can be said plainly. A race
 * says so as well as scoring itself, because "it might be this one, or
 * it might be that one" is the most useful thing the queue can tell a
 * reader who has to press one of the buttons.
 */
export function readingSentence(reading: Reading): string {
  const pct = Math.round(reading.probability * 100)

  switch (reading.because) {
    case 'sure':
      return `Read as the same topic, ${pct}% sure.`
    case 'narrow-margin':
      return `Nearest match read at ${pct}%, with another close behind it — a race rather than a match.`
    case 'distinct':
      return `Read as its own topic, ${pct}% sure it is none of the ones nearby.`
    case 'empty':
      return 'Nothing was returned to weigh, so it is left for you.'
    case 'unsure':
      return `Nearest match read at ${pct}%, which is not sure enough either way.`
  }
}
