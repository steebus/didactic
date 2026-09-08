'use client'

import { useRef, useState } from 'react'
import styles from './page.module.css'

export interface ProofEntry {
  /** The resource row it became. Present once it has been filed. */
  resourceId: string
  title: string
  kind: string
}

type Mode = 'link' | 'book' | 'credential' | 'file'

const MODES: Array<{ value: Mode; label: string; hint: string }> = [
  {
    value: 'link',
    label: 'A link',
    hint: 'An article, a repository, a talk. It will be read and filed.',
  },
  {
    value: 'book',
    label: 'A book or course',
    hint: 'Title and author, or the course and who ran it.',
  },
  {
    value: 'credential',
    label: 'A qualification',
    hint: 'A degree, a certification, a job you did this in for two years.',
  },
  { value: 'file', label: 'A PDF', hint: 'A handbook, a paper, a certificate. Under 15 MB.' },
]

/**
 * Proof of what you already hold, filed as you name it rather than at
 * the end. Each entry becomes a real resource in the library the moment
 * it is added — it is material, not form data — and it is marked read,
 * because it is evidence of something already done.
 *
 * What it contributes to the first ability figure runs through the
 * account you give above it, not through an exposure of its own: the
 * same book must not count twice for being mentioned and filed.
 */
export function ProofOfRoots({
  entries,
  onChange,
}: {
  entries: ProofEntry[]
  onChange: (next: ProofEntry[]) => void
}) {
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const ready =
    (mode === 'link' && url.trim().length > 0) ||
    (mode === 'book' && title.trim().length > 0) ||
    (mode === 'credential' && title.trim().length > 0)

  function clear() {
    setUrl('')
    setTitle('')
    setDetail('')
  }

  async function file() {
    setBusy(true)
    setError(null)
    try {
      const payload =
        mode === 'link'
          ? { kind: 'article', url: url.trim(), title: title.trim() || url.trim() }
          : mode === 'book'
            ? { kind: 'book', title: title.trim() }
            : {
                kind: 'note',
                title: title.trim(),
                // A qualification with nothing said about it is still a
                // sentence the ingester can work with.
                text: detail.trim() || title.trim(),
              }

      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, consumed: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 202) throw new Error(body.error ?? 'Could not file that.')

      onChange([
        ...entries,
        {
          resourceId: body.id,
          title: body.title ?? (title.trim() || url.trim()),
          kind: payload.kind,
        },
      ])
      clear()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function upload(picked: File) {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', picked)
      form.set('consumed', 'true')

      const res = await fetch('/api/resources/upload', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 202) throw new Error(body.error ?? 'Could not take that file.')

      onChange([...entries, { resourceId: body.id, title: body.title, kind: 'pdf' }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function remove(entry: ProofEntry) {
    onChange(entries.filter(e => e.resourceId !== entry.resourceId))
    // Filed already, so taking it off the list has to take it out of the
    // library too. It was never read into the record, so nothing rests
    // on it and it can simply go.
    await fetch(`/api/resources/${entry.resourceId}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <div className={styles.proof}>
      <p className={styles.proofLead}>
        Show your working, if you have any to show. Anything you file here
        joins the library straight away, marked as read.
      </p>

      {entries.length > 0 && (
        <ul className={styles.proofList}>
          {entries.map(entry => (
            <li key={entry.resourceId} className={styles.proofRow}>
              <span className={styles.proofName}>{entry.title}</span>
              <span className={styles.leaders} aria-hidden="true" />
              <span className={styles.proofKind}>{entry.kind}</span>
              <button
                type="button"
                className={styles.proofDrop}
                onClick={() => remove(entry)}
                aria-label={`Remove ${entry.title}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.proofModes}>
        {MODES.map(m => (
          <button
            key={m.value}
            type="button"
            className={`${styles.chip} ${mode === m.value ? styles.chipOn : ''}`}
            aria-pressed={mode === m.value}
            onClick={() => {
              setMode(m.value)
              setError(null)
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className={styles.proofHint}>{MODES.find(m => m.value === mode)!.hint}</p>

      <div className={styles.proofFields}>
        {mode === 'link' && (
          <input
            className={styles.proofInput}
            type="url"
            inputMode="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ready && !busy && file()}
            placeholder="https://…"
            aria-label="Link to something you have read"
          />
        )}

        {mode === 'book' && (
          <input
            className={styles.proofInput}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ready && !busy && file()}
            placeholder="Refactoring — Martin Fowler"
            aria-label="Book or course"
          />
        )}

        {mode === 'credential' && (
          <>
            <input
              className={styles.proofInput}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="MSc Data Science, 2019"
              aria-label="Qualification"
            />
            <textarea
              className={styles.proofArea}
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="What it actually covered, if the title does not say."
              aria-label="What the qualification covered"
            />
          </>
        )}

        {mode === 'file' ? (
          <input
            ref={fileInput}
            className={styles.proofFile}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={e => {
              const picked = e.target.files?.[0]
              if (picked) upload(picked)
            }}
            aria-label="Upload a PDF"
          />
        ) : (
          <button
            type="button"
            className={styles.proofSubmit}
            onClick={file}
            disabled={!ready || busy}
          >
            {busy ? 'Filing…' : 'File it'}
          </button>
        )}
      </div>

      {error && <p className={styles.proofProblem}>{error}</p>}
    </div>
  )
}
