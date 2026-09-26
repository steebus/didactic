'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { Sprouting, SproutView } from '@didactic/core/shapes'
import { kindLine, UNNAMED } from '@didactic/core/sprouting'
import { SproutActions } from '@/components/SproutActions'
import styles from './page.module.css'

const api = didactic()

/**
 * The sprouting subjects, strongest first.
 *
 * Arriving with anything unnamed, or with topics still waiting for the
 * vector the reading prefers, starts the naming: one request that fills
 * what it can and asks the model once. The sheet prints the reading it
 * already has while that runs, and says so, rather than holding the
 * whole page behind a model call.
 */
export function SproutingSheet({ initial }: { initial: Sprouting }) {
  const needsNaming = initial.keeps && (initial.unnamed > 0 || initial.unembedded > 0)
  const [sprouting, setSprouting] = useState(initial)
  // Naming starts as the sheet arrives, so it starts out saying so.
  const [naming, setNaming] = useState(needsNaming)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [planted, setPlanted] = useState<string[]>([])
  const [, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!needsNaming) return
    let cancelled = false
    void api.sprouts.name().then(({ ok, body, error: failed }) => {
      if (cancelled) return
      setNaming(false)
      if (ok) {
        const { warnings: said, ...fresh } = body
        setSprouting(fresh)
        setWarnings(said ?? [])
      } else {
        setError(failed ?? 'Could not name what is sprouting.')
      }
    })
    return () => {
      cancelled = true
    }
  }, [needsNaming])

  function gone(key: string) {
    setSprouting(current => ({ ...current, sprouts: current.sprouts.filter(s => s.key !== key) }))
    // Every sheet reading the map has moved: a planted sprout is a
    // subject on the stock list now.
    startTransition(() => router.refresh())
  }

  return (
    <>
      <p className={styles.standing}>
        Topics your material keeps putting together, read off the map with
        your subjects taken out, that no subject you have already accounts
        for. What holds each one together is counted under it. Nothing is
        filed until you give one a bed.
      </p>

      {sprouting.found && <p className={styles.found}>{sprouting.found}</p>}

      {!sprouting.keeps && (
        <p className={styles.note}>
          The reading works, but nothing can be kept yet: the database has
          not been given somewhere to keep names and decisions. That
          arrives with the next migration.
        </p>
      )}

      {naming && (
        <p className={styles.note}>
          Naming what has come up
          {sprouting.unembedded > 0 && `, and reading ${sprouting.unembedded} ${sprouting.unembedded === 1 ? 'topic' : 'topics'} by what is written under ${sprouting.unembedded === 1 ? 'it' : 'them'}`}
          …
        </p>
      )}
      {error && <p className={styles.problem} role="alert">{error}</p>}
      {warnings.map(w => <p key={w} className={styles.problem}>{w}</p>)}
      {planted.map(note => <p key={note} className={styles.note}>{note}</p>)}

      {sprouting.sprouts.length === 0 ? (
        <p className={styles.empty}>
          Nothing is sprouting. As material arrives, any topics it keeps
          putting together outside the subjects you have will come up here.
        </p>
      ) : (
        <ol className={styles.list}>
          {sprouting.sprouts.map(sprout => (
            <Entry
              key={sprout.key}
              sprout={sprout}
              onPlanted={note => {
                setPlanted(current => [...current, note])
                gone(sprout.key)
              }}
              onDismissed={() => gone(sprout.key)}
            />
          ))}
        </ol>
      )}

      {sprouting.setAside > 0 && (
        <p className={styles.aside}>
          {sprouting.setAside} set aside, by you or because the reading
          found nothing to name. They come back if they grow past
          recognition.
        </p>
      )}
    </>
  )
}

function Entry({
  sprout,
  onPlanted,
  onDismissed,
}: {
  sprout: SproutView
  onPlanted: (note: string) => void
  onDismissed: () => void
}) {
  return (
    <li className={styles.entry}>
      <p className={styles.kind}>
        {sprout.from.length > 0 && (
          <span className={styles.chips} aria-hidden="true">
            {sprout.from.map(f => (
              <span key={f.subjectId} className={styles.chip} style={{ '--chip': f.colour } as React.CSSProperties} />
            ))}
          </span>
        )}
        {kindLine(sprout)}
      </p>

      <h2 className={`${styles.name} ${sprout.title ? '' : styles.unnamed}`}>
        {sprout.title ?? UNNAMED}
      </h2>

      {sprout.why && <p className={styles.why}>{sprout.why}</p>}
      {sprout.stale && (
        <p className={styles.stale}>
          It has grown since it was named; it will be named again.
        </p>
      )}
      <p className={styles.evidence}>{sprout.evidence}</p>

      <ul className={styles.topics}>
        {sprout.topics.map(t => (
          <li key={t.id} className={t.core ? styles.core : undefined}>
            <Link href={`/topics/${t.id}`}>{t.title}</Link>
            {t.loose && <span className={styles.loose}>loose</span>}
          </li>
        ))}
      </ul>

      {sprout.material.length > 0 && (
        <ul className={styles.material}>
          {sprout.material.map(m => (
            <li key={m.id}>
              <Link href={`/resources/${m.id}`}>{m.title}</Link>
              <span className={styles.read}>{m.read ? 'read' : 'unread'}</span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        <SproutActions
          sprout={sprout}
          onPlanted={p => onPlanted(p.note)}
          onDismissed={onDismissed}
        />
        <Link href="/graph?sprouting=1" className={styles.onTheBed}>
          See it on the bed
        </Link>
      </div>
    </li>
  )
}
