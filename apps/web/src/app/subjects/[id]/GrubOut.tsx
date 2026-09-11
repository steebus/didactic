'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { didactic, type SubjectReckoning } from '@didactic/api'
import styles from './page.module.css'

const api = didactic()

type Reckoning = SubjectReckoning

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Grubbing out a bed.
 *
 * Two presses, and the second one is only offered once the sheet can
 * say what the first would cost. A subject holds most of what the app
 * knows -- its topics, the routes through them, the figures behind
 * them -- so a delete that only said "are you sure" would be asking a
 * question the reader has no way to answer.
 *
 * What survives is stated as plainly as what goes, because the whole
 * anxiety of this press is not knowing whether the marked passages go
 * with it.
 */
export function GrubOut({ subjectId, title }: { subjectId: string; title: string }) {
  const [asked, setAsked] = useState(false)
  const [reckoning, setReckoning] = useState<Reckoning | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function ask() {
    setBusy(true)
    setError(null)

    const { ok, body, error: failed } = await api.subjects.get(subjectId)
    if (ok) {
      setReckoning(body)
      setAsked(true)
    } else {
      setError(failed ?? 'Could not read the bed.')
    }
    setBusy(false)
  }

  async function grub() {
    setBusy(true)
    setError(null)

    const { ok, error: failed } = await api.subjects.remove(subjectId)
    if (!ok) {
      setError(failed ?? 'Could not grub it out.')
      setBusy(false)
      return
    }

    // Back to the stock list: the sheet this was on no longer exists.
    router.push('/')
    router.refresh()
  }

  if (!asked) {
    return (
      <div className={styles.grub}>
        <button type="button" className={styles.grubAsk} onClick={ask} disabled={busy}>
          {busy ? 'Reading the bed…' : 'Grub out this bed'}
        </button>
        {error && <p className={styles.grubProblem}>{error}</p>}
      </div>
    )
  }

  const r = reckoning!
  const nothingToLose = r.topics === 0

  return (
    <div className={styles.grubOpen}>
      <h3 className={styles.grubTitle}>Grub out “{r.title}”?</h3>

      {nothingToLose ? (
        <p className={styles.grubNote}>
          Nothing is planted here, so this takes away the bed and nothing else.
        </p>
      ) : (
        <>
          <p className={styles.grubNote}>This cannot be undone. It takes:</p>
          <ul className={styles.grubList}>
            <li>{count(r.topics, 'topic', 'topics')}</li>
            {r.curricula > 0 && (
              <li>
                {count(r.curricula, 'route', 'routes')} through them, and{' '}
                {count(r.lessons, 'lesson', 'lessons')}
              </li>
            )}
            {r.exposures > 0 && (
              <li>
                {count(r.exposures, 'recorded exposure', 'recorded exposures')} — the working
                behind figures that will no longer exist
              </li>
            )}
          </ul>

          {/* The reassurance is the point of asking. */}
          {(r.marks > 0 || r.resources > 0 || r.topicsKeptElsewhere > 0) && (
            <>
              <p className={styles.grubNote}>It keeps:</p>
              <ul className={styles.grubKeeps}>
                {r.marks > 0 && (
                  <li>
                    {count(r.marks, 'marked passage', 'marked passages')} — kept on the Marked
                    sheet, no longer filed under a topic
                  </li>
                )}
                {r.resources > 0 && (
                  <li>
                    {count(r.resources, 'piece', 'pieces')} of material — kept in the Library,
                    filed against no topic
                  </li>
                )}
                {r.topicsKeptElsewhere > 0 && (
                  <li>
                    {count(r.topicsKeptElsewhere, 'topic', 'topics')} that also sit under another
                    subject — untouched, and simply filed one place fewer
                  </li>
                )}
              </ul>
            </>
          )}
        </>
      )}

      {error && <p className={styles.grubProblem}>{error}</p>}

      <div className={styles.grubActions}>
        <button
          type="button"
          className={styles.grubKeep}
          onClick={() => {
            setAsked(false)
            setReckoning(null)
          }}
        >
          Leave it be
        </button>
        <button type="button" className={styles.grubGo} onClick={grub} disabled={busy}>
          {busy ? 'Grubbing out…' : `Grub out ${title}`}
        </button>
      </div>
    </div>
  )
}
