'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/app/inbox/page.module.css'

// The single-user development identity. Real auth replaces this.
const USER_ID = '11111111-1111-1111-1111-111111111111'

type Kind = 'article' | 'book' | 'note'

const KINDS: Array<{ value: Kind; label: string; hint: string }> = [
  { value: 'article', label: 'A link', hint: 'Paste the URL. It will read the page and file it.' },
  { value: 'book', label: 'A book', hint: 'Title and author. Books are recorded, not read by the app.' },
  { value: 'note', label: 'A note', hint: 'Something you did or read that has no link.' },
]

/**
 * The way material gets into the map. Captured on a phone mid-reading
 * more often than at a desk, so the common case — paste a link, done —
 * is one field and one press.
 */
export function AddResource({
  topicId,
  topicTitle,
  compact,
}: {
  /** When present, the resource is linked to this topic on arrival. */
  topicId?: string
  topicTitle?: string
  /** On a topic sheet the capture is a footnote to the material list,
   *  not the reason the page exists. */
  compact?: boolean
} = {}) {
  const [kind, setKind] = useState<Kind>('article')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const ready =
    (kind === 'article' && url.trim()) ||
    (kind === 'book' && title.trim()) ||
    (kind === 'note' && text.trim())

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: USER_ID,
          topicId,
          kind,
          url: kind === 'article' ? url.trim() : null,
          title: title.trim() || null,
          text: kind === 'note' ? text.trim() : null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 202) {
        throw new Error(body.error ?? 'Could not save that.')
      }

      // 202 means it saved but the queue refused it: worth saying, since
      // nothing will read it until that is fixed.
      setSaved(
        body.warning
          ? 'Saved, but not queued for reading yet.'
          : topicTitle
            ? `Filed under ${topicTitle}.`
            : 'Filed. It will find its place shortly.'
      )
      setUrl('')
      setTitle('')
      setText('')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${styles.capture} ${compact ? styles.captureCompact : ''}`}>
      <div className={styles.captureHead}>
        <h2 className={styles.captureTitle}>
          {topicTitle ? `Add to ${topicTitle}` : 'Send it something'}
        </h2>
        <div className={styles.kinds}>
          {KINDS.map(k => (
            <button
              key={k.value}
              className={`${styles.kindButton} ${kind === k.value ? styles.kindOn : ''}`}
              onClick={() => { setKind(k.value); setSaved(null); setError(null) }}
              aria-pressed={kind === k.value}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.captureHint}>{KINDS.find(k => k.value === kind)!.hint}</p>

      <div className={styles.captureFields}>
        {kind === 'article' && (
          <input
            className={styles.captureInput}
            type="url"
            inputMode="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ready && !busy && add()}
            placeholder="https://…"
            aria-label="Link to file"
          />
        )}

        {kind === 'book' && (
          <input
            className={styles.captureInput}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ready && !busy && add()}
            placeholder="Capitalism and Freedom — Milton Friedman"
            aria-label="Book title and author"
          />
        )}

        {kind === 'note' && (
          <>
            <input
              className={styles.captureInput}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What is this about?"
              aria-label="Note title"
            />
            <textarea
              className={styles.captureArea}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Spent the afternoon setting up row level security…"
              aria-label="Note"
            />
          </>
        )}

        <button
          className={styles.captureSubmit}
          onClick={add}
          disabled={!ready || busy}
        >
          {busy ? 'Filing…' : 'File it'}
        </button>
      </div>

      {saved && <p className={styles.captureSaved}>{saved}</p>}
      {error && <p className={styles.captureProblem}>{error}</p>}
    </section>
  )
}
