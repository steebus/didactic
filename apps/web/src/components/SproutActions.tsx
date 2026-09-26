'use client'

import { useState } from 'react'
import { didactic, type Planted } from '@didactic/api'
import type { SproutView } from '@didactic/core/shapes'
import styles from './SproutActions.module.css'

const api = didactic()

/**
 * The two things to do with a sprouting subject: give it a bed, or say
 * not this.
 *
 * The name is the reader's to settle, so it is a field rather than a
 * label: the model's name is where it starts, and what is typed is what
 * the subject is called. Shared by the bed's panel and the sprouting
 * sheet, because the same press should mean the same thing on both.
 */
export function SproutActions({
  sprout,
  onPlanted,
  onDismissed,
}: {
  sprout: SproutView
  onPlanted: (planted: Planted) => void
  onDismissed: () => void
}) {
  const [title, setTitle] = useState(sprout.title ?? '')
  const [busy, setBusy] = useState<'plant' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A row is a decision, and a sprout nobody has read by name has none
  // to hang one on yet. The sheet names on arrival, so this is the
  // state of the few seconds before that, or of a map whose `052` has
  // not run.
  if (!sprout.id) {
    return <p className={styles.waiting}>Being read by name — it can be given a bed in a moment.</p>
  }
  const id = sprout.id

  async function plant() {
    setBusy('plant')
    setError(null)
    const { ok, body, error: failed } = await api.sprouts.plant(id, title.trim())
    if (ok) {
      onPlanted(body)
    } else {
      setError(failed ?? 'Could not give it a bed.')
      setBusy(null)
    }
  }

  async function dismiss() {
    setBusy('dismiss')
    setError(null)
    const { ok, error: failed } = await api.sprouts.dismiss(id)
    if (ok) {
      onDismissed()
    } else {
      setError(failed ?? 'Could not set it aside.')
      setBusy(null)
    }
  }

  return (
    <div className={styles.actions}>
      <label className={styles.name}>
        <span className={styles.nameLabel}>Call it</span>
        <input
          className={styles.nameInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Name the subject"
          disabled={busy !== null}
        />
      </label>
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.plant}
          onClick={plant}
          disabled={busy !== null || !title.trim()}
        >
          {busy === 'plant' ? 'Giving it a bed…' : 'Give it a bed'}
        </button>
        <button
          type="button"
          className={styles.dismiss}
          onClick={dismiss}
          disabled={busy !== null}
        >
          {busy === 'dismiss' ? 'Setting it aside…' : 'Not this'}
        </button>
      </div>
      {error && <p className={styles.problem} role="alert">{error}</p>}
    </div>
  )
}
