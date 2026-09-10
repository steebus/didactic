'use client'

import styles from './Setting.module.css'

/**
 * A slug of set type with no ink on it yet: one line of a galley.
 *
 * Exported because a sheet's own waiting state is not a generic block
 * — a loading screen that does not have the shape of the sheet it
 * stands in for is a second design of the same page, and the reader
 * sees the page change shape under them when it arrives. Each sheet
 * builds its own galley out of these, in its own layout classes.
 */
export function Slug({
  w,
  tall,
  round,
  /** On the masthead band the paper is dark, so the slug is light. */
  band,
  /** Seconds. Staggers the ink-up where the layout is not a plain run. */
  delay,
}: {
  w?: string
  tall?: boolean
  round?: boolean
  band?: boolean
  delay?: number
}) {
  return (
    <span
      className={[
        styles.slug,
        tall ? styles.slugTall : '',
        round ? styles.slugRound : '',
        band ? styles.slugBand : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          ...(w ? { '--w': w } : {}),
          ...(delay ? { '--delay': `${delay}s` } : {}),
        } as React.CSSProperties
      }
      aria-hidden="true"
    />
  )
}

/** A run of slugs, inked top to bottom. */
export function Galley({
  children,
  wide,
}: {
  children: React.ReactNode
  /** Prose sets to a measure; a list of rows takes the column. */
  wide?: boolean
}) {
  return (
    <div className={`${styles.galley} ${wide ? styles.galleyWide : ''}`} aria-hidden="true">
      {children}
    </div>
  )
}

/**
 * What a sheet shows while it is being set.
 *
 * The catalogue is a printed object, so waiting is printing: ruled
 * lines of type still being set, at the measure and rhythm the real
 * prose will take. It replaces a single italic line on an otherwise
 * empty sheet, which told the reader nothing about what was coming or
 * how much of it there would be.
 *
 * The shape is honest. A lesson resolves to headings and paragraphs, a
 * route to a numbered run of rows, so each variant sets the shape that
 * is actually on its way rather than one generic grey block.
 */
export function Setting({
  label,
  shape = 'prose',
}: {
  /** What is being set, in the sheet's own words. */
  label: string
  shape?: 'prose' | 'rows' | 'panel'
}) {
  return (
    <div className={styles.setting} role="status" aria-live="polite">
      <Working label={label} />

      <div className={styles.galley} aria-hidden="true">
        {shape === 'prose' && (
          <>
            <Slug tall />
            <Slug w="96%" />
            <Slug w="99%" />
            <Slug w="91%" />
            <Slug w="62%" />
            <Slug tall w="42%" />
            <Slug w="97%" />
            <Slug w="88%" />
            <Slug w="71%" />
          </>
        )}

        {shape === 'rows' &&
          [92, 78, 86, 69, 83, 74].map((w, i) => (
            <span className={styles.row} key={i}>
              <span className={styles.rowNumber}>{String(i + 1).padStart(2, '0')}</span>
              <Slug w={`${w}%`} />
            </span>
          ))}

        {shape === 'panel' && (
          <>
            <Slug tall w="54%" />
            <Slug w="94%" />
            <Slug w="77%" />
          </>
        )}
      </div>
    </div>
  )
}

/** The line that says what is being waited for, with the three points
 *  that come up in turn so it reads as working rather than stuck. */
export function Working({ label }: { label: string }) {
  return (
    <p className={styles.label}>
      {label}
      <span className={styles.ellipsis} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </p>
  )
}
