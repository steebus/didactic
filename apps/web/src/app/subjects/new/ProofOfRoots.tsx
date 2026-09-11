'use client'

import { useEffect, useRef, useState } from 'react'
import { didactic, type AddResource } from '@didactic/api'
import { bookNote, type BookMatch } from '@didactic/core/books'
import { rungsFor, defaultRungFor, type Fidelity } from '@didactic/core/documents'
import { useLabour, READINGS } from '@/components/useLabour'
import styles from './page.module.css'

const api = didactic()

export interface ProofEntry {
  /** The resource row it became. Present once it has been filed. */
  resourceId: string
  title: string
  kind: string
  /** How closely the bed should follow it. Only ever set on a PDF: a
   *  book named by title has no structure to follow, because the app
   *  never holds its contents. Absent means it steers nothing, which
   *  is what every piece of proof did before the dial existed. */
  fidelity?: Fidelity
  /** What the document turned out to be shaped like, read as it was
   *  uploaded. Zero chapters is ordinary — an article is not a book —
   *  and it decides which rungs can honestly be offered. */
  chapters?: number
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
  /** What the sheet says while a document goes up and is opened. The
   *  same mechanism the sowing button uses, in the register of handling
   *  a book rather than turning soil. */
  const reading = useLabour(busy, READINGS)

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
      onChange([
        ...entries,
        {
          resourceId: body.id,
          title: body.title,
          kind: 'pdf',
          chapters: body.outline?.chapters ?? 0,
          // A document with a shape to follow starts on the rung that
          // is right far more often than the other two. One without
          // starts steering only what the subject covers, because the
          // other two rungs would have nothing to act on.
          fidelity: defaultRungFor(body.outline?.chapters ?? 0),
        },
      ])
    }

    setBusy(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  /** Which rung this document sits at. Kept on the entry rather than
   *  sent anywhere: it is read when the bed is sown, with the rest of
   *  the sheet, because until then there is no bed to follow it. */
  function setFidelity(entry: ProofEntry, fidelity: Fidelity | undefined) {
    onChange(
      entries.map(e => (e.resourceId === entry.resourceId ? { ...e, fidelity } : e))
    )
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
              <div className={styles.proofLine}>
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
              </div>

              {entry.kind === 'pdf' && (
                <fieldset className={styles.follow}>
                  <legend className={styles.followLegend}>
                    How closely should the bed follow it?
                  </legend>

                  {/* What was actually found in it, read as it was
                      uploaded. A document with no contents of its own
                      cannot be followed to the letter or in its order,
                      so those rungs are not offered rather than offered
                      and quietly ignored — and the reason is printed,
                      because "an article has no chapters" is obvious
                      once said and baffling when it is not. */}
                  {entry.chapters === 0 ? (
                    <p className={styles.followNone}>
                      No structure could be found in it — no bookmarks, no contents
                      page, and no headings set apart from the text — so there is no
                      order for the bed to follow. It can still steer what the
                      subject covers, and lessons written here can still cite it.
                    </p>
                  ) : (
                    entry.chapters !== undefined && (
                      <p className={styles.followFound}>
                        {entry.chapters} {entry.chapters === 1 ? 'chapter' : 'chapters'} found.
                      </p>
                    )
                  )}

                  {rungsFor(entry.chapters ?? 0).map(rung => (
                    <label key={rung.value} className={styles.followRung}>
                      <input
                        type="radio"
                        name={`follow-${entry.resourceId}`}
                        value={rung.value}
                        checked={entry.fidelity === rung.value}
                        onChange={() => setFidelity(entry, rung.value)}
                      />
                      <span className={styles.followLabel}>{rung.label}</span>
                      <span className={styles.followHint}>{rung.hint}</span>
                    </label>
                  ))}

                  <label className={styles.followRung}>
                    <input
                      type="radio"
                      name={`follow-${entry.resourceId}`}
                      value=""
                      checked={!entry.fidelity}
                      onChange={() => setFidelity(entry, undefined)}
                    />
                    <span className={styles.followLabel}>Not at all</span>
                    <span className={styles.followHint}>
                      Filed as material. The bed is laid out as though it were not here.
                    </span>
                  </label>
                </fieldset>
              )}
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
          <>
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

            {/* The longest a reader waits anywhere in this app without a
                word, and it used to pass in silence: a file input has no
                busy state of its own, so picking a book and waiting for
                it to go up and be opened looked exactly like nothing
                happening. Polite, because it changes several times and
                is not urgent. */}
            {busy && (
              <p className={styles.reading} role="status" aria-live="polite">
                {reading}
              </p>
            )}
          </>
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
