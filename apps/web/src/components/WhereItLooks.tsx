'use client'

import Link from 'next/link'
import { claimSentence } from '@didactic/core/filing'
import type { LooseClaim } from '@didactic/core/shapes'
import styles from './WhereItLooks.module.css'

/**
 * What the bed says about where a loose topic goes.
 *
 * A topic's subjects are settled when it is made, and its edges are
 * drawn in a pass after that, so the evidence that would place it does
 * not exist at the only moment anything looks. A topic can end up with
 * five edges into one subject and no membership in it — which the bed
 * draws plainly, as a pale node hanging off a coloured hull, and which
 * no sheet could say a word about.
 *
 * Three surfaces ask the same question and each had a different amount
 * of the answer: loose stock lists the topic, the topic's own filing
 * block says it sits on no bed, and the graph panel is where the
 * unfiled node is actually being looked at. So the claim is one
 * component rather than three sets of markup that would drift, with the
 * sentence itself in `core/filing` because the phone prints it too.
 *
 * It states the counts and not a verdict. "2 of its 3" is the whole of
 * the reasoning, and the only thing that lets a reader disagree; a bar
 * the app was sure about has already filed the topic without asking.
 * The press is `onFile`, because what filing means differs per host —
 * a row going on the press here, a refresh there.
 */
export function WhereItLooks({
  claims,
  onFile,
  busy = false,
  tone = 'aside',
}: {
  claims: LooseClaim[]
  onFile: (claim: LooseClaim) => void
  busy?: boolean
  /** `aside` is a note in the margin of a row; `block` stands on its own
   *  inside a margin block that has already raised the subject. */
  tone?: 'aside' | 'block'
}) {
  if (claims.length === 0) return null

  return (
    <ul className={`${styles.claims} ${tone === 'block' ? styles.block : styles.aside}`}>
      {claims.map(claim => (
        <li key={claim.subjectId} className={styles.claim}>
          <span className={styles.says}>
            {claimSentence(claim, claim.ofFiled)}{' '}
            <Link href={`/subjects/${claim.subjectId}`} className={styles.bed}>
              {claim.subjectTitle}
            </Link>
          </span>
          <button
            type="button"
            className={styles.action}
            onClick={() => onFile(claim)}
            disabled={busy}
          >
            {busy ? 'Filing…' : 'File it there'}
          </button>
        </li>
      ))}
    </ul>
  )
}
