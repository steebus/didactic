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
 * Two kinds so far, and the two the reader actually walks away from.
 * A job is not a progress bar and never becomes one -- neither of these
 * can honestly say how far along it is -- so what is reported is what
 * is true: what is underway, and then what came of it.
 */

import { LABOURS, WRITINGS } from './copy'

export type JobState = 'running' | 'done' | 'failed'

export type JobKind = 'sowing' | 'writing'

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

/** The line the bench prints. */
export function jobTitle(job: JobLike): string {
  switch (job.state) {
    case 'running':
      return job.kind === 'sowing' ? `Sowing ${job.name}` : `Writing ${job.name}`
    case 'done':
      return job.kind === 'sowing' ? `${job.name} is sown` : `${job.name} is written`
    case 'failed':
      return job.kind === 'sowing'
        ? `${job.name} could not be sown`
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
  return job.kind === 'sowing'
    ? 'A minute or so. Carry on reading — you will be told when the bed is laid.'
    : 'Up to a minute. Carry on reading — you will be told when it is ready.'
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
  return kind === 'sowing' ? LABOURS : WRITINGS
}

/** What the way to the finished thing is called. Null while it runs:
 *  there is nowhere to go yet. */
export function jobWay(job: JobLike): string | null {
  if (job.state !== 'done') return null
  return job.kind === 'sowing' ? 'See the bed' : 'Read it'
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
