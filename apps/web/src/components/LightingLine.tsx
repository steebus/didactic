'use client'

import { useSyncExternalStore } from 'react'
import { storedTheme, setStoredTheme, type Theme } from './useTheme'
import styles from './LightingLine.module.css'

/**
 * Which light the catalogue is read under, at the foot of the subjects
 * sheet beside the way out.
 *
 * Three settings rather than two, because "follow the system" is the
 * honest default and not the same answer as "daylight": a reader whose
 * machine turns dark in the evening has stated something, and a toggle
 * that only flipped between two fixed states would quietly overrule it
 * the first time it was touched.
 *
 * Printed as a line of three rather than a switch. A switch says the
 * app owns a setting; this is one of three stocks the sheet can be
 * printed on, which is a choice rather than a preference.
 */
export function LightingLine() {
  // The stored choice is browser state like the theme itself, and is
  // read the same way -- the server renders "follow the system", which
  // is also what a reader who has never touched this sees.
  const choice = useSyncExternalStore(subscribe, storedTheme, () => null)

  const options: Array<[Theme | null, string]> = [
    [null, 'System'],
    ['light', 'Daylight'],
    ['dark', 'After dark'],
  ]

  return (
    <div className={styles.lighting}>
      <span className={styles.label}>Read under</span>
      <span className={styles.options} role="group" aria-label="Lighting">
        {options.map(([value, name]) => (
          <button
            key={name}
            type="button"
            className={styles.option}
            aria-pressed={choice === value}
            onClick={() => {
              setStoredTheme(value)
              announce()
            }}
          >
            {name}
          </button>
        ))}
      </span>
    </div>
  )
}

/**
 * The stored choice changes only when this control changes it, and
 * `localStorage` fires no event in the tab that wrote it -- so the
 * write announces itself. `storage` covers the other case: the same
 * catalogue open in a second tab.
 */
const listeners = new Set<() => void>()

function announce() {
  for (const l of listeners) l()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}
