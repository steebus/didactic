'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  jobKey,
  jobNote,
  jobPhrases,
  jobSettles,
  jobTitle,
  jobWay,
  type JobKind,
  type JobState,
} from '@didactic/core/jobs'
import { labourPhrase } from '@didactic/core/copy'
import styles from './Bench.module.css'

/** How long a finished job with nowhere to go stays up. Long enough to
 *  be read at reading speed, short enough not to sit there. */
const SETTLE_MS = 6000

/** How often the rumour advances for work that cannot report on itself.
 *  The same beat the sowing sheet's own labours keep. */
const RUMOUR_MS = 2600

export interface Job {
  key: string
  kind: JobKind
  name: string
  state: JobState
  /** Where the finished thing is. Null until there is one. */
  href: string | null
  reason: string | null
  /** What the work last said about itself: "round 2 · about 900 words".
   *  Null where it has not said anything yet, or has nothing to say. */
  progress: string | null
  /**
   * Other work this job has taken over, by key.
   *
   * A job does not always know at the outset everything it is going to
   * do. Opening a freshly sown bed drafts a route and then writes that
   * route's first lesson, and the lesson does not exist when the job
   * starts -- so `writing:<that lesson>` cannot be its key, and without
   * this the lesson's own sheet would cheerfully start a second write
   * of the same body the moment anyone opened it. Claimed as soon as it
   * is known, and given back when the job settles.
   */
  covers: string[]
  /** Anything the job wants said that is not a failure -- a bed laid
   *  with two topics the sort could not place. */
  warnings: string[]
}

/** What a job hands back when it finishes. */
export interface Made {
  /** Where to find what was made. */
  href?: string | null
  warnings?: string[]
}

/**
 * What became of a job, for the caller that stayed to find out.
 *
 * Three outcomes rather than a value-or-null, because "nothing came
 * back" meant two entirely different things -- the work failed, or it
 * was already underway and this caller joined it -- and a sheet has to
 * answer them differently. A reader standing in front of a failed
 * sowing should be told so on the sheet they are looking at, not only
 * in the corner.
 */
export type Outcome<T> =
  | { kind: 'joined' }
  | { kind: 'done'; made: T }
  | { kind: 'failed'; reason: string }

/**
 * A notice that asks rather than reports.
 *
 * The bench holds work in hand; an offer is the other thing that
 * belongs in the same corner -- something the app could do next, put
 * where the reader can take it or leave it without losing their place.
 * It is the same slip of paper, with a question on it.
 */
export interface Offer {
  key: string
  title: string
  note: string | null
  /** What the control says, and what it does. Taking it puts the offer
   *  away: it has asked its question and been answered. */
  label: string
  take: () => void
}

interface Bench {
  jobs: Job[]
  offers: Offer[]
  /** Put an offer up. The same key twice is the same offer, not two. */
  offer: (offer: Offer) => void
  /** Take it down without taking it. */
  withdraw: (key: string) => void
  /** Whether this exact piece of work is already underway. */
  running: (kind: JobKind, id: string) => boolean
  /**
   * The job for this piece of work, in whatever state it reached.
   *
   * A sheet watching its own job needs to tell *finished* from merely
   * *stopped*: those are the same transition, and treating them alike
   * is how a failed write turns into a retry loop.
   */
  jobFor: (kind: JobKind, id: string) => Job | null
  /**
   * Set a job going, and report on it from the corner of every sheet.
   *
   * Answers when the work does, so a caller that wants to wait -- the
   * lesson sheet, which has nothing to show until the body lands --
   * still can. A caller that does not simply walks away, and the bench
   * reports on it either way.
   */
  start: <T extends Made>(
    job: { kind: JobKind; id: string; name: string },
    /**
     * `report` says where the work has got to, in words the reader can
     * read. Work that knows nothing useful simply never calls it, and
     * the notice says the ordinary thing instead.
     *
     * `cover` claims another piece of work as this job's, for work that
     * only learns part way through what it is going to do. A sheet
     * asking for something already covered joins this job rather than
     * starting its own.
     */
    work: (
      report: (progress: string) => void,
      cover: (kind: JobKind, id: string) => void
    ) => Promise<T>
  ) => Promise<Outcome<T>>
}

const NOWHERE: Bench = {
  jobs: [],
  offers: [],
  offer: () => {},
  withdraw: () => {},
  running: () => false,
  jobFor: () => null,
  start: async (_job, work) => {
    // No bench, so nothing is reported -- but the work still happens.
    // A component rendered outside the provider (a test, a sheet not
    // yet wrapped) must not silently stop doing its job.
    try {
      return { kind: 'done', made: await work(() => {}, () => {}) }
    } catch (e) {
      return { kind: 'failed', reason: e instanceof Error ? e.message : 'Something went wrong.' }
    }
  },
}

const Channel = createContext<Bench>(NOWHERE)

/**
 * The potting bench: work set down and left to get on with.
 *
 * Sowing a subject and writing a lesson each take the better part of a
 * minute, and each was held by the sheet that started it. Walking off
 * to read something else unmounted the component holding the fetch, so
 * the answer arrived to nobody: the row was written, and the reader was
 * never told, and the only way to find out was to go looking.
 *
 * So the work is registered here instead, above the router, where it
 * outlives any one sheet. It is mounted from `layout.tsx`, so every
 * address in the catalogue carries it.
 *
 * What it cannot survive is a reload: the request belongs to the
 * document, and a new document has no claim on it. Sowing writes the
 * subject before its topics, and writing saves the body in one piece at
 * the end, so a reload part way through leaves a bed that can be laid
 * out again from its own answers, or a lesson that is simply still
 * unwritten. Both are recoverable in the app, which is why this is
 * worth doing without a queue behind it.
 */
export function Bench({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Read inside `start` without making it a dependency: what matters is
  // whether the work is underway at the moment of the press, and state
  // captured in a closure is a render behind.
  const live = useRef<Set<string>>(new Set())
  // What each job took over along the way, so it can be given back
  // whether the job settles or is put away by hand. Beside `live`
  // rather than read off the jobs: both are consulted from callbacks
  // that run after the render that would have told them.
  const taken = useRef<Map<string, string[]>>(new Map())

  /** Let go of a job's key and of anything it took over. */
  const release = useCallback((key: string) => {
    live.current.delete(key)
    for (const other of taken.current.get(key) ?? []) live.current.delete(other)
    taken.current.delete(key)
  }, [])

  const forget = useCallback(
    (key: string) => {
      release(key)
      setJobs(list => list.filter(j => j.key !== key))
    },
    [release]
  )

  const withdraw = useCallback((key: string) => {
    setOffers(list => list.filter(o => o.key !== key))
  }, [])

  const offer = useCallback((next: Offer) => {
    setOffers(list => (list.some(o => o.key === next.key) ? list : [...list, next]))
  }, [])

  /**
   * Whether this piece of work is underway.
   *
   * Read off the jobs themselves rather than off the ref below. The ref
   * is what `start` guards the race with -- state captured in a closure
   * is a render behind, and two presses in the same tick would both
   * find nothing -- but a ref read during a render does not make the
   * component re-render when it changes, so a sheet asking this
   * question would have been relying on the accident that every write
   * to the ref happens to sit beside a `setJobs`. This answers from the
   * state, which is the thing React actually re-renders on.
   */
  const jobFor = useCallback(
    (kind: JobKind, id: string) => {
      const key = jobKey(kind, id)
      // A job it took over counts. The lesson sheet asks whether *this
      // lesson* is being written, and "yes, by the job opening the bed
      // it belongs to" is the true answer -- it is what stops the sheet
      // starting a second write, and what tells it to re-read when the
      // body lands.
      return jobs.find(j => j.key === key || j.covers.includes(key)) ?? null
    },
    [jobs]
  )

  const running = useCallback(
    (kind: JobKind, id: string) => jobFor(kind, id)?.state === 'running',
    [jobFor]
  )

  const start = useCallback<Bench['start']>(
    async (job, work) => {
      const key = jobKey(job.kind, job.id)

      // Already underway: join it rather than start a second. Without
      // this, pressing "Write this lesson" on a topic sheet and then
      // opening that lesson would write the same body twice -- two
      // model calls, and whichever landed last overwriting the other.
      if (live.current.has(key)) return { kind: 'joined' }
      live.current.add(key)

      setJobs(list => [
        ...list.filter(j => j.key !== key),
        {
          key,
          kind: job.kind,
          name: job.name,
          state: 'running',
          href: null,
          reason: null,
          progress: null,
          covers: [],
          warnings: [],
        },
      ])

      const settle = (made: Made | null, reason: string | null) => {
        const href = made?.href ?? null
        const warnings = made?.warnings ?? []
        const state: JobState = reason ? 'failed' : 'done'

        // The key goes, but what it took over is not handed back to
        // anyone else: a finished write is finished, and a failed one
        // is asked for again by hand.
        release(key)
        setJobs(list =>
          list.map(j =>
            // The progress goes with it: "round 2" under a line that
            // says the lesson is written is a notice arguing with
            // itself.
            j.key === key ? { ...j, state, href, reason, warnings, progress: null } : j
          )
        )

        // The sheets are stale the moment this lands: a bed now has
        // topics, a lesson now has a body. Refreshing here rather than
        // in the caller means it happens even when the caller has been
        // unmounted for half a minute, which is the whole point.
        if (!reason) startTransition(() => router.refresh())

        // Only the ones with nowhere to go put themselves away.
        if (jobSettles({ kind: job.kind, name: job.name, state }, Boolean(href)) &&
            warnings.length === 0) {
          setTimeout(() => forget(key), SETTLE_MS)
        }
      }

      const report = (progress: string) =>
        setJobs(list => list.map(j => (j.key === key ? { ...j, progress } : j)))

      /**
       * Take over another piece of work as part of this job.
       *
       * For work that only learns part way through what it is going to
       * do: opening a bed writes a lesson that did not exist when the
       * job started, so it cannot be keyed on it. Claimed here, a sheet
       * asking for that lesson joins this job instead of starting a
       * second write of the same body.
       *
       * Never taken from someone else. Where the work is already
       * underway this does nothing and leaves it where it is -- two
       * jobs both believing they own one key is worse than one job not
       * knowing it has company.
       */
      const cover = (kind: JobKind, id: string) => {
        const other = jobKey(kind, id)
        if (other === key || live.current.has(other)) return
        live.current.add(other)
        taken.current.set(key, [...(taken.current.get(key) ?? []), other])
        setJobs(list =>
          list.map(j => (j.key === key ? { ...j, covers: [...j.covers, other] } : j))
        )
      }

      try {
        const made = await work(report, cover)
        settle(made, null)
        return { kind: 'done', made }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Something went wrong.'
        settle(null, reason)
        return { kind: 'failed', reason }
      }
    },
    [forget, release, router]
  )

  const value = useMemo(
    () => ({ jobs, offers, offer, withdraw, running, jobFor, start }),
    [jobs, offers, offer, withdraw, running, jobFor, start]
  )

  return (
    <Channel.Provider value={value}>
      {children}
      <Notices jobs={jobs} offers={offers} onDismiss={forget} onWithdraw={withdraw} />
    </Channel.Provider>
  )
}

export function useBench(): Bench {
  return useContext(Channel)
}

/**
 * What a running job is saying about itself.
 *
 * Its own reported progress where it has any, and the rumour otherwise.
 * The ticker runs per notice rather than one for the bench, so a job
 * that starts later does not join someone else's phrase half way down
 * the list.
 */
function Rumour({ job }: { job: Job }) {
  const [step, setStep] = useState(0)
  const phrases = jobPhrases(job.kind)

  useEffect(() => {
    if (job.progress) return
    const tick = setInterval(() => setStep(n => n + 1), RUMOUR_MS)
    return () => clearInterval(tick)
  }, [job.progress])

  return (
    <>
      <p className={styles.note}>{job.progress ?? labourPhrase(step, phrases)}</p>
      {/* The one thing worth saying while it runs, kept under whatever
          it is saying about itself: that leaving is safe. */}
      <p className={styles.note}>{jobNote(job)}</p>
    </>
  )
}

/**
 * The notices themselves, docked at the foot of the sheet.
 *
 * Polite, not assertive: a reader deep in a lesson is not interrupted
 * by a bed finishing, and a screen reader finishes the sentence it is
 * on before saying so. The whole mechanism exists so that walking away
 * is safe, and a notice that seizes the page would undo that.
 */
function Notices({
  jobs,
  offers,
  onDismiss,
  onWithdraw,
}: {
  jobs: Job[]
  offers: Offer[]
  onDismiss: (key: string) => void
  onWithdraw: (key: string) => void
}) {
  if (jobs.length === 0 && offers.length === 0) return null

  // Newest first. Nothing here puts itself away while it carries a way
  // to what it made, so a reader who sets four lessons writing ends up
  // with four notices; the stack is capped and scrolls rather than
  // climbing off the top of the screen, and the newest -- the one they
  // are waiting on -- is the one that cannot be scrolled out of view.
  const newest = [...jobs].reverse()

  return (
    <div className={styles.bench} role="status" aria-live="polite" aria-label="Work in hand">
      {offers.map(offer => (
        <div key={offer.key} className={styles.notice} data-state="offer">
          <div className={styles.body}>
            <p className={styles.title}>
              <span className={styles.mark} aria-hidden="true">
                ○
              </span>
              {offer.title}
            </p>
            {offer.note && <p className={styles.note}>{offer.note}</p>}
            <button
              type="button"
              className={styles.way}
              onClick={() => {
                onWithdraw(offer.key)
                offer.take()
              }}
            >
              {offer.label}
            </button>
          </div>
          <button
            type="button"
            className={styles.put}
            onClick={() => onWithdraw(offer.key)}
            aria-label={`Put away: ${offer.title}`}
          >
            ×
          </button>
        </div>
      ))}

      {newest.map(job => {
        const way = jobWay(job)
        const note = jobNote(job)

        return (
          <div key={job.key} className={styles.notice} data-state={job.state}>
            <div className={styles.body}>
              <p className={styles.title}>
                {/* A quiet mark rather than a spinner: there is no
                    figure to spin toward, and neither of these jobs can
                    honestly say how far along it is. */}
                <span className={styles.mark} aria-hidden="true">
                  {job.state === 'running' ? '◐' : job.state === 'done' ? '●' : '✗'}
                </span>
                {jobTitle(job)}
              </p>
              {job.state === 'running' ? (
                // What it can honestly say about itself. Writing a
                // lesson knows -- this app drives its rounds, so it can
                // count them and the words they put down. Sowing is one
                // request with nothing reporting out of it, so it gets
                // the sowing sheet's own rumour of a step instead: not
                // a measurement, and never dressed as one.
                <Rumour job={job} />
              ) : (
                note && <p className={styles.note}>{note}</p>
              )}
              {job.warnings.length > 0 && (
                <p className={styles.note}>{job.warnings.join(' ')}</p>
              )}
              {way && job.href && (
                <Link
                  href={job.href}
                  className={styles.way}
                  // Following it is the end of the notice: it has done
                  // the one thing it was for.
                  onClick={() => onDismiss(job.key)}
                >
                  {way}
                </Link>
              )}
            </div>

            <button
              type="button"
              className={styles.put}
              onClick={() => onDismiss(job.key)}
              aria-label={`Put away: ${jobTitle(job)}`}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
