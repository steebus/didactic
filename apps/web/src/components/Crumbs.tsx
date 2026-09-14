import Link from 'next/link'
import styles from './Crumbs.module.css'

/** One step of the trail. The last one is where you are, and is not a
 *  link — a link to the sheet you are reading is a link to nowhere. */
export interface Crumb {
  href: string
  label: string
}

/**
 * The trail above a title: where this sheet sits, and the way back up.
 *
 * Subject › Topic › (here). Printed the same way on every sheet that
 * has ancestors, because a reader who learns to read it on a topic
 * should not have to learn it again on a lesson.
 *
 * The separator is drawn by the stylesheet rather than written between
 * the links, so it is never selected with the text, never read out as
 * a word, and never wraps onto a line of its own.
 */
export function Crumbs({
  trail,
  className,
}: {
  trail: Crumb[]
  /** The sheet's own eyebrow class, so each band keeps its ink. */
  className?: string
}) {
  if (trail.length === 0) return null

  return (
    <nav
      className={`${styles.crumbs} ${className ?? ''}`}
      aria-label="Where this sheet sits"
    >
      {trail.map(step => (
        <span key={step.href} className={styles.step}>
          <Link href={step.href} className={styles.crumb}>
            {step.label}
          </Link>
        </span>
      ))}
    </nav>
  )
}
