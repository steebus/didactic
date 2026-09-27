'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { unpromoteNote, type PromotedFrom } from '@didactic/core/grain'
import styles from './page.module.css'

const api = didactic()

/**
 * The way back from a promotion, on the subject it made. Two presses,
 * because it removes a subject: the first says what it will do.
 */
export function PutBack({ subjectId, from }: { subjectId: string; from: PromotedFrom }) {
  const router = useRouter()
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function putBack() {
    setBusy(true)
    setProblem(null)
    const { ok, body, error } = await api.subjects.unpromote(subjectId)
    if (!ok) {
      setBusy(false)
      setProblem(error ?? 'Could not put it back.')
      return
    }
    router.push(body.topicId ? `/topics/${body.topicId}` : '/')
    router.refresh()
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>Made from a topic</h2>
      <p className={styles.blockNote}>{unpromoteNote(from)}</p>
      {asked ? (
        <div className={styles.grubActions}>
          <button type="button" className={styles.grubKeep} onClick={() => setAsked(false)} disabled={busy}>
            Keep it
          </button>
          <button type="button" className={styles.grubGo} onClick={putBack} disabled={busy}>
            {busy ? 'Putting it back…' : `Put ${from.title} back as a topic`}
          </button>
        </div>
      ) : (
        <button type="button" className={styles.grubAsk} onClick={() => setAsked(true)}>
          Put it back as a topic
        </button>
      )}
      {problem && <p className={styles.grubProblem}>{problem}</p>}
    </section>
  )
}
