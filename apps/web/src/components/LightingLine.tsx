'use client'

import { useSyncExternalStore } from 'react'
import {
  LIGHTINGS,
  LIGHTING_BOX,
  LIGHTING_CENTRE,
  LIGHTING_GLYPHS,
  LIGHTING_LABEL,
  LIGHTING_NOTE,
  LIGHTING_RAY,
  type Lighting,
} from '@didactic/core/lighting'
import { storedTheme, setStoredTheme, type Theme } from './useTheme'
import styles from './LightingLine.module.css'

/**
 * Which light the catalogue is read under, at the foot of every sheet.
 *
 * Three settings rather than two, because "follow the system" is the
 * honest default and not the same answer as "daylight": a reader whose
 * machine turns dark in the evening has stated something, and a toggle
 * that only flipped between two fixed states would quietly overrule it
 * the first time it was touched.
 *
 * Drawn rather than written. It was three words -- *System · Daylight ·
 * After dark* -- at the foot of the subjects sheet alone, which is a
 * setting you have to already know about to find, on the one sheet
 * nobody is standing on at the hour it matters: the room gets dark
 * while you are in a lesson or in the garden, not on the catalogue
 * front. Three glyphs go at the foot of every sheet in the room the
 * line of prose was taking, and what is being chosen is a condition
 * rather than a word.
 *
 * The forms are `core/lighting`, not markup written here, for the
 * reason every drawn thing in this app keeps its geometry there: the
 * phone draws the same three with `react-native-svg` off the same
 * paths, and a setting that wears a different face on each platform is
 * two settings.
 */
export function LightingLine() {
  // The stored choice is browser state like the theme itself, and is
  // read the same way -- the server renders "follow the system", which
  // is also what a reader who has never touched this sees.
  const choice = useSyncExternalStore(subscribe, chosen, () => 'system' as const)

  return (
    <div className={styles.lighting} role="group" aria-label="Which light this is read under">
      {LIGHTINGS.map(light => (
        <button
          key={light}
          type="button"
          className={styles.option}
          aria-pressed={choice === light}
          // The label is the whole of what this button says: there is
          // no text under a glyph to fall back on. `title` puts the
          // same sentence under a pointer that hovers and wonders.
          aria-label={LIGHTING_NOTE[light]}
          title={`${LIGHTING_LABEL[light]} — ${LIGHTING_NOTE[light]}`}
          onClick={() => {
            setStoredTheme(light === 'system' ? null : light)
            announce()
          }}
        >
          <Glyph light={light} />
        </button>
      ))}
    </div>
  )
}

/**
 * One form, drawn from the shared geometry.
 *
 * Everything is `currentColor` so the glyph inherits the state of the
 * button around it -- faint at rest, inked when it is the one in use --
 * rather than restating three colours per state in a stylesheet. The
 * stroke is not scaled with the box because a hairline that thickened
 * on the pressed one would read as a second, louder glyph.
 */
function Glyph({ light }: { light: Lighting }) {
  const { outline, fill, rays } = LIGHTING_GLYPHS[light]
  const turn = `${LIGHTING_CENTRE} ${LIGHTING_CENTRE}`

  return (
    <svg
      className={styles.glyph}
      viewBox={`0 0 ${LIGHTING_BOX} ${LIGHTING_BOX}`}
      // Drawn, not read: the button beside it carries the name.
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={outline} />
      {/* The half that says "whatever the room is". */}
      {fill && <path d={fill} fill="currentColor" stroke="none" />}
      {rays.map(deg => (
        <path key={deg} d={LIGHTING_RAY} transform={`rotate(${deg} ${turn})`} />
      ))}
    </svg>
  )
}

/** The stored theme, read as one of the three the control offers. */
function chosen(): Lighting {
  return stored(storedTheme())
}

/** `null` in storage is the default, which is a choice here. */
const stored = (theme: Theme | null): Lighting => theme ?? 'system'

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
