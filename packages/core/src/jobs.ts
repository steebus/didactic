/**
 * Work set down and left to get on with.
 *
 * Sowing a subject and writing a lesson both take the better part of a
 * minute, and both were held by the page that started them: the fetch
 * belonged to a component, so walking off to read something else
 * orphaned it. The request itself carried on -- nothing aborted it --
 * but nobody was left listening, so the answer arrived to no one and
 * the reader had no way of knowing the bed was laid.
 *
 * So a job is registered against the whole catalogue rather than
 * against a sheet, and this is the vocabulary it is reported in: the
 * words are here, where the phone can print the same ones, and the
 * machinery that runs them is the platform's own.
 *
 * Three kinds, and the three the reader actually walks away from. A job
 * is not a progress bar and never becomes one -- none of these can
 * honestly say how far along it is -- so what is reported is what is
 * true: what is underway, and then what came of it.
 *
 * `opening` is the longest of them and the only one nobody pressed a
 * button for: a bed that has just been sown lays a route through its
 * most introductory topic and writes that route's first lesson, so that
 * a subject arrives with somewhere to start rather than with twenty
 * topics and a blank page. It reports once, at the end, with the way to
 * the lesson -- the steps inside it are not separate news.
 */

import { LABOURS, OPENINGS, WRITINGS } from './copy'

export type JobState = 'running' | 'done' | 'failed'

export type JobKind = 'sowing' | 'writing' | 'opening'

export interface JobLike {
  kind: JobKind
  /** The subject or lesson this is about, in the reader's own words. */
  name: string
  state: JobState
  /** Why it failed, where it did. */
  reason?: string | null
}

/**
 * A key that says which piece of work this is, so the same job cannot
 * be started twice.
 *
 * This is the whole reason the bench is keyed rather than a plain list.
 * Press "Write this lesson" on a topic sheet and then open that lesson,
 * and the lesson's own sheet would otherwise start a second write of
 * the same body: two model calls, two charges, and whichever finished
 * last overwriting the other. Keyed, the second one joins the first.
 */
export function jobKey(kind: JobKind, id: string): string {
  return `${kind}:${id}`
}

/**
 * The line the bench prints.
 *
 * `opening` names the topic rather than the lesson, because the lesson
 * has no name the reader has ever seen: it was written by the app, for
 * a bed they sowed a minute ago, and "Bracketing and exposure
 * compensation is written" would be a notice about a stranger.
 */
export function jobTitle(job: JobLike): string {
  switch (job.state) {
    case 'running':
      return job.kind === 'sowing'
        ? `Sowing ${job.name}`
        : job.kind === 'opening'
          ? `Preparing your first lesson in ${job.name}`
          : `Writing ${job.name}`
    case 'done':
      return job.kind === 'sowing'
        ? `${job.name} is sown`
        : job.kind === 'opening'
          ? `Your first lesson in ${job.name} is ready`
          : `${job.name} is written`
    case 'failed':
      return job.kind === 'sowing'
        ? `${job.name} could not be sown`
        : job.kind === 'opening'
          ? `The first lesson in ${job.name} could not be prepared`
          : `${job.name} could not be written`
  }
}

/**
 * The sentence under it.
 *
 * While it runs, this is the one thing worth saying: that leaving is
 * fine. That is the entire point of the bench -- a reader who does not
 * know they can walk away will sit and watch a spinner for a minute.
 */
export function jobNote(job: JobLike): string | null {
  if (job.state === 'failed') return job.reason ?? 'Something went wrong.'
  if (job.state === 'done') return null
  switch (job.kind) {
    case 'sowing':
      return 'A minute or so. Carry on reading — you will be told when the bed is laid.'
    case 'opening':
      // Longer than either of the others, and worth saying so: a couple
      // of minutes of silence from something nobody asked for reads as
      // something stuck rather than something working.
      return 'A couple of minutes — a route through the first topic, then its first lesson. Carry on reading; you will be told once.'
    case 'writing':
      return 'Up to a minute. Carry on reading — you will be told when it is ready.'
  }
}

/**
 * What to say about a running job that has not reported anything.
 *
 * Writing a lesson can say something true -- which round, how many
 * words are down -- because it happens in rounds this app drives
 * itself. Sowing cannot: it is one model call and a pile of embeddings
 * behind a single request, and nothing inside it reports out. Rather
 * than a bar pretending to know, the wait is described in the same
 * voice the sowing sheet already uses, from `copy.LABOURS` -- a
 * gardener's rumour of a step, explicitly not a measurement.
 *
 * The phrase for a given tick is `copy.labourPhrase`, which every other
 * wait in the app already reads -- this only says which list a job's
 * kind draws from, so there is one set of words and one rule for
 * holding on the last of them.
 */
export function jobPhrases(kind: JobKind): string[] {
  switch (kind) {
    case 'sowing':
      return LABOURS
    case 'opening':
      // Only the drafting, which is the part with nothing reporting out
      // of it. Once the route is back the lesson's rounds report
      // themselves and the rumour gives way to a measurement.
      return OPENINGS
    case 'writing':
      return WRITINGS
  }
}

/**
 * What the way to the finished thing is called. Null while it runs:
 * there is nowhere to go yet.
 *
 * A finished sowing goes to the reading rather than to the bed. The bed
 * is a list of topics and says nothing about where it came from; the
 * reading says what the reader claimed, what their answers actually
 * showed, and what the bed was laid out from — which is the question
 * anyone has the moment a bed they did not write appears. The bed is
 * one press from it.
 *
 * An opening goes to the lesson it wrote, which is the whole reason it
 * ran: a reader told their first lesson is ready and not handed it
 * would have to go and find it through two sheets they have never seen.
 */
export function jobWay(job: JobLike): string | null {
  if (job.state !== 'done') return null
  return job.kind === 'sowing' ? 'See the reading' : 'Read it'
}


/**
 * Whether the bench may put this one away on its own.
 *
 * Only a finished job with nowhere to go. A job carrying a way to the
 * thing it made has to wait to be followed or dismissed -- taking the
 * link away on a timer, from a reader who walked off precisely because
 * they were told they could, would be the one unforgivable thing this
 * whole mechanism could do. A failure stays for the same reason: it is
 * the only place the reason is written down.
 */
export function jobSettles(job: JobLike, hasWay: boolean): boolean {
  return job.state === 'done' && !hasWay
}
