'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'

const QUESTIONS = [
  {
    q: 'Have you used this before, and if so for what?',
    hint: 'Anything counts — a project, a job, an afternoon that went nowhere.',
  },
  {
    q: 'What parts of it do you already feel solid on?',
    hint: 'Be honest rather than modest; the map is only useful if it is true.',
  },
  {
    q: 'What have you bounced off or avoided?',
    hint: 'The gaps are the point.',
  },
]

// The single-user development identity. Real auth replaces this.
const USER_ID = '11111111-1111-1111-1111-111111111111'

export default function NewSubjectPage() {
  const [subject, setSubject] = useState('')
  const [answers, setAnswers] = useState(['', '', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject,
          userId: USER_ID,
          answers: QUESTIONS.map((q, i) => ({ q: q.q, a: answers[i] })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not draw the map.')
      router.push(`/graph?subject=${body.subjectId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="sow" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Sow a subject</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <p className={styles.lead}>
          Name what you want to learn. A few questions about where you stand,
          and the app lays out a bed for it — topics, connections, and an
          honest first guess at what you already know.
        </p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="subject">
            The subject
          </label>
          <input
            id="subject"
            className={styles.input}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="React, or Milton Friedman, or medium format"
            autoFocus
          />
        </div>

        {subject.trim() && (
          <div className={styles.questions}>
            {QUESTIONS.map((question, i) => (
              <div key={question.q} className={styles.field} style={{ '--i': i } as React.CSSProperties}>
                <label className={styles.label} htmlFor={`q${i}`}>
                  {question.q}
                </label>
                <p className={styles.hint}>{question.hint}</p>
                <textarea
                  id={`q${i}`}
                  className={styles.textarea}
                  value={answers[i]}
                  onChange={e =>
                    setAnswers(a => a.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className={styles.problem}>
            <h2 className={styles.problemTitle}>Could not sow it</h2>
            <p className={styles.problemNote}>{error}</p>
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.submit}
            onClick={submit}
            disabled={!subject.trim() || busy}
          >
            {busy ? 'Laying out the bed…' : 'Lay out the bed'}
          </button>
          <p className={styles.note}>
            Your answers set a first figure only. Real reading and real work
            overwrite it.
          </p>
        </div>
      </div>
    </main>
  )
}
