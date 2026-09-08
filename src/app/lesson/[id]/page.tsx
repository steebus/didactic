'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Prose } from '@/components/Prose'
import { useScrollMemory } from '@/lib/useScrollMemory'
import { viabilityFigure } from '@/lib/scoring'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'

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
  const [data, setData] = useState<LessonData | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
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

  async function mark(action: 'complete' | 'uncomplete', depth?: string) {
    setBusy(true)
    setError(null)
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
            <p className={styles.pending}>Turning to the lesson…</p>
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
            <p className={styles.eyebrow}>
              {topic && (
                <Link href={`/topics/${topic.id}`} className={styles.eyebrowLink}>
                  {topic.title}
                </Link>
              )}
              {curriculum && (
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
          <p className={styles.pending}>Writing the lesson…</p>
        ) : body ? (
          <article>
            <Prose markdown={body} />
          </article>
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
