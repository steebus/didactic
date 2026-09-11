'use client'

import styles from './blocks.module.css'

export interface StepsData {
  title?: string
  steps?: Array<{ label?: string; detail?: string }>
}

/**
 * A fixed order, drawn as one. Prose can say "first, then, finally" but
 * it cannot show that the sequence is the point, and a numbered list
 * does not distinguish a sequence in time from a list of four things.
 */
export function Steps({ data }: { data: StepsData }) {
  const steps = (data.steps ?? []).filter(s => s.label)
  if (steps.length === 0) return null

  return (
    <figure className={styles.figure}>
      {data.title && <figcaption className={styles.figureTitle}>{data.title}</figcaption>}
      <ol className={styles.steps}>
        {steps.map((step, i) => (
          <li key={i} className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.stepBody}>
              <span className={styles.stepLabel}>{step.label}</span>
              {step.detail && <span className={styles.stepDetail}>{step.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}
