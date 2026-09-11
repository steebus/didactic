'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import styles from './page.module.css'

const api = didactic()

interface Candidate {
  id: string
  title: string
  kind: string
}

/**
 * Where the user and the agent draft together. The user says what they
 * want out of it and points at material they trust; the agent proposes.
 * Nothing here approves anything — the draft lands on the curriculum
 * page for the user to reshape first.
 */
export function DraftCurriculum({
  topicId,
  topicTitle,
  candidates,
}: {
  topicId: string
  topicTitle: string
  candidates: Candidate[]
}) {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function draft() {
    setBusy(true)
    setError(null)

    const { ok, body, error: failed } = await api.curricula.create(topicId, goal, sources)
    if (!ok) {
      setError(failed ?? 'Could not draft it.')
      setBusy(false)
      return
    }

    startTransition(() => router.push(`/curriculum/${body.curriculumId}`))
  }

  if (!open) {
    return (
      <button className={styles.action} onClick={() => setOpen(true)}>
        Draft a curriculum
      </button>
    )
  }

  return (
    <div className={styles.drafter}>
      <h3 className={styles.drafterTitle}>Draft a curriculum</h3>
      <p className={styles.drafterNote}>
        The agent can lay out {topicTitle} from what it knows. Tell it what you
        actually want out of it, or point it at material you trust, and it will
        follow that instead of its own instincts.
      </p>

      <label className={styles.label} htmlFor="goal">
        What do you want out of it?
      </label>
      <textarea
        id="goal"
        className={styles.textarea}
        value={goal}
        onChange={e => setGoal(e.target.value)}
        placeholder="Enough to ship a production app, not a survey of the field."
      />

      {candidates.length > 0 && (
        <fieldset className={styles.sources}>
          <legend className={styles.label}>Material to follow</legend>
          {candidates.map(c => (
            <label key={c.id} className={styles.sourceRow}>
              <input
                type="checkbox"
                checked={sources.includes(c.id)}
                onChange={e =>
                  setSources(s =>
                    e.target.checked ? [...s, c.id] : s.filter(x => x !== c.id)
                  )
                }
              />
              <span>
                {c.title} <span className={styles.sourceKind}>{c.kind}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {error && <p className={styles.problem}>{error}</p>}

      <div className={styles.drafterActions}>
        <button className={styles.action} onClick={draft} disabled={busy}>
          {busy ? 'Drafting…' : 'Draft it'}
        </button>
        <button
          className={styles.quietAction}
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Not now
        </button>
      </div>
      <p className={styles.drafterNote}>
        A draft is a proposal. You reshape it, and it does not count for
        anything until you approve it.
      </p>
    </div>
  )
}
