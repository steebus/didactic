'use client'

import { useState } from 'react'
import { didactic } from '@didactic/api'
import { looseTopicsPhrase } from '@didactic/core/copy'
import styles from '@/app/inbox/page.module.css'

const api = didactic()

/**
 * *Remove*, on a row of the inbox, asked before it is done.
 *
 * The first press turns the button into the question, in place, as
 * `RemoveGate` does everywhere else. The question here carries one more
 * thing: the topics that exist only because this resource brought them
 * in, asked for as the press is made (`api.resources.removal`) and
 * offered to go with it. Left unticked, the topics stay, as they always
 * did; they are never taken without being named.
 */
export function RemoveResource({
  id,
  className,
  disabled,
  onRemove,
}: {
  id: string
  className: string
  disabled?: boolean
  onRemove: (id: string, opts: { topics: boolean }) => void | Promise<void>
}) {
  const [asking, setAsking] = useState(false)
  const [loose, setLoose] = useState<Array<{ id: string; title: string }> | null>(null)
  const [withTopics, setWithTopics] = useState(false)

  async function ask() {
    setAsking(true)
    setLoose(null)
    setWithTopics(false)
    const { ok, body } = await api.resources.removal(id)
    // A preview that cannot be had offers nothing: the resource can
    // still go on its own, which is what Remove always did.
    setLoose(ok ? body.topics : [])
  }

  if (!asking) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => void ask()}>
        Remove
      </button>
    )
  }

  return (
    <span className={styles.removeAsk} role="group" aria-label="Remove this?">
      <span className={styles.removeSure}>Remove this?</span>
      {loose === null ? (
        <span className={styles.promptLabel}>Looking at what it brought in…</span>
      ) : (
        loose.length > 0 && (
          <label className={styles.removeTopics}>
            <input type="checkbox" checked={withTopics} onChange={e => setWithTopics(e.target.checked)} />
            <span>{looseTopicsPhrase(loose.map(t => t.title))}</span>
          </label>
        )
      )}
      <span className={styles.removeAnswers}>
        <button
          type="button"
          className={`${className} ${styles.removeYes}`}
          disabled={disabled || loose === null}
          autoFocus
          onClick={() => {
            setAsking(false)
            void onRemove(id, { topics: withTopics })
          }}
        >
          Yes, remove
        </button>
        <button type="button" className={className} onClick={() => setAsking(false)}>
          Keep it
        </button>
      </span>
    </span>
  )
}
