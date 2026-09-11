'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Prose } from '@/components/Prose'
import { Highlighter } from '@/components/Highlighter'
import { Contents } from '@/components/Contents'
import { Answering } from '@/components/blocks/answering'
import { useBench } from '@/components/Bench'
import { useWriteLesson } from '@/components/useWriteLesson'
import { didactic } from '@didactic/api'
import type { ExposureDepth, Highlight as Mark } from '@didactic/core/types'
import type { LessonLink } from '@didactic/core/lessonLinks'
import type { SourceLink } from '@didactic/core/sourceLinks'
import type { LessonNeighbours } from '@didactic/core/lessonState'
import { pressedLink } from '@/lib/pressedLink'
import { useScrollMemory } from '@/lib/useScrollMemory'
import { viabilityFigure } from '@didactic/core/scoring'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { Setting } from '@/components/Setting'

const api = didactic()

interface LessonData {
  lesson: {
    id: string
    title: string
    summary: string | null
    body: string | null
    /** False while more rounds of it are still to be written. */
    body_finished: boolean
    stage: 'introductory' | 'core' | 'advanced'
    estimated_minutes: number | null
    completed_at: string | null
  }
  curriculum: { id: string; title: string; status: string } | null
  topic: { id: string; title: string } | null
  resources: Array<{
    relevance: number
    resources: { id: string; title: string; kind: string; url: string | null; status: string }
  }>
  requires: Array<{ id: string; title: string; completed_at: string | null }>
  /**
   * Everything this lesson is allowed to point at: the rest of its
   * topic first, then the topics its subjects hold. A `lesson:` name
   * in the body that none of these answer to is printed as a stub.
   */
  links: LessonLink[]
  /**
   * The documents this lesson may cite, with their lengths. A `source:`
   * name none of these answer to prints as a stub, and so does a page
   * past the end of one.
   */
  sources: SourceLink[]
  /** The lessons either side of this one in its route. */
  neighbours: LessonNeighbours
  /** Questions already answered here, by key. */
  answered: Record<string, boolean>
  available: boolean
}

const STAGE_LABEL = {
  introductory: 'Introductory',
  core: 'Core',
  advanced: 'Advanced',
} as const

const DEPTHS = [
  { value: 'read', label: 'Read it', note: 'Followed the explanation.' },
  { value: 'applied', label: 'Worked it', note: 'Actually did the thing.' },
  { value: 'skim', label: 'Skimmed it', note: 'Passed my eyes over it.' },
] as const

export default function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  // The rendered body, so the contents list can read its headings.
  const article = useRef<HTMLElement>(null)
  const [data, setData] = useState<LessonData | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const [highlights, setHighlights] = useState<Mark[]>([])
  const bench = useBench()
  const job = bench.jobFor('writing', id)
  const writing = job?.state === 'running'
  /**
   * Whether this sheet has already set a write going for this lesson.
   *
   * The guard against writing the same lesson over and over. The read
   * effect below re-runs whenever anything bumps `revision` -- a mark
   * kept, a lesson finished, a write landing -- and it starts a write
   * whenever it finds no body. Without this, a write that failed left
   * the sheet in exactly that state and the next bump started another
   * one: a model call a minute, for as long as the lesson stayed open.
   * A failure is offered again by hand, below, and never on a loop.
   */
  const attempted = useRef(false)
  // Stable, where the bench itself changes identity whenever any job
  // does -- in the read effect's dependencies the whole bench would
  // re-read the lesson every time a notice in the corner ticked over.
  const writeLesson = useWriteLesson()
  // Asking for the lesson again, and the press that confirms it. Two
  // presses because it cannot be undone: the body it replaces is not
  // kept anywhere.
  const [rewriting, setRewriting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped after every write, so re-reading stays the effect's job.
  const [revision, setRevision] = useState(0)
  // The ledger entry shown right after finishing: what the work was
  // worth. Cleared on reload; the exposure log is the durable record.
  const [entry, setEntry] = useState<{
    topicTitle: string | null
    before: number | null
    after: number | null
  } | null>(null)

  // A lesson is long enough to leave halfway. Restore once the body is
  // on the page, or the restore lands on a document too short to scroll.
  useScrollMemory(`lesson:${id}`, body !== null)

  // A write this sheet joined rather than started -- the topic sheet
  // set it going -- lands on the bench with nothing here listening, so
  // the lesson is read again when it does.
  //
  // On 'done' only. Finishing and failing are the same transition out
  // of 'running', and re-reading on both is what turned one failed
  // write into a loop of them.
  const before = useRef(job?.state)
  useEffect(() => {
    if (before.current === 'running' && job?.state === 'done') setRevision(r => r + 1)
    before.current = job?.state
  }, [job?.state])

  // A different lesson is a fresh sheet, whatever this one did.
  useEffect(() => {
    attempted.current = false
    offered.current = false
  }, [id])

  /**
   * Offer to write the next lesson, once the reader is properly into
   * this one.
   *
   * A lesson is written on first open, so reaching the end of one and
   * pressing Next means waiting a minute at the exact moment the reader
   * had momentum. Asked half way through, the writing happens while
   * they finish reading and the next sheet is there when they arrive.
   *
   * Half way rather than on open: opening a lesson is not evidence
   * anyone is going to read it, and writing the next one off the back
   * of a glance is a model call bought with nothing.
   *
   * It goes on the bench rather than into the prose -- an offer set
   * into the middle of a lesson is an interruption, and this is
   * deliberately something to ignore.
   */
  const offered = useRef(false)
  useEffect(() => {
    const next = data?.neighbours?.next
    if (!body || !next || next.written || offered.current) return
    if (bench.running('writing', next.id)) return

    const look = () => {
      const el = article.current
      if (!el || offered.current) return
      const box = el.getBoundingClientRect()
      // How much of the reading has passed the bottom of the window.
      const read = Math.min(Math.max(window.innerHeight - box.top, 0), box.height)
      if (box.height <= 0 || read / box.height < 0.5) return

      offered.current = true
      bench.offer({
        key: `write-next:${next.id}`,
        title: `Next: ${next.title}`,
        note: 'Not written yet. Start it now and it will be ready when you get there.',
        label: 'Write it now',
        take: () => void writeLesson({ id: next.id, title: next.title }),
      })
    }

    window.addEventListener('scroll', look, { passive: true })
    window.addEventListener('resize', look)
    look()
    return () => {
      window.removeEventListener('scroll', look)
      window.removeEventListener('resize', look)
    }
  }, [body, data?.neighbours?.next, bench, writeLesson])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { ok, body: payload, error: failed } = await api.lessons.get(id)
      if (cancelled) return
      if (!ok) {
        setError(failed ?? 'Could not read it.')
        return
      }

      setData(payload)
      setBody(payload.lesson.body)
      setHighlights(payload.highlights ?? [])

      // A body that is there but unfinished is a lesson whose rounds
      // were interrupted -- the reader reloaded, or closed the tab --
      // and the rounds so far are on the row. It is shown while the
      // rest is written rather than held back: it is real prose, and
      // half a lesson to read beats a blank sheet and a wait.
      if (payload.lesson.body && payload.lesson.body_finished) return
      if (attempted.current) return
      attempted.current = true

      // The body is written on first open rather than at draft time:
      // most drafted lessons are never reached, and reshaping the
      // curriculum would waste anything written early.
      //
      // Through the bench, for two reasons. A minute is long enough
      // that the reader may well go elsewhere, and held here that
      // would orphan the request; and the topic sheet can set the same
      // write going, so the bench is what stops opening the lesson
      // starting a second one -- it joins the first instead, and the
      // watcher below picks the body up when it lands.
      const made = await writeLesson({ id, title: payload.lesson.title })
      if (cancelled) return
      // 'joined' means the topic sheet set this same write going and
      // this sheet is now waiting on it; the watcher above reads the
      // lesson again when it lands.
      if (made.kind === 'done') setBody(made.made.text)
      else if (made.kind === 'failed') setError(made.reason)
    })()

    return () => {
      cancelled = true
    }
  }, [id, revision, writeLesson])

  /**
   * Write the lesson again.
   *
   * The body is written once and cached on the row, which is right --
   * most of them are read once and never touched again. But a lesson
   * that came out wrong, or came out cut in half at the token ceiling,
   * was then the only lesson there would ever be: the route has taken
   * a `regenerate` flag since it was written and nothing on the page
   * ever sent it, so the only way to ask for another was to make the
   * request by hand.
   *
   * The old text is not kept. Marks are: they belong to the topic
   * rather than to the lesson, so they survive the rewrite even where
   * the new prose no longer holds the words to draw them on.
   */
  async function rewrite() {
    setRewriting(true)
    setConfirming(false)
    setError(null)

    const { ok, body: payload, error: failed } = await api.lessons.writeBody(id, true)
    if (!ok || !payload.body) {
      setError(failed ?? 'Could not write it again.')
      setRewriting(false)
      return
    }

    setBody(payload.body)
    // So the marks are re-read against the new text and the count
    // beneath it tells the truth about what can still be drawn.
    setRevision(r => r + 1)
    window.scrollTo({ top: 0 })
    setRewriting(false)
  }

  /**
   * Say how the lesson went.
   *
   * The write behind this is an exposure and a recomputed ability, a
   * second or two away on the other side of the world, and the reader
   * is not waiting on either: they have finished the lesson and are
   * telling the app so. The sheet says "Worked" on the press and the
   * writing happens behind it. What cannot be guessed is the figure it
   * moved, so the ledger fills in when the server answers -- and a
   * failure puts the state back rather than leaving a lesson marked
   * done that nothing recorded.
   */
  async function mark(action: 'complete' | 'uncomplete', depth?: string) {
    const before = data?.lesson.completed_at ?? null
    setBusy(true)
    setError(null)
    setData(d =>
      d
        ? {
            ...d,
            lesson: {
              ...d.lesson,
              completed_at: action === 'complete' ? new Date().toISOString() : null,
            },
          }
        : d
    )

    const { ok, body: payload, error: failed } = await api.lessons.patch(id, {
      action,
      depth: depth as ExposureDepth | undefined,
    })

    if (!ok) {
      setData(d => (d ? { ...d, lesson: { ...d.lesson, completed_at: before } } : d))
      setEntry(null)
      setError(failed ?? 'Could not save that.')
      setBusy(false)
      return
    }

    // What the work was worth, in the figure it moved. Held only for
    // this visit: it is an acknowledgement, not a record — the record
    // is the exposure log.
    if (action === 'complete' && payload.exposureWritten) {
      setEntry({
        topicTitle: payload.topicTitle ?? null,
        before: payload.abilityBefore ?? null,
        after: payload.abilityAfter ?? null,
      })
    } else {
      setEntry(null)
    }

    setRevision(r => r + 1)
    setBusy(false)
  }

  if (!data) {
    return (
      <main className={styles.sheet}>
        <div className={styles.body}>
          {error ? (
            <p className={styles.problem}>{error}</p>
          ) : (
            <Setting label="Turning to the lesson" shape="prose" />
          )}
        </div>
      </main>
    )
  }

  const { lesson, curriculum, topic, resources, requires, available, neighbours } = data
  const done = lesson.completed_at !== null
  const blocking = requires.filter(r => r.completed_at === null)

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav />
        <div className={styles.headRow}>
          <div>
            {/* A route drafted from a topic takes the topic's own name,
                so printing both read "Brokerage Accounts and Custody ·
                Brokerage Accounts and Custody". The route is only worth
                naming when it says something the topic did not. */}
            <p className={styles.eyebrow}>
              {topic && (
                <Link href={`/topics/${topic.id}`} className={styles.eyebrowLink}>
                  {topic.title}
                </Link>
              )}
              {curriculum && curriculum.title !== topic?.title && (
                <>
                  {topic && ' · '}
                  <Link href={`/curriculum/${curriculum.id}`} className={styles.eyebrowLink}>
                    {curriculum.title}
                  </Link>
                </>
              )}
            </p>
            <h1 className={styles.title}>{lesson.title}</h1>
          </div>
          {curriculum && (
            <Link href={`/curriculum/${curriculum.id}`} className={styles.back}>
              Back to the curriculum
            </Link>
          )}
        </div>

        <div className={styles.figures}>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Stage</span>
            <span className={styles.figureValue}>{STAGE_LABEL[lesson.stage]}</span>
          </span>
          {lesson.estimated_minutes && (
            <span className={styles.figure}>
              <span className={styles.figureLabel}>Length</span>
              <span className={styles.figureValue}>about {lesson.estimated_minutes} min</span>
            </span>
          )}
          <span className={styles.figure}>
            <span className={styles.figureLabel}>State</span>
            <span className={styles.figureValue}>
              {done ? 'Worked' : available ? 'Open' : 'Not yet'}
            </span>
          </span>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        {!available && blocking.length > 0 && (
          <section className={styles.gate}>
            <h2 className={styles.gateTitle}>There is ground before this</h2>
            <p className={styles.gateNote}>
              This lesson builds on work not done yet. You can read it anyway —
              nothing is locked — but it will assume things you have not met.
            </p>
            <ul className={styles.gateList}>
              {blocking.map(r => (
                <li key={r.id}>
                  <Link href={`/lesson/${r.id}`}>{r.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lesson.summary && <p className={styles.standfirst}>{lesson.summary}</p>}

        {error && <p className={styles.problem}>{error}</p>}

        {writing && !body ? (
          <Setting label="Writing the lesson" shape="prose" />
        ) : body ? (
          <>
            {/* What the lesson is made of, taken off the headings in
                the body below once it is on the page. */}
            <Contents root={article} body={body} />

            {/* The links a lesson writes into its prose are anchors in
                an HTML string, so following one would reload the whole
                document. Read the press and turn the sheet instead. */}
            <article
              ref={article}
              onClick={e => {
                const href = pressedLink(e)
                if (!href) return
                e.preventDefault()
                router.push(href)
              }}
            >
              {/* Selecting inside here offers to keep the passage. The
                  marks belong to the topic rather than to the lesson, so
                  they outlive a regenerated body. */}
              <Highlighter
                lessonId={id}
                existing={highlights}
                onChanged={() => setRevision(r => r + 1)}
              >
                {/* Lets the question blocks inside the prose count for
                    something. A refresher renders the same components
                    with no provider around them, where the questions
                    still ask and explain and simply do not score. */}
                <Answering lessonId={id} answered={data.answered ?? {}}>
                  <Prose markdown={body} lessons={data.links} sources={data.sources} />
                </Answering>
              </Highlighter>

              {/* Quiet, and at the end of the reading rather than the
                  top of it: a lesson worth rewriting is usually one the
                  reader has got to the bottom of. */}
              <div className={styles.rewrite}>
                {confirming ? (
                  <>
                    <p className={styles.rewriteNote}>
                      This asks for the lesson again from scratch and replaces
                      what is above. The old text is not kept. Passages you
                      marked are — they belong to the topic — but any whose words
                      are not in the new text cannot be drawn on it.
                    </p>
                    <div className={styles.rewriteRow}>
                      <button
                        type="button"
                        className={styles.quietAction}
                        onClick={rewrite}
                        disabled={rewriting}
                      >
                        Yes, write it again
                      </button>
                      <button
                        type="button"
                        className={styles.quietAction}
                        onClick={() => setConfirming(false)}
                      >
                        Leave it
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.quietAction}
                    onClick={() => setConfirming(true)}
                    disabled={rewriting}
                  >
                    {rewriting ? 'Writing it again…' : 'Write this lesson again'}
                  </button>
                )}
              </div>
            </article>
          </>
        ) : (
          <div className={styles.unwritten}>
            {!error && <p className={styles.pending}>Nothing written yet.</p>}
            {/* A write that failed is offered again here rather than
                retried behind the reader. Each attempt is a model call,
                and a sheet that quietly starts another one every time
                something on it changes is a sheet that spends money by
                being left open. */}
            {job?.state === 'failed' && (
              <button
                type="button"
                className={styles.quietAction}
                onClick={() => {
                  attempted.current = false
                  setError(null)
                  setRevision(r => r + 1)
                }}
              >
                Try writing it again
              </button>
            )}
          </div>
        )}

        {resources.length > 0 && (
          <section>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Alongside this</h2>
            </div>
            <ul className={styles.material}>
              {resources.map(r => (
                <li key={r.resources.id} className={styles.materialRow}>
                  <span>
                    {r.resources.url ? (
                      <a href={r.resources.url} target="_blank" rel="noreferrer">
                        {r.resources.title}
                      </a>
                    ) : (
                      r.resources.title
                    )}
                  </span>
                  <span className={styles.leaders} aria-hidden="true" />
                  <span className={styles.materialMeta}>{r.resources.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.finish}>
          {done ? (
            <>
              <h2 className={styles.finishTitle}>Worked</h2>

              {/* What the work was worth, written up the way the sheet
                  writes any figure. Shown only in the moment it is
                  earned; a reload returns to the plain record. */}
              {entry && entry.before !== null && entry.after !== null && (
                <div className={styles.entered}>
                  <span className={styles.enteredLabel}>Entered in the ledger</span>
                  <p className={styles.enteredFigure}>
                    <span className={styles.enteredFrom}>
                      {viabilityFigure(entry.before)}
                    </span>
                    <span className={styles.enteredArrow} aria-hidden="true">
                      →
                    </span>
                    <span className={styles.enteredTo}>
                      {viabilityFigure(entry.after)}
                    </span>
                  </p>
                  <p className={styles.enteredNote}>
                    {entry.after > entry.before
                      ? `${entry.topicTitle ?? 'This topic'} gained ${
                          viabilityFigure(entry.after) - viabilityFigure(entry.before)
                        } points of viability.`
                      : `${entry.topicTitle ?? 'This topic'} holds where it was — reading alone cannot pass the ceiling.`}
                  </p>
                </div>
              )}

              <p className={styles.finishNote}>
                Recorded on{' '}
                {new Date(lesson.completed_at!).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                . It moved the figure for {topic?.title ?? 'this topic'}.
              </p>
              <button
                className={styles.quietAction}
                disabled={busy}
                onClick={() => mark('uncomplete')}
              >
                I did not really do this
              </button>
            </>
          ) : (
            <>
              <h2 className={styles.finishTitle}>How did you go?</h2>
              <p className={styles.finishNote}>
                Say honestly how you worked through it. Reading cannot make you
                expert, so only work you actually applied lifts the figure past
                the ceiling.
              </p>
              <div className={styles.depths}>
                {DEPTHS.map((d, i) => (
                  <button
                    key={d.value}
                    className={styles.depth}
                    style={{ '--i': i } as React.CSSProperties}
                    disabled={busy}
                    onClick={() => mark('complete', d.value)}
                  >
                    <span className={styles.depthLabel}>{d.label}</span>
                    <span className={styles.depthNote}>{d.note}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* The way on, at the very foot: past the reading and past
            saying how it went, which is the order the two things
            actually happen in. A lesson is the end of a navigation, and
            until this the only ways onward were the browser's back
            button or a detour through the topic sheet to reach the row
            directly under the one you came from.

            Neither side is gated on the other being worked. Nothing in
            this app is locked -- a lesson that builds on ground not
            covered says so on its own sheet, at the top, where it can
            be read before the reading rather than enforced by hiding
            the way there. */}
        {(neighbours.previous || neighbours.next) && (
          <nav className={styles.onward} aria-label="The rest of the route">
            {neighbours.previous && (
              <Link
                href={`/lesson/${neighbours.previous.id}`}
                className={styles.onwardLink}
                data-side="back"
              >
                <span className={styles.onwardWay} aria-hidden="true">
                  ←
                </span>
                <span className={styles.onwardBody}>
                  <span className={styles.onwardLabel}>Previous</span>
                  <span className={styles.onwardTitle}>{neighbours.previous.title}</span>
                </span>
              </Link>
            )}

            {neighbours.next && (
              <Link
                href={`/lesson/${neighbours.next.id}`}
                className={styles.onwardLink}
                data-side="on"
              >
                <span className={styles.onwardBody}>
                  <span className={styles.onwardLabel}>Next</span>
                  <span className={styles.onwardTitle}>{neighbours.next.title}</span>
                </span>
                <span className={styles.onwardWay} aria-hidden="true">
                  →
                </span>
              </Link>
            )}
          </nav>
        )}
      </div>
    </main>
  )
}
