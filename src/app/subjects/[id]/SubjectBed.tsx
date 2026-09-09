'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { viabilityFigure } from '@/lib/scoring'
import { StockBar, stockState, STOCK_LABEL, STOCK_ORDER } from '@/components/StockBar'
import type { SubjectTopicRow, TopicTreeNode } from '@/lib/subject'
import styles from './page.module.css'

/**
 * The bed as a fixed outline: every topic in the subject, nested under
 * whatever it specialises or follows, with the material and routes
 * filed against each one.
 *
 * Fixed is the point. The graph is the other reading of this data, and
 * there position is emergent — good for seeing shape, useless for
 * finding the same topic twice. Here a topic is in the same place every
 * time, which is what makes adding and removing them a sensible thing
 * to do on this sheet rather than on the canvas.
 */
export function SubjectBed({
  subjectId,
  tree,
  colour,
}: {
  subjectId: string
  tree: TopicTreeNode[]
  colour: string
}) {
  const [sort, setSort] = useState<'outline' | 'condition'>('outline')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function add() {
    const name = title.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch(`/api/subjects/${subjectId}/topics`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: name }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not add that.')

      // The resolver decides what actually happened, and saying so is
      // the difference between a map the user trusts and one that
      // quietly merges things behind them.
      setNote(
        body.action === 'linked'
          ? `"${name}" already existed elsewhere on the map, so it has been filed here too — with its history.`
          : body.action === 'already-filed'
            ? `"${name}" is already in this subject.`
            : body.action === 'pending'
              ? `"${name}" looks close to something you already have, so it is waiting for you to say whether they are the same thing.`
              : `"${name}" sown.`
      )
      setTitle('')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(topic: SubjectTopicRow) {
    setError(null)
    setNote(null)
    try {
      const res = await fetch(`/api/subjects/${subjectId}/topics`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topicId: topic.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not remove that.')

      setNote(
        body.loose
          ? `"${topic.title}" is out of this subject. It keeps everything filed against it and is now loose stock.`
          : `"${topic.title}" is out of this subject. It is still filed under the others it sits in.`
      )
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  const count = countTopics(tree)

  return (
    <section>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Topics</h2>
        <span className={styles.sectionNote}>
          {count === 0 ? (
            'Nothing sown'
          ) : (
            <>
              {count} {count === 1 ? 'topic' : 'topics'}
              {' · '}
              {/* Two readings of one bed. The outline is the fixed one --
                  same topic in the same place every time, nested under
                  what it follows. Condition throws the nesting away on
                  purpose: what needs tending is a flat question, and a
                  parent is not more urgent than its child. */}
              <button
                type="button"
                className={styles.sortButton}
                aria-pressed={sort === 'outline'}
                onClick={() => setSort('outline')}
              >
                outline
              </button>
              {' · '}
              <button
                type="button"
                className={styles.sortButton}
                aria-pressed={sort === 'condition'}
                onClick={() => setSort('condition')}
              >
                condition
              </button>
            </>
          )}
        </span>
      </div>

      {tree.length === 0 ? (
        <p className={styles.empty}>
          Nothing filed under this subject yet. Name a topic below and it will
          be sown here — or sent to you to adjudicate if the map already holds
          something very like it.
        </p>
      ) : (
        <ul className={styles.tree}>
          {(sort === 'outline' ? tree : byCondition(tree)).map(node => (
            <TreeRow
              key={node.topic.id}
              node={node}
              depth={0}
              colour={colour}
              onRemove={remove}
            />
          ))}
        </ul>
      )}

      <div className={styles.sow}>
        <label className={styles.sowLabel} htmlFor="new-topic">
          Add a topic
        </label>
        <div className={styles.sowRow}>
          <input
            id="new-topic"
            className={styles.sowInput}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && add()}
            placeholder="Row level security"
          />
          <button
            type="button"
            className={styles.sowSubmit}
            onClick={add}
            disabled={!title.trim() || busy}
          >
            {busy ? 'Sowing…' : 'Sow it'}
          </button>
        </div>
        <p className={styles.sowHint}>
          A name close to something already on the map files that topic here
          rather than growing a second copy of it.
        </p>
        {note && <p className={styles.sowNote}>{note}</p>}
        {error && <p className={styles.sowProblem}>{error}</p>}
      </div>
    </section>
  )
}

function countTopics(nodes: TopicTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countTopics(n.children), 0)
}

/**
 * The bed flattened and ordered by what needs tending first.
 *
 * Nesting cannot survive this: a topic's parent has no claim to being
 * more urgent than the topic itself, so keeping the outline would
 * scatter the ordering it is meant to show. Worst condition first, and
 * within one condition the weakest figure, because a topic you barely
 * hold is worth more of your attention than one you nearly do.
 */
function byCondition(tree: TopicTreeNode[]): TopicTreeNode[] {
  const flat: TopicTreeNode[] = []
  const walk = (nodes: TopicTreeNode[]) => {
    for (const n of nodes) {
      flat.push({ ...n, children: [] })
      walk(n.children)
    }
  }
  walk(tree)

  const rank = (n: TopicTreeNode) =>
    STOCK_ORDER.indexOf(stockState(n.topic.freshness, n.topic.last_exposure_at))

  return flat.sort((a, b) => {
    const condition = rank(a) - rank(b)
    if (condition !== 0) return condition
    const ability = a.topic.ability - b.topic.ability
    if (ability !== 0) return ability
    return a.topic.title.localeCompare(b.topic.title)
  })
}

function TreeRow({
  node,
  depth,
  colour,
  onRemove,
}: {
  node: TopicTreeNode
  depth: number
  colour: string
  onRemove: (topic: SubjectTopicRow) => void
}) {
  const { topic } = node
  const state = stockState(topic.freshness, topic.last_exposure_at)
  const vague = topic.ability_confidence < 0.4
  const unread = topic.resources.filter(r => r.status === 'queued').length
  const hasDetail = topic.resources.length > 0 || topic.curricula.length > 0

  return (
    <li className={styles.branch} style={{ '--depth': depth } as React.CSSProperties}>
      <div className={styles.topicRow}>
        <div className={styles.topicBody}>
          <Link href={`/topics/${topic.id}`} className={styles.topicName}>
            {topic.title}
          </Link>
          {/* The decision itself is made in the inbox, which the label
              never said -- it read as a status, so there was nowhere to
              go and nothing to press. It is the way there now. */}
          {topic.state === 'pending' && (
            <Link href="/inbox" className={styles.pending}>
              awaiting your decision
            </Link>
          )}
          <p className={styles.topicMeta}>
            {topic.resources.length}{' '}
            {topic.resources.length === 1 ? 'resource' : 'resources'}
            {unread > 0 && ` · ${unread} unread`}
            {topic.curricula.length > 0 &&
              ` · ${topic.curricula.length} ${
                topic.curricula.length === 1 ? 'curriculum' : 'curricula'
              }`}
            {topic.alsoIn.length > 0 &&
              ` · also in ${topic.alsoIn.map(s => s.title).join(', ')}`}
          </p>
        </div>

        <div className={styles.topicFigures}>
          <span className={`${styles.topicFigure} ${vague ? styles.vague : ''}`}>
            {vague && <span className={styles.about}>about </span>}
            {viabilityFigure(topic.ability)}
          </span>
          <StockBar
            freshness={topic.freshness}
            lastExposureAt={topic.last_exposure_at}
            colour={colour}
            width={72}
            height={8}
          />
          <span className={styles.topicState}>{STOCK_LABEL[state]}</span>
        </div>

        <button
          type="button"
          className={styles.remove}
          onClick={() => onRemove(topic)}
          aria-label={`Remove ${topic.title} from this subject`}
        >
          Remove
        </button>
      </div>

      {hasDetail && (
        <details className={styles.filed}>
          <summary className={styles.filedSummary}>What is filed here</summary>

          {topic.curricula.length > 0 && (
            <ul className={styles.filedList}>
              {topic.curricula.map(curriculum => (
                <li key={curriculum.id} className={styles.filedRow}>
                  <Link href={`/curriculum/${curriculum.id}`} className={styles.filedName}>
                    {curriculum.title}
                  </Link>
                  <span className={styles.leaders} aria-hidden="true" />
                  <span className={styles.filedMeta}>
                    {curriculum.complete}/{curriculum.total} worked
                    {curriculum.status !== 'active' && ` · ${curriculum.status}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {topic.curricula.some(c => c.lessons.length > 0) && (
            <ul className={styles.lessonList}>
              {topic.curricula
                .flatMap(c => c.lessons)
                .slice(0, 8)
                .map(lesson => (
                  <li key={lesson.id} className={styles.lessonRow}>
                    <Link href={`/lesson/${lesson.id}`} className={styles.lessonName}>
                      {lesson.title}
                    </Link>
                    <span className={styles.lessonState}>
                      {lesson.completed ? 'worked' : 'open'}
                    </span>
                  </li>
                ))}
            </ul>
          )}

          {topic.resources.length > 0 && (
            <ul className={styles.filedList}>
              {topic.resources.map(resource => (
                <li key={resource.id} className={styles.filedRow}>
                  <span className={styles.filedName}>
                    {resource.url ? (
                      <a href={resource.url} target="_blank" rel="noreferrer">
                        {resource.title}
                      </a>
                    ) : (
                      resource.title
                    )}
                  </span>
                  <span className={styles.leaders} aria-hidden="true" />
                  <span className={styles.filedMeta}>
                    {resource.kind} · {resource.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {node.children.length > 0 && (
        <ul className={styles.children}>
          {node.children.map(child => (
            <TreeRow
              key={child.topic.id}
              node={child}
              depth={depth + 1}
              colour={colour}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
