import styles from './BannerFigures.module.css'

/**
 * The key figures of a sheet, set at the right of its banner.
 *
 * One rule for every main banner: running head, then the title at the
 * left of a row and these at the right, ending on the same lines. On a
 * phone they drop under the title as one run, joined by dots.
 */
export function BannerFigures({
  lines,
  under,
}: {
  lines: React.ReactNode[]
  /** Set under the title, at the left, rather than at the right. */
  under?: boolean
}) {
  return (
    <p className={`${styles.figures} ${under ? styles.under : ''}`}>
      {lines.map((line, i) => (
        <span key={i} className={styles.line}>
          {line}
        </span>
      ))}
    </p>
  )
}
