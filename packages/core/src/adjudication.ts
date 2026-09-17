/**
 * Saying whether two topics are the same thing.
 *
 * The queue asks the one question in the app that cannot be undone: a
 * merge folds two histories into one and there is no way back, while
 * keeping two topics apart costs a click to correct later. It is also
 * the question the reader is least equipped to answer, because a topic
 * is queued precisely when the wording is close -- and wording is all
 * the resolver compares.
 *
 * So the sheet has to print more than two names. What it prints is
 * what each topic is actually holding, and the sentences that say so
 * live here: both front ends ask the same question and a queue that
 * phrased the evidence differently on a phone would be a second
 * opinion about one decision.
 */

import type { TopicEvidence } from './shapes'

/**
 * How close, in words.
 *
 * The number is a cosine similarity, which means nothing to anyone who
 * has not been staring at embeddings, and the whole difficulty of this
 * queue is being asked to judge a field you are here precisely because
 * you do not know it.
 */
export function closeness(similarity: number): string {
  if (similarity >= 0.92) return 'almost the same wording'
  if (similarity >= 0.88) return 'very close wording'
  return 'close wording'
}

/**
 * What a topic holds, in one line.
 *
 * Counted things only, and nothing counted is printed as nought: a row
 * of zeroes reads as a table with nothing in it, while "nothing filed
 * against it yet" is a fact about the topic and the most useful thing
 * this line can say. Exposures are printed as readings rather than as
 * a count of rows, because that is what they are to the person reading.
 */
export function holdings(evidence: TopicEvidence): string {
  const parts: string[] = []

  if (evidence.resources > 0) {
    parts.push(`${evidence.resources} ${evidence.resources === 1 ? 'resource' : 'resources'}`)
  }
  if (evidence.lessons > 0) {
    parts.push(`${evidence.lessons} ${evidence.lessons === 1 ? 'lesson' : 'lessons'}`)
  }
  if (evidence.marks > 0) {
    parts.push(`${evidence.marks} ${evidence.marks === 1 ? 'mark' : 'marks'}`)
  }
  if (evidence.exposures > 0) {
    parts.push(
      evidence.exposures === 1 ? 'read once' : `read ${evidence.exposures} times`
    )
  }

  return parts.length === 0 ? 'Nothing filed against it yet' : parts.join(' · ')
}

/** Whether a topic is somewhere anyone has actually been. */
export function established(evidence: TopicEvidence): boolean {
  return evidence.lessons > 0 || evidence.marks > 0 || evidence.exposures > 0
}

/**
 * The one line of advice worth printing over a particular pair.
 *
 * Generic advice -- *merge only if the second covers everything the
 * first does* -- was printed identically under all twenty-five rows,
 * which is the same as printing nothing. What actually decides most of
 * these is asymmetry: a name that arrived an hour ago holding nothing,
 * against a topic with a route worked and passages marked on it, is a
 * merge; two topics that have both been read are two pursuits and
 * folding them destroys one of the two records.
 *
 * It never says *merge*. The model may raise a question and may not
 * settle one, and neither may this.
 */
export function counsel(
  pending: TopicEvidence,
  nearest: TopicEvidence,
  bothDescribed: boolean
): string {
  if (established(pending) && established(nearest)) {
    return 'Both have been read. Merging folds one of the two records into the other and cannot be undone — keep them separate unless you are certain they are one thing.'
  }

  if (!established(pending) && established(nearest)) {
    return 'This one is a bare name so far; the other has history. Nothing is lost by merging if they are the same thing.'
  }

  if (!bothDescribed) {
    return 'One of them has no description, so there is only the wording to go on. Keeping them separate is the safe call — it costs one click to undo.'
  }

  return 'Merge only if the one on the right covers everything this one does. If it goes further, or narrower, keep them separate.'
}

/**
 * The beds a topic sits in, named.
 *
 * Two topics in different subjects are usually two topics -- and where
 * they share one, that is the strongest argument the sheet can make
 * for them being one thing. Loose stock says so rather than printing
 * an empty line.
 */
export function filedUnder(evidence: TopicEvidence): string {
  if (evidence.subjects.length === 0) return 'Filed under nothing yet'
  return evidence.subjects.map(s => s.title).join(', ')
}

/** Subjects both topics sit under. The overlap is the argument for a
 *  merge; no overlap at all is an argument against one. */
export function sharedSubjects(a: TopicEvidence, b: TopicEvidence): string[] {
  const theirs = new Set(b.subjects.map(s => s.id))
  return a.subjects.filter(s => theirs.has(s.id)).map(s => s.title)
}

/**
 * Whether the two sit in the same bed, said in a sentence.
 *
 * Sharing a subject is the strongest argument the sheet can make for two
 * topics being one thing; sitting in different ones is an argument
 * against, and a topic filed nowhere is neither. All three are worth a
 * line, because the reader is otherwise comparing two names.
 */
export function overlap(pending: TopicEvidence, nearest: TopicEvidence): string {
  const shared = sharedSubjects(pending, nearest)
  if (shared.length > 0) return `Both sit under ${shared.join(', ')}.`

  if (pending.subjects.length === 0 || nearest.subjects.length === 0) {
    return 'They share no subject — one of them is not filed anywhere yet.'
  }

  return 'They sit under different subjects, which is usually two things rather than one.'
}

/**
 * When a queued topic arrived, at the scale that matters here.
 *
 * A pair queued minutes apart almost always came out of one reading, and
 * a pending topic that has been waiting a month is a decision that was
 * put off. The two are worth telling apart at a glance, and neither is
 * told by a timestamp.
 */
export function arrived(at: string, now: Date = new Date()): string {
  const then = new Date(at)
  if (Number.isNaN(then.getTime())) return 'undated'

  const minutes = Math.round((now.getTime() - then.getTime()) / 60000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`

  const days = Math.round(hours / 24)
  if (days < 31) return `${days} ${days === 1 ? 'day' : 'days'} ago`

  // Past a month it is a date, not a distance: "47 days ago" is a number
  // nobody converts back into a week they remember.
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`
}

/**
 * What grubbing out one topic takes with it, and what it leaves.
 *
 * Both halves, because the anxiety of this press is never "will it go"
 * but "does my reading go with it". The answer is not obvious and is
 * not uniform: a topic takes its routes and their lessons by cascade
 * (014), and the cards cut from those lessons follow them down (035) --
 * but a mark is something the reader wrote and deliberately outlives
 * the topic it was taken in (022), and the material stays in the
 * library, filed against one topic fewer.
 *
 * Here rather than in the sheet because three surfaces ask it -- the
 * subject bed, the topic's own sheet, and the phone after them -- and a
 * warning that counted differently in two places would be two accounts
 * of the same loss.
 */
export function grubbingOut(evidence: TopicEvidence): { takes: string[]; keeps: string[] } {
  const takes: string[] = []
  const keeps: string[] = []

  if (evidence.lessons > 0) {
    takes.push(
      `${evidence.lessons} ${evidence.lessons === 1 ? 'lesson' : 'lessons'}, the route through them, and any cards cut from them`
    )
  }
  if (evidence.exposures > 0) {
    takes.push(
      `${evidence.exposures} recorded ${evidence.exposures === 1 ? 'reading' : 'readings'} — the working behind a figure that will no longer exist`
    )
  }

  if (evidence.marks > 0) {
    keeps.push(
      `${evidence.marks} marked ${evidence.marks === 1 ? 'passage' : 'passages'} — kept on the Marked sheet, no longer filed under a topic`
    )
  }
  if (evidence.resources > 0) {
    keeps.push(
      `${evidence.resources} ${evidence.resources === 1 ? 'piece' : 'pieces'} of material — kept in the Library`
    )
  }

  return { takes, keeps }
}
