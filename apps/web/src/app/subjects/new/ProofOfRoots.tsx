'use client'

import { useEffect, useRef, useState } from 'react'
import { didactic, type AddResource } from '@didactic/api'
import { bookNote, type BookMatch } from '@didactic/core/books'
import styles from './page.module.css'

const api = didactic()

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
    hint: 'Start typing a title and it will look it up, or write it out yourself.',
  },
  {
    value: 'credential',
    label: 'A qualification',
    hint: 'A degree, a certification, a job you did this in for two years.',
  },
  {
    value: 'file',
    label: 'A PDF',
    hint: 'A handbook, a paper, a book. Under 50 MB, and it can be followed when the bed is laid out.',
  },
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

  // Book lookup. `chosen` holds the matched record so the subjects
  // Open Library knows about are filed with it; typing again drops it,
  // because what is filed must be what is on screen.
  const [matches, setMatches] = useState<BookMatch[]>([])
  const [looking, setLooking] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [chosen, setChosen] = useState<BookMatch | null>(null)

  const ready =
    (mode === 'link' && url.trim().length > 0) ||
    (mode === 'book' && title.trim().length > 0) ||
    (mode === 'credential' && title.trim().length > 0)

  function clear() {
    setUrl('')
    setTitle('')
    setDetail('')
    setChosen(null)
    setMatches([])
    setHighlighted(-1)
  }

  function choose(book: BookMatch) {
    setChosen(book)
    setTitle(book.label)
    setMatches([])
    setHighlighted(-1)
  }

  // Lookup runs a beat behind the typing: a request per keystroke is
  // both rude to Open Library and slower on screen than waiting.
  useEffect(() => {
    // Nothing to look up once a book has been picked, and nothing worth
    // looking up below three characters. Whether the results still
    // apply is decided at render rather than by clearing them here:
    // clearing state from inside an effect is a cascading render.
    const q = title.trim()
    if (mode !== 'book' || chosen || q.length < 3) return

    const cancelled = { current: false }
    const timer = setTimeout(async () => {
      setLooking(true)
      try {
        const { body } = await api.books.search(q)
        if (!cancelled.current) setMatches(Array.isArray(body.books) ? body.books : [])
      } catch {
        // The manual field is right there, so a failed lookup is
        // silence rather than an error.
        if (!cancelled.current) setMatches([])
      } finally {
        if (!cancelled.current) setLooking(false)
      }
    }, 280)

    return () => {
      cancelled.current = true
      clearTimeout(timer)
    }
  }, [mode, title, chosen])

  // Results only stand while the query that produced them still does.
  const showing = mode === 'book' && !chosen && title.trim().length >= 3 ? matches : []

  async function file() {
    setBusy(true)
    setError(null)

    const payload: AddResource =
      mode === 'link'
        ? { kind: 'article', url: url.trim(), title: title.trim() || url.trim() }
        : mode === 'book'
          ? {
              kind: 'book',
              title: title.trim(),
              // A matched book files with what Open Library says it
              // is about, which is what lets the ingester place it on
              // the map. The app never holds a book's contents, so
              // this is the honest most it can record.
              ...(chosen
                ? { url: `https://openlibrary.org${chosen.key}`, text: bookNote(chosen) }
                : {}),
            }
          : {
              kind: 'note',
              title: title.trim(),
              // A qualification with nothing said about it is still a
              // sentence the ingester can work with.
              text: detail.trim() || title.trim(),
            }

    // 202 is filed-but-not-queued, which is still filed.
    const { ok, status, body, error: failed } = await api.resources.add({
      ...payload,
      consumed: true,
    })
    if (!ok && status !== 202) {
      setError(failed ?? 'Could not file that.')
      setBusy(false)
      return
    }

    onChange([
      ...entries,
      {
        resourceId: body.id,
        title: body.title ?? (title.trim() || url.trim()),
        kind: payload.kind,
      },
    ])
    clear()
    setBusy(false)
  }

  async function upload(picked: File) {
    setBusy(true)
    setError(null)

    // Straight to storage rather than through a function: a book is
    // far over the four and a half megabytes a request body may carry,
    // and this used to fail at the platform with an error the app could
    // not explain.
    const { ok, status, body, error: failed } = await api.resources.uploadDocument(picked, {
      consumed: true,
    })
    if (!ok && status !== 202) {
      setError(failed ?? 'Could not take that file.')
    } else {
      onChange([...entries, { resourceId: body.id, title: body.title, kind: 'pdf' }])
    }

    setBusy(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function remove(entry: ProofEntry) {
    onChange(entries.filter(e => e.resourceId !== entry.resourceId))
    // Filed already, so taking it off the list has to take it out of the
    // library too. It was never read into the record, so nothing rests
    // on it and it can simply go.
    await api.resources.remove(entry.resourceId)
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
          <div className={styles.lookup}>
            <input
              className={styles.proofInput}
              value={title}
              onChange={e => {
                setTitle(e.target.value)
                // Editing after a match means the match no longer
                // describes what is in the box.
                setChosen(null)
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown' && showing.length) {
                  e.preventDefault()
                  setHighlighted(h => (h + 1) % showing.length)
                } else if (e.key === 'ArrowUp' && showing.length) {
                  e.preventDefault()
                  setHighlighted(h => (h <= 0 ? showing.length - 1 : h - 1))
                } else if (e.key === 'Escape') {
                  setMatches([])
                  setHighlighted(-1)
                } else if (e.key === 'Enter') {
                  if (highlighted >= 0 && showing[highlighted]) {
                    e.preventDefault()
                    choose(showing[highlighted])
                  } else if (ready && !busy) {
                    file()
                  }
                }
              }}
              placeholder="Refactoring, or Machine Learning by Andrew Ng"
              aria-label="Book or course"
              role="combobox"
              aria-expanded={showing.length > 0}
              aria-controls="book-matches"
              aria-autocomplete="list"
              aria-activedescendant={
                highlighted >= 0 && showing[highlighted]
                  ? `book-${highlighted}`
                  : undefined
              }
              autoComplete="off"
            />

            {looking && showing.length === 0 && (
              <p className={styles.lookupNote}>Looking it up…</p>
            )}

            {showing.length > 0 && (
              <ul className={styles.matches} id="book-matches" role="listbox">
                {showing.map((book, i) => (
                  <li key={book.key} id={`book-${i}`} role="option" aria-selected={i === highlighted}>
                    <button
                      type="button"
                      className={`${styles.match} ${i === highlighted ? styles.matchOn : ''}`}
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => choose(book)}
                    >
                      <span className={styles.matchTitle}>{book.title}</span>
                      <span className={styles.matchMeta}>
                        {book.authors.join(', ') || 'Author unknown'}
                        {book.year ? ` · ${book.year}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {chosen && (
              <p className={styles.lookupNote}>
                Matched on Open Library. It will be filed with what the record
                says it is about.
              </p>
            )}
          </div>
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
