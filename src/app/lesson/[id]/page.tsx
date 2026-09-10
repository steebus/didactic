'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Prose } from '@/components/Prose'
import { Highlighter } from '@/components/Highlighter'
import { Contents } from '@/components/Contents'
import type { Highlight as Mark } from '@/lib/types'
import { useScrollMemory } from '@/lib/useScrollMemory'
import { readJson } from '@/lib/http'
import { viabilityFigure } from '@/lib/scoring'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { Setting } from '@/components/Setting'

interface LessonData {
  lesson: {
    id: string
    title: string
    summary: string | null
    body: string | null
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
  // The rendered body, so the contents list can read its headings.
  const article = useRef<HTMLElement>(null)
  const [data, setData] = useState<LessonData | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const [highlights, setHighlights] = useState<Mark[]>([])
  const [writing, setWriting] = useState(false)
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

  useEffect(() => {
    let cancelled = false

    fetch(`/api/lessons/${id}`)
      .then(async res => {
        const payload = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(payload.error ?? 'Could not read it.')
          return
        }
        setData(payload)
        setBody(payload.lesson.body)
        setHighlights(payload.highlights ?? [])
        if (payload.lesson.body) return

        // The body is written on first open rather than at draft time:
        // most drafted lessons are never reached, and reshaping the
        // curriculum would waste anything written early.
        setWriting(true)
        try {
          const r = await fetch(`/api/lessons/${id}/body`, { method: 'POST' })
          const b = await r.json()
          if (cancelled) return
          if (!r.ok) setError(b.error ?? 'Could not write it.')
          else setBody(b.body)
        } catch {
          if (!cancelled) setError('Could not reach the server.')
        } finally {
          if (!cancelled) setWriting(false)
        }
      })
      .catch(() => !cancelled && setError('Could not reach the server.'))

    return () => {
      cancelled = true
    }
  }, [id, revision])

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
    try {
      const res = await fetch(`/api/lessons/${id}/body`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ regenerate: true }),
      })
      const { ok, body: payload, error: failed } = await readJson<{ body?: string }>(res)
      if (!ok || !payload.body) throw new Error(failed ?? 'Could not write it again.')

      setBody(payload.body)
      // So the marks are re-read against the new text and the count
      // beneath it tells the truth about what can still be drawn.
      setRevision(r => r + 1)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setRewriting(false)
    }
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

    try {
      const res = await fetch(`/api/lessons/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, depth }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Could not save that.')

      // What the work was worth, in the figure it moved. Held only for
      // this visit: it is an acknowledgement, not a record — the record
      // is the exposure log.
      if (action === 'complete' && payload.exposureWritten) {
        setEntry({
          topicTitle: payload.topicTitle,
          before: payload.abilityBefore,
          after: payload.abilityAfter,
        })
      } else {
        setEntry(null)
      }

      setRevision(r => r + 1)
    } catch (e) {
      setData(d => (d ? { ...d, lesson: { ...d.lesson, completed_at: before } } : d))
      setEntry(null)
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
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

  const { lesson, curriculum, topic, resources, requires, available } = data
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

            <article ref={article}>
              {/* Selecting inside here offers to keep the passage. The
                  marks belong to the topic rather than to the lesson, so
                  they outlive a regenerated body. */}
              <Highlighter
                lessonId={id}
                existing={highlights}
                onChanged={() => setRevision(r => r + 1)}
              >
                <Prose markdown={body} />
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
          !error && <p className={styles.pending}>Nothing written yet.</p>
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
      </div>
    </main>
  )
}
