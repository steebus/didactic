'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { didactic, type PriorResource } from '@didactic/api'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { Setting } from '@/components/Setting'

const api = didactic()

interface RefresherState {
  content?: string
  resources: PriorResource[]
  error?: string
}

export default function RefresherPage({
  params,
}: {
  params: Promise<{ topicId: string }>
}) {
  const { topicId } = use(params)
  const [topic, setTopic] = useState<{ title: string; ability: number; freshness: number } | null>(null)
  const [state, setState] = useState<RefresherState | null>(null)

  useEffect(() => {
    void api.topics.get(topicId).then(({ ok, body }) => {
      if (ok && body.topic) setTopic(body.topic)
    })

    // A 502 or 503 still carries the reader's own material, so the
    // failure branch keeps `resources` rather than emptying the sheet.
    void api.refresher.write(topicId).then(({ ok, body, error }) => {
      setState(ok ? body : { error: error ?? undefined, resources: body.resources ?? [] })
    })
  }, [topicId])

  const viability = topic ? Math.max(0, Math.round(((topic.ability - 1) / 4) * 100)) : null

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav />
        <div className={styles.headRow}>
          <h1 className={styles.eyebrowless}>{topic?.title ?? 'Tending'}</h1>
          <Link href="/" className={styles.back}>
            Back to the stock list
          </Link>
        </div>
        {viability !== null && (
          <div className={styles.figures}>
            <span className={styles.figure}>
              <span className={styles.figureLabel}>Viability</span>
              <span className={styles.figureValue}>{viability}</span>
            </span>
            <span className={styles.figure}>
              <span className={styles.figureLabel}>Condition</span>
              <span className={styles.figureValue}>
                {Math.round((topic?.freshness ?? 0) * 100)}
              </span>
            </span>
          </div>
        )}
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <section>
          {!state ? (
            <Setting label="Bringing it back into season" shape="prose" />
          ) : state.error ? (
            <div className={styles.problem}>
              <h2 className={styles.problemTitle}>No refresher this time</h2>
              <p className={styles.problemNote}>
                {state.error.includes('ANTHROPIC_API_KEY')
                  ? 'Set ANTHROPIC_API_KEY and this page will write you one. Your own material is still below.'
                  : state.error}
              </p>
            </div>
          ) : (
            <p className={styles.prose}>{state.content}</p>
          )}
        </section>

        <section>
          <div className={styles.priorHead}>
            <h2 className={styles.priorTitle}>What you read before</h2>
          </div>
          {!state || state.resources.length === 0 ? (
            <p className={styles.empty}>
              Nothing of your own on this subject yet.
            </p>
          ) : (
            <ul className={styles.priorList}>
              {state.resources.map((r, i) => (
                <li key={i} className={styles.priorRow} style={{ '--i': i } as React.CSSProperties}>
                  <div>
                    {r.url ? (
                      <a className={styles.priorName} href={r.url} target="_blank" rel="noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      <span className={styles.priorName}>{r.title}</span>
                    )}
                    {r.summary && <p className={styles.priorSummary}>{r.summary}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
