'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { EDITION_DATE } from '@didactic/core/copy'
import { UNFOLD_NOTE, type FoldedIn } from '@didactic/core/grain'
import styles from './page.module.css'

const api = didactic()

/**
 * Topics folded into this one's route, each with the way back.
 *
 * A fold moved everything the topic held onto this one, which is why it
 * is listed here rather than anywhere else: this is the sheet whose
 * figure it now feeds, and the only place the fold is visible from.
 */
export function Folds({ folds }: { folds: FoldedIn[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function unfold(fold: FoldedIn) {
    setBusy(fold.topicId)
    setProblem(null)
    const { ok, error } = await api.topics.unfold(fold.topicId)
    setBusy(null)
    if (!ok) {
      setProblem(error ?? 'Could not unfold it.')
      return
    }
    startTransition(() => router.push(`/topics/${fold.topicId}`))
  }

  if (folds.length === 0) return null

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>Folded in here</h2>
      <ul className={styles.folds}>
        {folds.map(fold => (
          <li key={fold.topicId} className={styles.fold}>
            <span>
              {fold.title}
              <span className={styles.foldDate}> · {EDITION_DATE.format(new Date(fold.foldedAt))}</span>
            </span>
            <button
              type="button"
              className={styles.quiet}
              disabled={busy !== null}
              onClick={() => unfold(fold)}
            >
              {busy === fold.topicId ? 'Unfolding…' : 'Unfold'}
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.blockNote}>{UNFOLD_NOTE}</p>
      {problem && <p className={styles.blockNote}>{problem}</p>}
    </section>
  )
}
