'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { TopicEvidence } from '@didactic/core/shapes'
import { grubbingOut } from '@didactic/core/adjudication'
import styles from './page.module.css'

const api = didactic()

/**
 * Grubbing out a topic, from the topic's own sheet.
 *
 * The bed's edit mode takes a topic *out of one subject* and the two
 * have read as the same act for as long as both have existed -- a
 * remove that leaves the topic standing as loose stock, next to nothing
 * that destroys it. This is the destroying one, and it is here because
 * the sheet that shows what a topic holds is the only sheet that can
 * honestly ask whether to throw it away.
 *
 * Two presses, and the second states the cost. Unlike the subject's
 * grub-out the reckoning needs no second read: this sheet has already
 * counted everything filed against the topic to print it.
 *
 * The counts are the topic's own. A route through it is the one thing
 * that goes without appearing in them by name, so it is said.
 */
export function GrubOut({
  topicId,
  topicTitle,
  evidence,
  routes,
  /** Where to go once the sheet no longer exists. The bed it sat in,
   *  falling back to the stock list for a topic filed nowhere. */
  backTo,
}: {
  topicId: string
  topicTitle: string
  evidence: TopicEvidence
  routes: number
  backTo: string
}) {
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const { takes, keeps } = grubbingOut(evidence)

  async function grub() {
    setBusy(true)
    setError(null)

    const { ok, error: failed } = await api.topics.remove(topicId)
    if (!ok) {
      setError(failed ?? 'Could not grub it out.')
      setBusy(false)
      return
    }

    router.push(backTo)
    router.refresh()
  }

  if (!asked) {
    return (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Grub it out</h2>
        <p className={styles.blockNote}>
          Takes the topic off the map for good. Taking it out of a subject
          from the bed’s own edit mode is the gentler thing, and leaves it
          standing as loose stock.
        </p>
        <button
          type="button"
          className={styles.grubAsk}
          onClick={() => setAsked(true)}
        >
          Grub out this topic
        </button>
      </section>
    )
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>Grub out “{topicTitle}”?</h2>

      {takes.length === 0 && routes === 0 ? (
        <p className={styles.blockNote}>
          Nothing is filed against it, so this takes away the topic and
          nothing else.
        </p>
      ) : (
        <>
          <p className={styles.blockNote}>This cannot be undone. It takes:</p>
          <ul className={styles.grubList}>
            {routes > 0 && takes.length === 0 && (
              <li>
                {routes === 1 ? 'the route' : `${routes} routes`} through it
              </li>
            )}
            {takes.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}

      {/* The reassurance is the point of asking: what the reader is
          actually afraid of losing is the part that survives. */}
      {keeps.length > 0 && (
        <>
          <p className={styles.blockNote}>It keeps:</p>
          <ul className={styles.grubKeeps}>
            {keeps.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}

      {error && <p className={styles.grubProblem}>{error}</p>}

      <div className={styles.grubActions}>
        <button
          type="button"
          className={styles.grubKeep}
          onClick={() => setAsked(false)}
          disabled={busy}
        >
          Leave it be
        </button>
        <button
          type="button"
          className={styles.grubGo}
          onClick={grub}
          disabled={busy}
        >
          {busy ? 'Grubbing out…' : `Grub out ${topicTitle}`}
        </button>
      </div>
    </section>
  )
}
