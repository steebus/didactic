'use client'

import styles from './Setting.module.css'

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
      <p className={styles.label}>
        {label}
        <span className={styles.ellipsis} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </p>

      <div className={styles.galley} aria-hidden="true">
        {shape === 'prose' && (
          <>
            <span className={styles.head} />
            <span className={styles.line} style={{ '--w': '96%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '99%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '91%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '62%' } as React.CSSProperties} />
            <span className={styles.head} style={{ '--w': '42%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '97%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '88%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '71%' } as React.CSSProperties} />
          </>
        )}

        {shape === 'rows' &&
          [92, 78, 86, 69, 83, 74].map((w, i) => (
            <span className={styles.row} key={i}>
              <span className={styles.rowNumber}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.line} style={{ '--w': `${w}%` } as React.CSSProperties} />
            </span>
          ))}

        {shape === 'panel' && (
          <>
            <span className={styles.head} style={{ '--w': '54%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '94%' } as React.CSSProperties} />
            <span className={styles.line} style={{ '--w': '77%' } as React.CSSProperties} />
          </>
        )}
      </div>
    </div>
  )
}
