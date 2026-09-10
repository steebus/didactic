'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { NudgeIcon } from '@/components/NudgeIcon'
import { SheetNav } from '@/components/SheetNav'
import { RouteSpecimen } from '@/components/RouteSpecimen'
import { routeProgress } from '@/lib/progress'
import styles from './page.module.css'
import { Setting } from '@/components/Setting'

interface Lesson {
  id: string
  title: string
  summary: string | null
  position: number
  stage: 'introductory' | 'core' | 'advanced'
  estimated_minutes: number | null
  completed_at: string | null
  created_by: string
}

interface LessonView {
  lesson: Lesson
  availability: 'complete' | 'available' | 'locked'
  requires: string[]
  tier: number
}

interface CurriculumData {
  curriculum: {
    id: string
    title: string
    goal: string | null
    shape: 'linear' | 'branching'
    status: 'draft' | 'active' | 'archived'
    approved_at: string | null
  }
  topic: { id: string; title: string } | null
  sources: Array<{ note: string | null; resources: { id: string; title: string; kind: string } }>
  lessons: LessonView[]
  progress: { total: number; complete: number; fraction: number }
}

const STAGE_LABEL: Record<Lesson['stage'], string> = {
  introductory: 'Introductory',
  core: 'Core',
  advanced: 'Advanced',
}

const AVAILABILITY_LABEL: Record<LessonView['availability'], string> = {
  complete: 'Worked',
  available: 'Open',
  locked: 'Not yet',
}

export default function CurriculumPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [data, setData] = useState<CurriculumData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // Bumped after every write. Re-reading is the effect's job, so the
  // mutation handlers never have to set the whole payload themselves.
  const [revision, setRevision] = useState(0)
  // Reordering is off until asked for, so a draft reads as a route to
  // work through rather than a row of controls to fiddle with.
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/curricula/${id}`)
      .then(async res => {
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) setError(body.error ?? 'Could not read it.')
        else setData(body)
      })
      .catch(() => !cancelled && setError('Could not reach the server.'))
    return () => {
      cancelled = true
    }
  }, [id, revision])

  async function patch(payload: Record<string, unknown>, undo?: () => void) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/curricula/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save that.')
      setRevision(r => r + 1)
    } catch (e) {
      undo?.()
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Move a lesson up or down the run.
   *
   * The row moves on the press. Reordering is a write and a re-read
   * before anything on the sheet changed, so putting three lessons in
   * order meant three waits watching a list that had not moved yet --
   * and the reader is dragging a row, not asking a question. The
   * order they see is the order that is sent; if the write fails the
   * list goes back to what it was and says so.
   *
   * Only positions are rewritten here. A lesson's tier comes from what
   * it requires rather than from where it sits, so moving a row within
   * the run cannot change it, and the sheet's own answer arrives
   * behind this to settle anything subtler.
   */
  async function move(lessonId: string, direction: -1 | 1) {
    if (!data) return
    const order = [...data.lessons]
      .sort((a, b) => a.lesson.position - b.lesson.position)
      .map(v => v.lesson.id)
    const from = order.indexOf(lessonId)
    const to = from + direction
    if (to < 0 || to >= order.length) return
    ;[order[from], order[to]] = [order[to], order[from]]

    const held = data
    setData(d =>
      d
        ? {
            ...d,
            lessons: d.lessons.map(v => ({
              ...v,
              lesson: { ...v.lesson, position: order.indexOf(v.lesson.id) },
            })),
          }
        : d
    )

    await patch({ lessonOrder: order }, () => setData(held))
  }

  async function addLesson() {
    if (!newTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/curricula/${id}/lessons`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not add it.')
      setNewTitle('')
      setAdding(false)
      setRevision(r => r + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) {
    return (
      <main className={styles.sheet}>
        <div className={styles.body}>
          <p className={styles.problem}>{error}</p>
          <Link href="/" className={styles.quietAction}>
            Back to the stock list
          </Link>
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className={styles.sheet}>
        <div className={styles.body}>
          <Setting label="Reading the route" shape="rows" />
        </div>
      </main>
    )
  }

  const { curriculum, topic, lessons, progress, sources } = data
  const draft = curriculum.status === 'draft'
  const tiers = [...new Set(lessons.map(l => l.tier))].sort((a, b) => a - b)
  // This route's own progress, for the plant on the band: the cleanest of
  // the three, since lessons-worked here is unambiguous.
  const route = routeProgress([
    { status: curriculum.status, total: progress.total, complete: progress.complete },
  ])

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav
          back={
            topic
              ? { href: `/topics/${topic.id}`, label: 'The topic' }
              : { href: '/', label: 'Stock list' }
          }
        />
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>
              {topic ? (
                <Link href={`/topics/${topic.id}`} className={styles.eyebrowLink}>
                  {topic.title}
                </Link>
              ) : (
                'Curriculum'
              )}
            </p>
            <h1 className={styles.title}>{curriculum.title}</h1>
          </div>
          <div className={styles.headAside}>
            <RouteSpecimen progress={route} ink="var(--plate-ultramarine)" />
          </div>
        </div>

        {curriculum.goal && <p className={styles.goal}>{curriculum.goal}</p>}

        <div className={styles.figures}>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Shape</span>
            <span className={styles.figureValue}>
              {curriculum.shape === 'branching' ? 'Branching' : 'Linear'}
            </span>
          </span>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Worked</span>
            <span className={styles.figureValue}>
              {progress.complete}/{progress.total}
            </span>
          </span>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Status</span>
            <span className={styles.figureValue}>
              {draft ? 'Draft' : curriculum.status === 'archived' ? 'Archived' : 'Yours'}
            </span>
          </span>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        {draft && (
          <section className={styles.proposal}>
            <h2 className={styles.proposalTitle}>This is a proposal</h2>
            <p className={styles.proposalNote}>
              The agent drafted it. Reorder it, add what it missed, cut what you
              do not need — then approve it. Nothing counts toward the map until
              you do.
            </p>
            <div className={styles.proposalActions}>
              <button
                className={styles.action}
                disabled={busy}
                onClick={() => patch({ action: 'approve' })}
              >
                Approve it
              </button>
              <button
                className={styles.quietAction}
                disabled={busy}
                onClick={() => patch({ action: 'relinearise' })}
              >
                Make it a straight line
              </button>
            </div>
          </section>
        )}

        {error && <p className={styles.problem}>{error}</p>}

        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Lessons</h2>
            <span className={styles.sectionNote}>
              Introductory to advanced
              {draft && lessons.length > 1 && (
                <>
                  {'  ·  '}
                  <button
                    type="button"
                    className={styles.editToggle}
                    aria-pressed={editing}
                    onClick={() => setEditing(e => !e)}
                  >
                    {editing ? 'Done' : 'Reorder'}
                  </button>
                </>
              )}
            </span>
          </div>

          {lessons.length === 0 ? (
            <p className={styles.pending}>No lessons yet.</p>
          ) : (
            tiers.map(tier => (
              <div key={tier} className={styles.tier}>
                <p className={styles.tierLabel}>
                  {tier === 0 ? 'Start here' : `After ${tier}`}
                </p>
                <ul className={styles.lessons}>
                  {lessons
                    .filter(v => v.tier === tier)
                    .map(view => (
                      <li key={view.lesson.id} className={styles.lessonRow}>
                        <span
                          className={`${styles.state} ${styles[view.availability]}`}
                          aria-hidden="true"
                        />
                        <div className={styles.lessonBody}>
                          <Link
                            href={`/lesson/${view.lesson.id}`}
                            className={styles.lessonTitle}
                          >
                            {view.lesson.title}
                          </Link>
                          {view.lesson.summary && (
                            <p className={styles.lessonSummary}>{view.lesson.summary}</p>
                          )}
                          <p className={styles.lessonMeta}>
                            {STAGE_LABEL[view.lesson.stage]}
                            {view.lesson.estimated_minutes
                              ? ` · about ${view.lesson.estimated_minutes} min`
                              : ''}
                            {` · ${AVAILABILITY_LABEL[view.availability]}`}
                            {view.lesson.created_by === 'user' && ' · yours'}
                          </p>
                        </div>
                        {/* Reordering belongs to the draft, and only when
                            asked for: once a curriculum is yours and
                            lessons are being worked, shuffling the order is
                            disruptive rather than useful. */}
                        {draft && editing && (
                          <span className={styles.reorder}>
                            <span className={styles.reorderLabel}>Order</span>
                            <button
                              className={styles.nudge}
                              aria-label={`Move ${view.lesson.title} earlier`}
                              title="Move earlier"
                              disabled={busy}
                              onClick={() => move(view.lesson.id, -1)}
                            >
                              <NudgeIcon direction="up" />
                            </button>
                            <button
                              className={styles.nudge}
                              aria-label={`Move ${view.lesson.title} later`}
                              title="Move later"
                              disabled={busy}
                              onClick={() => move(view.lesson.id, 1)}
                            >
                              <NudgeIcon direction="down" />
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}

          {adding ? (
            <div className={styles.adder}>
              <label className={styles.label} htmlFor="newLesson">
                A lesson the draft missed
              </label>
              <input
                id="newLesson"
                className={styles.input}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                autoFocus
              />
              <div className={styles.proposalActions}>
                <button className={styles.action} onClick={addLesson} disabled={busy}>
                  Add it
                </button>
                <button
                  className={styles.quietAction}
                  onClick={() => setAdding(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.quietAction} onClick={() => setAdding(true)}>
              Add a lesson
            </button>
          )}
        </section>

        {sources.length > 0 && (
          <section>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Followed</h2>
              <span className={styles.sectionNote}>Material you handed over</span>
            </div>
            <ul className={styles.sourceList}>
              {sources.map(s => (
                <li key={s.resources.id} className={styles.sourceRow}>
                  <span>{s.resources.title}</span>
                  {s.note && <span className={styles.sourceNote}>{s.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!draft && (
          <p className={styles.footNote}>
            <button
              className={styles.quietAction}
              disabled={busy}
              onClick={() => patch({ action: 'unapprove' })}
            >
              Put it back to a draft
            </button>
          </p>
        )}
      </div>
    </main>
  )
}
