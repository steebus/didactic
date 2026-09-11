'use client'

import { RootsSpecimen, ROOT_STAGES } from './RootsSpecimen'
import styles from './RootsGauge.module.css'

/**
 * "How deep are your roots here?" — the first thing asked of a new
 * subject, and the only place the user states a level in their own
 * words rather than the app inferring one.
 *
 * The slider is this file; the plant beside it is `RootsSpecimen`,
 * which the reading sheet also prints. Three carriers, as the rest of
 * the app requires: the notch number, the stage name in words, and the
 * drawing. Colour carries nothing on its own.
 */
export function RootsGauge({
  value,
  onChange,
  id = 'roots',
}: {
  value: number
  onChange: (next: number) => void
  id?: string
}) {
  const level = Math.min(5, Math.max(0, Math.round(value)))
  const stage = ROOT_STAGES[level]

  return (
    <div className={styles.gauge} style={{ '--fraction': level / 5 } as React.CSSProperties}>
      <div className={styles.control}>
        <label className={styles.label} htmlFor={id}>
          How deep are your roots here?
        </label>
        <p className={styles.hint}>
          Nought is bare ground and no prior knowledge; five is mastery. Your
          own reading only — it sets the first figure and real evidence
          overwrites it.
        </p>

        <input
          id={id}
          className={styles.slider}
          type="range"
          min={0}
          max={5}
          step={1}
          value={level}
          onChange={e => onChange(Number(e.target.value))}
          aria-valuetext={`${level} of 5, ${stage.label}`}
        />

        {/* Redundant with the slider, and hidden from assistive tech for
            that reason: it is there so the notches can be hit directly
            with a thumb rather than dragged to. */}
        <ol className={styles.notches} aria-hidden="true">
          {ROOT_STAGES.map((s, i) => (
            <li key={s.label}>
              <button
                type="button"
                tabIndex={-1}
                className={`${styles.notch} ${i === level ? styles.notchOn : ''}`}
                onClick={() => onChange(i)}
              >
                {i}
              </button>
            </li>
          ))}
        </ol>

        <p className={styles.reading}>
          <span className={styles.readingName}>{stage.label}</span>
          <span className={styles.readingNote}>{stage.note}</span>
        </p>
      </div>

      <div className={styles.plate}>
        <RootsSpecimen level={level} caption={`Fig. ${level} · ${stage.label}`} />
      </div>
    </div>
  )
}

export { ROOT_STAGES }
