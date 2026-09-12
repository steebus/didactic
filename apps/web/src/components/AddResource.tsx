'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { isPdf, tooLarge, MAX_DOCUMENT_BYTES, NOT_A_PDF } from '@didactic/core/documents'
import styles from '@/app/inbox/page.module.css'

const api = didactic()

type Kind = 'article' | 'book' | 'note' | 'pdf'

const KINDS: Array<{ value: Kind; label: string; hint: string }> = [
  { value: 'article', label: 'A link', hint: 'Paste the URL. It will read the page and file it.' },
  { value: 'book', label: 'A book', hint: 'Title and author. Books are recorded, not read by the app.' },
  { value: 'note', label: 'A note', hint: 'Something you did or read that has no link.' },
  { value: 'pdf', label: 'A PDF', hint: 'A handbook, a paper, a book. Under 50 MB. It is read for its structure and its passages, and can be cited in lessons.' },
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
  const fileInput = useRef<HTMLInputElement>(null)

  const ready =
    (kind === 'article' && url.trim()) ||
    (kind === 'book' && title.trim()) ||
    (kind === 'note' && text.trim())

  /**
   * File a document, the way the sowing sheet already does.
   *
   * Straight to storage rather than through a function: a book is far
   * over the four and a half megabytes a request body may carry. The
   * upload answers with what was found in it -- how many chapters, or
   * why there were none -- because that is the one thing a reader
   * wants to know about a document they have just handed over, and
   * waiting for the queue to say it means never saying it here.
   *
   * Not queued for a topic the way a link is: what comes out of a
   * document is passages, and those are cited by whatever lesson wants
   * them rather than filed under one topic on arrival.
   */
  async function upload(picked: File) {
    setSaved(null)

    // Said here rather than after the round trip. Both are facts about
    // the file the browser already has.
    if (!isPdf(picked.name, picked.type)) {
      setError(NOT_A_PDF)
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    if (picked.size > MAX_DOCUMENT_BYTES) {
      setError(tooLarge(picked.size))
      if (fileInput.current) fileInput.current.value = ''
      return
    }

    setBusy(true)
    setError(null)

    const { ok, status, body, error: failed } = await api.resources.uploadDocument(picked)

    if (!ok && status !== 202) {
      setError(failed ?? 'Could not take that file.')
    } else {
      const chapters = body.outline?.chapters ?? 0
      setSaved(
        body.outline?.problem
          ? 'Filed, but it could not be opened to be read. It is on the shelf either way.'
          : chapters > 0
            ? `Filed. ${chapters} ${chapters === 1 ? 'chapter' : 'chapters'} found in it.`
            : 'Filed. No chapters could be found in it, so it is material rather than a shape to follow.'
      )
      startTransition(() => router.refresh())
    }

    setBusy(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function add() {
    setBusy(true)
    setError(null)

    const { ok, status, body, error: failed } = await api.resources.add({
      topicId,
      kind,
      url: kind === 'article' ? url.trim() : undefined,
      title: title.trim() || undefined,
      text: kind === 'note' ? text.trim() : undefined,
    })

    // 202 means it saved but the queue refused it, which is not a
    // failure: the row exists and the warning below says what is
    // missing.
    if (!ok && status !== 202) {
      setError(failed ?? 'Could not save that.')
      setBusy(false)
      return
    }

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
    setBusy(false)
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

        {kind === 'pdf' && (
          <input
            ref={fileInput}
            className={styles.captureFile}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={e => {
              const picked = e.target.files?.[0]
              if (picked) upload(picked)
            }}
            aria-label="A PDF to file"
          />
        )}

        {/* Choosing the file is the press, so a document needs no
            button of its own -- and a disabled one beside the picker
            reads as a step still to come. */}
        {kind !== 'pdf' && (
          <button
            className={styles.captureSubmit}
            onClick={add}
            disabled={!ready || busy}
          >
            {busy ? 'Filing…' : 'File it'}
          </button>
        )}
      </div>

      {saved && <p className={styles.captureSaved}>{saved}</p>}
      {error && <p className={styles.captureProblem}>{error}</p>}
    </section>
  )
}
