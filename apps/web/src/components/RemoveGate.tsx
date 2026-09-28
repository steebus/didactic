'use client'

import { useState } from 'react'
import styles from './RemoveGate.module.css'

/**
 * *Remove*, asked twice.
 *
 * Everything the reader wrote goes the moment it is removed -- the page
 * drops it on the press and the write follows behind -- so the press
 * that does it is the second one: the first turns the button into the
 * question, in place, with the way out beside it. In place rather than
 * a dialog, because the question is about the thing under the reader's
 * thumb and a dialog would take it off the screen.
 */
export function RemoveGate({
  onRemove,
  className,
  disabled,
  label = 'Remove',
}: {
  onRemove: () => void
  /** The button's own dress, so the gate wears the card's. */
  className?: string
  disabled?: boolean
  label?: string
}) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }

  return (
    <span className={styles.ask} role="group" aria-label="Are you sure?">
      <span className={styles.sure}>Are you sure?</span>
      <button
        type="button"
        className={`${className ?? ''} ${styles.yes}`}
        // The question has just replaced the button the reader pressed,
        // so the keyboard lands on the answer rather than on nothing.
        autoFocus
        onClick={() => {
          setAsking(false)
          onRemove()
        }}
      >
        Yes, remove
      </button>
      <button type="button" className={className} onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  )
}
