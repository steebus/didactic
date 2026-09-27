'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { subjectEffortLine, TARGET_LABEL, TARGET_LEVELS, type SubjectEffort } from '@didactic/core/grain'
import styles from './BedTarget.module.css'

const api = didactic()

/**
 * How far the reader wants to take this bed, and what that comes to.
 *
 * The target is intent, not evidence: setting it moves the effort figure
 * here and on every topic that takes its target from this subject, and
 * nothing the app owns. It sits beside the account of how the bed was
 * sown because it is the numeric half of that answer -- "how far" was
 * only ever words.
 */
export function BedTarget({ subjectId, effort }: { subjectId: string; effort: SubjectEffort }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function aim(target: number | null) {
    setBusy(true)
    setProblem(null)
    const { ok, error } = await api.subjects.setTarget(subjectId, target)
    setBusy(false)
    if (!ok) {
      setProblem(error ?? 'Could not set that.')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <>
      <p className={styles.line}>{subjectEffortLine(effort)}</p>
      <div className={styles.levels} role="group" aria-label="Target depth for this subject">
        {TARGET_LEVELS.map(level => (
          <button
            key={level}
            type="button"
            className={styles.level}
            aria-pressed={effort.target === level}
            disabled={busy}
            onClick={() => aim(effort.target === level ? null : level)}
          >
            {level} · {TARGET_LABEL[level]}
          </button>
        ))}
      </div>
      {problem && <p className={styles.problem}>{problem}</p>}
    </>
  )
}
