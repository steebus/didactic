import { experimental_evaluate as evaluate } from 'ai'
import { readDistribution, readSubjects, NONE, type Reading } from '@didactic/core/resolution'
import { config } from '@didactic/core/config'
import type { ConceptToJudge, SubjectToJudge } from './overlap'

/**
 * The reading, asked of an evaluation model instead of a generative one.
 *
 * `overlap.ts` asks Sonnet the same two questions and gets back a tool
 * call carrying, among other things, a `confidence` number that the
 * model wrote about itself. Everything downstream turns on that number
 * -- `SURE_ENOUGH` gates on it -- and a generative model's self-reported
 * confidence is not a probability. It clusters at 0.9 and 0.95 and
 * barely moves with the actual difficulty of the pair, which makes the
 * bar it feeds a bar over nothing.
 *
 * Jev answers typed questions and returns a distribution over the
 * options. That is the same question with a real number behind it, and
 * it is the number `packages/core/resolution.ts` was written to read.
 *
 * What it cannot do is generate: no names, no descriptions, no edges,
 * no note. So this replaces the *judging* half of ingestion and nothing
 * else. `concepts.ts` still reads the resource, `edges.ts` still relates
 * what was created, and the embedding still nominates -- Jev has no
 * index and must be handed its options, which is why `fetchCandidates`
 * is not merely kept but widened.
 *
 * ## Why the request is shaped the way it is
 *
 * One state, many questions. Jev evaluates every question in parallel
 * against one shared state, so the division that matters is what is
 * paid for once and what is paid for per question:
 *
 *  - The resource, the concepts and the subjects go in the **state**.
 *    They are the same for every question, so they are sent once.
 *  - A concept's candidate topics go in its own question's
 *    **criteria**, because they differ per concept and there is nowhere
 *    else for them to go.
 *
 * Putting the candidates in the state too would read better and cost
 * roughly double. The subjects' criteria are therefore left as `null`
 * descriptions -- the state has already said what each subject holds,
 * and saying it twice is the whole of the waste.
 */

/** What the reading said about one concept. */
export interface JevVerdict {
  /** The action the distribution supports, already weighed. */
  reading: Reading
  /** Subjects it belongs under, every one above the floor. */
  subjects: string[]
  /** The distribution itself, for the adjudication queue to show and
   *  for the harness to score calibration against. */
  probabilities: Record<string, number> | undefined
}

export const MODEL = 'typesafe-ai/jev'

/** Jev's own limit on a choice question. The nomination cap sits far
 *  below it, so this is a guard against a caller, not a tuning knob. */
const MAX_OPTIONS = 255

const SAME_INSTRUCTIONS =
  'Which of these existing topics is this concept, written under another name? ' +
  'Two names for one idea -- things that would be taught as one thing -- is a match. ' +
  'A narrower case, a broader one, a prerequisite, or a close neighbour is not: ' +
  'those are separate topics that happen to be related. ' +
  'Read the descriptions, not just the names: similar names with different scopes ' +
  'are different topics, and different names with one scope are the same topic.'

const SUBJECT_INSTRUCTIONS =
  'Which subject does this concept belong under? A subject is a field someone is ' +
  'learning; a topic belongs under it when someone studying that field would expect ' +
  'to meet it there. Where none of them is a natural home -- only loosely adjacent, ' +
  'or sharing a word -- answer none.'

/**
 * Judge a resource's concepts against the map.
 *
 * Returns null where there is nothing to judge or nothing usable came
 * back, and *throws* where the call itself failed. That split is the
 * one `judgeConcepts` already has, and it is load-bearing: `ingest.judge`
 * catches the throw and turns it into the warning the inbox prints, so
 * a resource filed by name says why it was. Swallowing the error here
 * would file it just as quietly and tell nobody -- which is the exact
 * failure `045` was written about, a resource that reads as "filed
 * under nothing" when it was really never read.
 */
export async function judgeWithJev(input: {
  resourceTitle: string
  concepts: ConceptToJudge[]
  subjects: SubjectToJudge[]
  signal?: AbortSignal
}): Promise<Map<string, JevVerdict> | null> {
  const { concepts, subjects } = input
  if (concepts.length === 0) return null
  if (subjects.length === 0 && concepts.every(c => c.nearest.length === 0)) return null

  const questions: Record<string, Parameters<typeof evaluate>[0]['questions'][string]> = {}

  for (const concept of concepts) {
    const nearest = concept.nearest.slice(0, MAX_OPTIONS - 1)

    // A concept the search found nothing for has nothing to be the same
    // as. Asking anyway would be a choice question whose only option is
    // `none`, which is a request that costs tokens to answer itself.
    if (nearest.length > 0) {
      questions[`same:${concept.key}`] = {
        type: 'choice',
        instructions: `${SAME_INSTRUCTIONS}\n\nThe concept is "${concept.name}"${
          concept.description ? `: ${concept.description}` : ''
        }.`,
        criteria: {
          ...Object.fromEntries(
            nearest.map(n => [
              n.id,
              `${n.title}${n.summary ? ` — ${n.summary}` : ' — (no description)'}${
                n.subjects.length ? ` [filed under ${n.subjects.join(', ')}]` : ' [filed nowhere]'
              }`,
            ])
          ),
          [NONE]: 'None of these. It is its own topic, not on the map yet.',
        },
      }
    }

    if (subjects.length > 0) {
      questions[`subj:${concept.key}`] = {
        type: 'choice',
        instructions: `${SUBJECT_INSTRUCTIONS}\n\nThe concept is "${concept.name}"${
          concept.description ? `: ${concept.description}` : ''
        }.`,
        // Descriptions left null: the state already lists what each
        // subject holds, and this question is asked once per concept.
        criteria: {
          ...Object.fromEntries(subjects.slice(0, MAX_OPTIONS - 1).map(s => [s.id, null])),
          [NONE]: 'None of them is a natural home for it.',
        },
      }
    }
  }

  if (Object.keys(questions).length === 0) return null

  const result = await evaluate({
    model: MODEL,
    state: {
      resource: input.resourceTitle,
      concepts: concepts.map(c => ({
        key: c.key,
        name: c.name,
        description: c.description ?? null,
      })),
      subjects: subjects.map(s => ({ id: s.id, title: s.title, holds: s.topics })),
    },
    questions,
    abortSignal: input.signal,
  })

  const answers = result.answers as Record<string, unknown>
  if (!answers || Object.keys(answers).length === 0) return null

  const verdicts = new Map<string, JevVerdict>()

  for (const concept of concepts) {
    const same = answers[`same:${concept.key}`] as
      | { choice?: string; probabilities?: Record<string, number> }
      | undefined
    const subj = answers[`subj:${concept.key}`] as
      | { probabilities?: Record<string, number> }
      | undefined

    // Ids are checked back against what this concept was actually shown.
    // An answer naming a topic that was not among its own options is a
    // confused answer, not a confident one, and `resolution.ts` is only
    // asked to weigh numbers that came from options it offered.
    const offered = new Set([...concept.nearest.map(n => n.id), NONE])
    const probabilities = same?.probabilities
      ? Object.fromEntries(Object.entries(same.probabilities).filter(([id]) => offered.has(id)))
      : undefined

    // A concept with no candidates is its own topic by construction:
    // the search found nothing for it to be.
    const reading =
      concept.nearest.length === 0
        ? readDistribution(NONE, { [NONE]: 1 })
        : readDistribution(same?.choice, probabilities)

    verdicts.set(concept.key, {
      reading,
      subjects: readSubjects(subj?.probabilities),
      probabilities,
    })
  }

  return verdicts.size > 0 ? verdicts : null
}

/** How many topics the embedding is asked for. Named here so the
 *  ingest path and the harness cannot drift apart. */
export const NOMINATED = config.RESOLVER_NOMINATED
