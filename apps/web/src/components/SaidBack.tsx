import type { Said } from '@didactic/core/shelf'
import { sectionsLine } from '@didactic/core/shelf'
import { summaryGist } from '@didactic/core/summaries'
import { SummaryIcon } from './SummaryIcon'
import styles from './SaidBack.module.css'

/**
 * What the reader has said back about a reading, wherever it is listed.
 *
 * One treatment everywhere a summary is printed beside the things kept
 * from the same reading -- under a title in the inbox, on a topic's
 * material and its lessons, above the marks -- because it is the most
 * considered thing the reader wrote about it, and it should read as a
 * step above a mark without shouting: the deeper paper a block stands
 * on, the summary's ultramarine rule, the sprig, and the reader's words
 * in full ink where the row around them is in the soft ink of a caption.
 *
 * Only the opening is printed; the whole is one press away on the
 * reading itself. Where only sections have been said back, it says how
 * many rather than printing nothing for real work.
 */
export function SaidBack({
  said,
  clip = 220,
  className,
}: {
  said: Said
  /** How much of the summary to print before it is clipped. */
  clip?: number
  className?: string
}) {
  const whole = said.whole?.trim()
  if (!whole && said.sections === 0) return null

  return (
    <span className={`${styles.said} ${className ?? ''}`}>
      <span className={styles.sprig} aria-hidden="true">
        <SummaryIcon filled size={14} />
      </span>
      <span className={styles.body}>
        <span className={styles.label}>
          {whole ? 'In your words' : 'Said back'}
          {whole && said.sections > 0 && (
            <span className={styles.sections}> · {sectionsLine(said.sections)}</span>
          )}
        </span>
        {whole ? (
          <span className={styles.text}>{summaryGist(whole, clip)}</span>
        ) : (
          <span className={styles.text}>
            {said.sections} {said.sections === 1 ? 'section' : 'sections'} so far
          </span>
        )}
      </span>
    </span>
  )
}
