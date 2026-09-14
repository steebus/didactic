'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic, type PendingAction } from '@didactic/api'
import type { PendingTopic, TopicEvidence } from '@didactic/core/shapes'
import {
  arrived,
  closeness,
  counsel,
  filedUnder,
  holdings,
  overlap,
} from '@didactic/core/adjudication'
import styles from '@/app/inbox/page.module.css'

const api = didactic()

/**
 * Adjudication. The resolver defers here when a concept sits between
 * "clearly the same" and "clearly new". A wrong merge destroys history
 * irrecoverably; a wrong split costs one click. So the app asks.
 *
 * It used to ask over two titles and, where one happened to exist, one
 * description -- which is not enough to answer with, and the reader was
 * being asked to adjudicate a field they are here precisely because
 * they do not know. Both topics are now set out side by side with what
 * each is actually holding: the beds it sits in, what it was drawn
 * from, and whether anyone has ever read it. The asymmetry is usually
 * the answer. A bare name that arrived with this morning's reading,
 * against a topic with a route worked and nine passages marked on it,
 * is a duplicate; two topics that have both been read are two pursuits,
 * and folding them destroys one of the two records.
 */
export function PendingQueue({ topics }: { topics: PendingTopic[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Calls this reader has already made.
   *
   * A merge rewrites every filing, exposure and edge the two topics
   * hold and then recomputes the figure, which is the slowest write in
   * the app and the least interesting to wait for -- the decision was
   * made when the button was pressed. The row goes at once and the
   * work happens behind it; a failure puts the row back, because a
   * queue that quietly loses a decision is worse than a slow one.
   */
  const [decided, setDecided] = useState<string[]>([])
  const [, startTransition] = useTransition()
  const router = useRouter()

  function adjudicate(topicId: string, action: PendingAction, mergeInto?: string) {
    setBusy(topicId)
    setError(null)
    setDecided(gone => [...gone, topicId])

    void (async () => {
      const { ok, error: failed } = await api.topics.decide(topicId, action, mergeInto)
      if (ok) {
        startTransition(() => router.refresh())
      } else {
        setDecided(gone => gone.filter(id => id !== topicId))
        setError(failed ?? 'Could not save that. Try again.')
      }
      setBusy(null)
    })()
  }

  // The queue as the reader has left it. Ids that the sheet has since
  // dropped are keys nothing reads, so nothing prunes them.
  const waiting = topics.filter(t => !decided.includes(t.id))

  if (waiting.length === 0) return null

  return (
    <section className={styles.decisions}>
      <div className={styles.decisionsHead}>
        <h2 className={styles.decisionsTitle}>
          {waiting.length === 1
            ? 'One topic needs your call'
            : `${waiting.length} topics need your call`}
        </h2>
        {/* Twenty-five decisions is a sitting, not a glance. Saying how
            many have been made turns it into something with an end. */}
        {decided.length > 0 && (
          <span className={styles.decisionsTally}>
            {decided.length} decided
          </span>
        )}
      </div>
      <p className={styles.decisionsNote}>
        These came in close enough to something you already have that the app
        would rather ask than guess. It compares wording, not meaning, so two
        topics that merely sound alike land here. What each one is holding is
        set out below — keeping them separate is safe and costs one click to
        undo later; merging cannot be undone.
      </p>

      {error && <p className={styles.decisionsProblem}>{error}</p>}

      <ul className={styles.pendingList}>
        {waiting.map(topic => (
          <li key={topic.id} className={styles.pendingRow}>
            <div className={styles.pendingCompare}>
              <Specimen
                label={`Newly read${topic.created_at ? ` · ${arrived(topic.created_at)}` : ''}`}
                title={topic.title}
                summary={topic.summary}
                evidence={topic.evidence}
              />

              {topic.nearest ? (
                <Specimen
                  label={`Already on the map · ${closeness(topic.nearest.similarity)}`}
                  title={topic.nearest.title}
                  href={`/topics/${topic.nearest.id}`}
                  summary={topic.nearest.summary}
                  evidence={topic.nearest.evidence}
                  standing
                />
              ) : (
                <div className={styles.specimen} data-side="none">
                  <span className={styles.specimenLabel}>Nothing close to it</span>
                  <p className={styles.specimenAsk}>
                    There is nothing on the map near enough to merge into, so
                    this is a keep or a discard.
                  </p>
                </div>
              )}
            </div>

            {topic.nearest && (
              <>
                {/* What these two in particular suggest, rather than the
                    same sentence printed under all twenty-five rows. */}
                <p className={styles.counsel}>
                  {counsel(
                    topic.evidence,
                    topic.nearest.evidence,
                    Boolean(topic.summary && topic.nearest.summary)
                  )}
                </p>
                {/* Sitting in the same bed is the strongest argument for
                    one thing; sitting in different beds is an argument
                    against, and both are worth a line. */}
                <p className={styles.overlap}>
                  {overlap(topic.evidence, topic.nearest.evidence)}
                </p>
              </>
            )}

            <div className={styles.actions}>
              <button
                className={styles.button}
                disabled={busy === topic.id}
                onClick={() => adjudicate(topic.id, 'confirm')}
              >
                Keep separate
              </button>
              {topic.nearest && (
                <button
                  className={`${styles.button} ${styles.buttonQuiet}`}
                  disabled={busy === topic.id}
                  onClick={() => adjudicate(topic.id, 'merge', topic.nearest!.id)}
                >
                  Same as {topic.nearest.title}
                </button>
              )}
              <button
                className={`${styles.button} ${styles.buttonQuiet}`}
                disabled={busy === topic.id}
                onClick={() => adjudicate(topic.id, 'discard')}
              >
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One side of the comparison, printed as a catalogue entry: what it is
 * called, what it covers, where it is filed, and what it holds.
 *
 * A missing description says so rather than leaving a gap. The gap was
 * the whole problem -- an absent line is indistinguishable from a line
 * that has not loaded, and it is the single most useful thing the sheet
 * could have told the reader about that topic.
 */
function Specimen({
  label,
  title,
  href,
  summary,
  evidence,
  standing,
}: {
  label: string
  title: string
  href?: string
  summary: string | null
  evidence: TopicEvidence
  /** The one already on the map, which is drawn as the established
   *  side so the two are never mistaken for each other. */
  standing?: boolean
}) {
  return (
    <div className={styles.specimen} data-side={standing ? 'standing' : 'new'}>
      <span className={styles.specimenLabel}>{label}</span>
      <h3 className={styles.specimenName}>
        {href ? (
          <Link href={href} className={styles.specimenLink}>
            {title}
          </Link>
        ) : (
          title
        )}
      </h3>

      {summary ? (
        <p className={styles.specimenGloss}>{summary}</p>
      ) : (
        <p className={styles.specimenMissing}>
          No description — there is only the name to go on.
        </p>
      )}

      <p className={styles.specimenFiled}>{filedUnder(evidence)}</p>
      <p className={styles.specimenHolds}>{holdings(evidence)}</p>

      {evidence.sources.length > 0 && (
        <ul className={styles.specimenSources}>
          {evidence.sources.map(source => (
            <li key={source} className={styles.specimenSource}>
              {source}
            </li>
          ))}
          {evidence.resources > evidence.sources.length && (
            <li className={styles.specimenSource}>
              and {evidence.resources - evidence.sources.length} more
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
