'use client'

import { useState } from 'react'
import { didactic, type Planted } from '@didactic/api'
import type { SproutView } from '@didactic/core/shapes'
import { growsSentence } from '@didactic/core/sprouting'
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
 *
 * A sprout that grows out of a subject is offered the other way round:
 * file its loose topics into that subject, with a bed of its own as the
 * second choice. Filing answers as a planting does -- the subject they
 * now sit in, how many, and the note -- so both surfaces take it the
 * same way.
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
  const [busy, setBusy] = useState<'plant' | 'dismiss' | 'file' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const parent = sprout.grows ? sprout.from.find(f => f.subjectId === sprout.grows) : undefined
  const loose = sprout.topics.filter(t => t.loose).map(t => t.id)

  async function file() {
    if (!parent) return
    setBusy('file')
    setError(null)
    const { ok, body, error: failed } = await api.subjects.fileTopics(parent.subjectId, loose)
    if (ok) {
      onPlanted({ subjectId: parent.subjectId, filed: body.filed, note: body.note })
    } else {
      setError(failed ?? `Could not file them under ${parent.title}.`)
      setBusy(null)
    }
  }

  // Filing needs no kept row: it is a press on the subject, not a
  // decision about the sprout.
  const filing = parent && loose.length > 0 && (
    <div className={styles.grows}>
      <p className={styles.growsWhy}>{growsSentence(sprout)}</p>
      <button type="button" className={styles.plant} onClick={file} disabled={busy !== null}>
        {busy === 'file'
          ? 'Filing…'
          : `File ${loose.length === 1 ? 'the loose topic' : `the ${loose.length} loose topics`} under ${parent.title}`}
      </button>
    </div>
  )

  // A row is a decision, and a sprout nobody has read by name has none
  // to hang one on yet. The sheet names on arrival, so this is the
  // state of the few seconds before that, or of a map whose `052` has
  // not run.
  if (!sprout.id) {
    return (
      <div className={styles.actions}>
        {filing}
        <p className={styles.waiting}>Being read by name — it can be given a bed in a moment.</p>
        {error && <p className={styles.problem} role="alert">{error}</p>}
      </div>
    )
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
      {filing}
      {filing && <p className={styles.or}>Or keep it apart, as a subject of its own:</p>}
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
          className={filing ? styles.dismiss : styles.plant}
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
