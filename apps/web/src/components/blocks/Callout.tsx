'use client'

import { Rich } from '../Rich'
import styles from './blocks.module.css'

export interface CalloutData {
  label?: string
  text?: string
}

/**
 * An aside, set beside the prose rather than in it: a caveat, a trap,
 * or a short deep dive on one sentence. What a folded conversation
 * about a chosen passage is written as when it comes to a few lines.
 */
export function Callout({ data }: { data: CalloutData }) {
  const paragraphs = (data.text ?? '').split(/\n\s*\n/).filter(p => p.trim())
  if (paragraphs.length === 0) return null

  return (
    <aside className={styles.callout} data-callout="">
      <Rich as="p" className={styles.calloutLabel} text={data.label} />
      {paragraphs.map((p, i) => (
        <Rich key={i} as="p" className={styles.calloutText} text={p} />
      ))}
    </aside>
  )
}
