'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { LooseTopic } from '@didactic/core/shapes'
import { holdings, established } from '@didactic/core/adjudication'
import { reckon, RECKONING_EMPTY } from '@didactic/core/loose'
import { viabilityFigure } from '@didactic/core/scoring'
import styles from './page.module.css'

const api = didactic()

/**
 * Loose stock, dealt with in handfuls.
 *
 * Three things can happen to a topic that belongs nowhere, and the sheet
 * offers all three because which one is right differs per row and is
 * only answerable from what the row holds:
 *
 * - **file it** under a subject, several at once;
 * - **make it a subject**, when it turned out to be a whole field rather
 *   than a thing inside one;
 * - **throw it away**, when the reading that produced it was a passing
 *   mention.
 *
 * Every row therefore prints what it is holding — the same reading the
 * adjudication queue uses, for the opposite purpose. There it says
 * whether two topics are one thing; here it says what throwing this one
 * away would destroy. A topic that has been read is never quietly the
 * same kind of thing as a bare name ingestion left behind, and the
 * delete says so in a reckoning before it will go through.
 */
export function LooseSheet({
  loose,
  subjects,
}: {
  loose: LooseTopic[]
  subjects: Array<{ id: string; title: string }>
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [chosen, setChosen] = useState('')
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  /** Rows this reader has already dealt with. They go on the press and
   *  come back if the write does not land. */
  const [done, setDone] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const shown = loose.filter(t => !done.includes(t.id))
  const selected = shown.filter(t => picked.includes(t.id))
  const all = selected.length > 0 && selected.length === shown.length

  function toggle(id: string) {
    setAsked(false)
    setPicked(ids => (ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]))
  }

  async function fileThem() {
    const subject = subjects.find(s => s.id === chosen)
    if (!subject || selected.length === 0) return

    const ids = selected.map(t => t.id)
    setBusy('file')
    setError(null)
    setNote(null)
    setDone(gone => [...gone, ...ids])

    const { ok, body, error: failed } = await api.subjects.fileTopics(subject.id, ids)
    if (ok) {
      setPicked([])
      setChosen('')
      setNote(
        `${body.filed} ${body.filed === 1 ? 'topic' : 'topics'} filed under ${subject.title}. ${body.note}`
      )
      startTransition(() => router.refresh())
    } else {
      setDone(gone => gone.filter(id => !ids.includes(id)))
      setError(failed ?? 'Could not file them.')
    }
    setBusy(null)
  }

  async function throwThemAway() {
    const ids = selected.map(t => t.id)
    if (ids.length === 0) return

    setBusy('delete')
    setError(null)
    setNote(null)
    setDone(gone => [...gone, ...ids])

    const { ok, body, error: failed } = await api.topics.removeLoose(ids)
    if (ok) {
      setPicked([])
      setAsked(false)
      setNote(
        [
          `${body.removed} ${body.removed === 1 ? 'topic' : 'topics'} thrown away.`,
          // Filed somewhere since the sheet was drawn, so never deleted
          // by a press meant for loose stock.
          body.skipped > 0
            ? `${body.skipped} had been filed under a subject since this sheet was drawn and ${body.skipped === 1 ? 'was' : 'were'} left alone.`
            : '',
        ].filter(Boolean).join(' ')
      )
      startTransition(() => router.refresh())
    } else {
      setDone(gone => gone.filter(id => !ids.includes(id)))
      setError(failed ?? 'Could not throw them away.')
    }
    setBusy(null)
  }

  async function promote(topic: LooseTopic) {
    setBusy(topic.id)
    setError(null)
    setNote(null)

    const { ok, body, error: failed } = await api.topics.promote(topic.id)
    if (!ok) {
      setError(failed ?? 'Could not promote it.')
      setBusy(null)
      return
    }

    router.push(`/subjects/${body.subjectId}`)
    router.refresh()
  }

  if (loose.length === 0) {
    return (
      <p className={styles.empty}>
        Nothing is loose. Every topic you hold sits under at least one subject —
        which is where they are useful, because every sheet in the catalogue but
        this one is organised by subject.
      </p>
    )
  }

  const reckoning = selected.length > 0 ? reckon(selected.map(t => t.evidence)) : RECKONING_EMPTY

  return (
    <>
      <p className={styles.standing}>
        These are real topics carrying whatever has been read into them. What is
        missing is somewhere to belong — so file them under a subject, make one
        of them a subject in its own right, or throw away the ones that came
        from a passing mention.
      </p>

      <div className={styles.tools}>
        <button
          type="button"
          className={styles.pickAll}
          aria-pressed={all}
          onClick={() => {
            setAsked(false)
            setPicked(all ? [] : shown.map(t => t.id))
          }}
        >
          {all ? 'Pick none' : `Pick all ${shown.length}`}
        </button>
        <span className={styles.picked}>
          {selected.length === 0
            ? 'None picked'
            : `${selected.length} picked · ${holdings(reckoning).toLowerCase()}`}
        </span>
      </div>

      {selected.length > 0 && (
        <div className={styles.bulk}>
          <div className={styles.bulkRow}>
            <label className={styles.bulkLabel} htmlFor="file-under">
              File the {selected.length} picked under
            </label>
            <select
              id="file-under"
              className={styles.bulkSelect}
              value={chosen}
              onChange={e => setChosen(e.target.value)}
              disabled={busy !== null}
            >
              <option value="">Choose a subject</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.bulkAction}
              onClick={fileThem}
              disabled={!chosen || busy !== null}
            >
              {busy === 'file' ? 'Filing…' : 'File them'}
            </button>
          </div>
          <p className={styles.bulkNote}>
            Filing several at once does not work out what each one sits under —
            that is a reading of the whole bed, and thirty of them is several
            minutes. Press <em>Draw connections</em> on the bed afterwards and it
            asks once, for everything in it.
          </p>

          {/* Throwing away is two presses, and the second is only
              offered once the sheet can say what the first would cost.
              A topic that has been read is not the same kind of thing
              as a bare name, and the counts are the only way to tell. */}
          <div className={styles.bulkRow}>
            {!asked ? (
              <button
                type="button"
                className={`${styles.bulkAction} ${styles.destructive}`}
                onClick={() => setAsked(true)}
                disabled={busy !== null}
              >
                Throw away the {selected.length} picked
              </button>
            ) : (
              <>
                <p className={styles.reckoning}>
                  Throwing away {selected.length}{' '}
                  {selected.length === 1 ? 'topic' : 'topics'} destroys{' '}
                  {holdings(reckoning).toLowerCase()}
                  {established(reckoning)
                    ? ' — some of this has been read, and the reading log goes with it.'
                    : ' — none of it has been read.'}{' '}
                  The material itself stays in the library. This cannot be undone.
                </p>
                <button
                  type="button"
                  className={`${styles.bulkAction} ${styles.destructive}`}
                  onClick={throwThemAway}
                  disabled={busy !== null}
                >
                  {busy === 'delete' ? 'Throwing away…' : 'Yes, throw them away'}
                </button>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => setAsked(false)}
                  disabled={busy !== null}
                >
                  Keep them
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {note && <p className={styles.note}>{note}</p>}
      {error && <p className={styles.problem}>{error}</p>}

      <ul className={styles.stock}>
        {shown.map(topic => (
          <li key={topic.id} className={styles.row}>
            <label className={styles.pick}>
              <input
                type="checkbox"
                className={styles.box}
                checked={picked.includes(topic.id)}
                onChange={() => toggle(topic.id)}
              />
              <span className={styles.boxLabel}>Pick {topic.title}</span>
            </label>

            <div className={styles.rowBody}>
              <div className={styles.rowHead}>
                <Link href={`/topics/${topic.id}`} className={styles.rowName}>
                  {topic.title}
                </Link>
                <span className={styles.leaders} aria-hidden="true" />
                <span className={styles.rowFigure}>{viabilityFigure(topic.ability)}</span>
              </div>

              {topic.summary ? (
                <p className={styles.gloss}>{topic.summary}</p>
              ) : (
                <p className={styles.missing}>
                  No description — there is only the name to go on.
                </p>
              )}

              <p className={styles.holds}>{holdings(topic.evidence)}</p>

              {topic.evidence.sources.length > 0 && (
                <ul className={styles.sources}>
                  {topic.evidence.sources.map(source => (
                    <li key={source} className={styles.source}>
                      {source}
                    </li>
                  ))}
                  {topic.evidence.resources > topic.evidence.sources.length && (
                    <li className={styles.source}>
                      and {topic.evidence.resources - topic.evidence.sources.length} more
                    </li>
                  )}
                </ul>
              )}

              <div className={styles.rowActions}>
                {topic.hasRoute ? (
                  // `044` refuses to change the level of a topic with a
                  // route. Said rather than hidden: a missing control
                  // reads as a fault.
                  <span className={styles.refused}>
                    Carries a route, so it cannot become a subject
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() => promote(topic)}
                    disabled={busy !== null}
                  >
                    {busy === topic.id ? 'Promoting…' : 'Make it a subject'}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
