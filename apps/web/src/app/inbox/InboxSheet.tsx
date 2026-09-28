'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { LibraryRow } from '@didactic/core/shapes'
import { ResourceList } from '@/components/ResourceList'
import { bestHits, byTopic, filedUnder, shelfMatches, type ShelfHit } from '@didactic/core/shelf'
import styles from './page.module.css'

const api = didactic()

/** How often a sheet with something still being read looks again. */
const LOOK_AGAIN_MS = 20_000
/** And for how long, before it leaves the reader to reload. */
const STOP_LOOKING_MS = 5 * 60_000

const KIND_LABEL: Record<string, string> = {
  article: 'Article',
  pdf: 'PDF',
  book: 'Book',
  note: 'Note',
}

/**
 * The kept material, unread first, with a box to narrow it.
 *
 * Filtering is in the page rather than in the URL: this is a shelf
 * being scanned rather than a search worth linking to, and a round trip
 * per keystroke to a database on another continent would make it feel
 * worse than reading the whole list.
 *
 * The rows themselves are `ResourceList`, unchanged -- it already owns
 * marking a thing read and the optimistic shuffle that follows. What
 * came across from the library sheet is what only it could do: finding
 * a row, folding duplicates together, and throwing a thing away.
 */
export function InboxSheet({
  resources,
  children,
}: {
  resources: LibraryRow[]
  /** What stands between the search and the lists: the queue of topics
   *  waiting on a decision. Under the search, which is the head of the
   *  page, and over what it is waiting on. */
  children?: React.ReactNode
}) {
  const [term, setTerm] = useState('')
  const [kind, setKind] = useState<string>('all')
  /** Shelved by what each is most about, rather than read and unread. */
  const [grouped, setGrouped] = useState(false)
  /** Narrowed to one topic: everything filed against it, anywhere in its
   *  list, not only what it is most about. */
  const [only, setOnly] = useState<{ id: string; title: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  // Something is still waiting or being read: look again now and then,
  // so it turns to Filed without a reload. Each look also works the
  // queue -- see `drainAfter` on the page.
  const underway = resources.some(r => r.filing === 'waiting' || r.filing === 'reading')
  useEffect(() => {
    if (!underway) return
    const since = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - since > STOP_LOOKING_MS) return clearInterval(timer)
      if (document.visibilityState === 'visible') startTransition(() => router.refresh())
    }, LOOK_AGAIN_MS)
    return () => clearInterval(timer)
  }, [underway, router])

  /**
   * The search, in two halves.
   *
   * What every row already carries -- title, address, the filing
   * summary, topics, what the reader said back -- is matched here as it
   * is typed (`core/shelf.shelfMatches`), so the list answers at once.
   * What only the database holds -- the text of each resource, every
   * mark, note and section summary written in one -- is asked for a
   * moment after typing stops, and each row it finds comes back with
   * where it was found. The list is both: nothing found locally is
   * held back waiting for the server, and nothing the server found is
   * missing because its title did not match.
   */
  const [found, setFound] = useState<{ for: string; hits: ShelfHit[] } | null>(null)
  const [looking, setLooking] = useState(false)
  const query = term.trim()

  useEffect(() => {
    if (query.length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLooking(true)
      void api.inbox.search(query).then(({ ok, body }) => {
        if (cancelled) return
        setLooking(false)
        // A failed search costs only the deeper half: what is on the
        // rows is still matched, and says so by what it shows.
        if (ok) setFound({ for: query, hits: body.hits })
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  // Only the answer to the search now in the box: an answer to an older
  // one is dropped rather than shown against the wrong words.
  const hits = useMemo(
    () => (found && found.for === query ? bestHits(found.hits) : new Map<string, ShelfHit>()),
    [found, query]
  )

  const shown = useMemo(
    () =>
      resources.filter(r => {
        if (kind !== 'all' && r.kind !== kind) return false
        if (only && !filedUnder(r, only.id)) return false
        return shelfMatches(r, query) || hits.has(r.id)
      }),
    [resources, query, kind, only, hits]
  )

  const unread = shown.filter(r => r.status === 'queued' || r.status === 'reading')
  const read = shown.filter(r => r.status === 'consumed' || r.status === 'abandoned')

  const unfiled = resources.filter(r => r.topics.length === 0).length
  const duplicates = resources.filter(r => r.sameAs.length > 0).length

  /** Fold a near-duplicate into this row. Irreversible, so it is only
   *  ever offered where two rows genuinely look like one thing. */
  async function merge(keepId: string, mergeId: string) {
    setBusy(keepId)
    setError(null)

    const { ok, error: failed } = await api.resources.merge(keepId, mergeId)
    if (ok) startTransition(() => router.refresh())
    else setError(failed ?? 'Could not merge those.')
    setBusy(null)
  }

  async function remove(id: string) {
    setBusy(id)
    setError(null)

    const { ok, error: failed } = await api.resources.remove(id)
    if (ok) startTransition(() => router.refresh())
    else setError(failed ?? 'Could not remove that.')
    setBusy(null)
  }

  return (
    <>
      {/* The filter only earns its space once there is enough to lose
          something in. Below that it is furniture over a list you can
          already see all of. */}
      {resources.length > 0 && (
        <div className={styles.controls}>
          <input
            className={styles.search}
            type="search"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Search titles, topics, the text, your marks and summaries"
            aria-label="Search everything you have kept, and everything you wrote in it"
          />
          {query.length >= 2 && (
            <p className={styles.searching} role="status">
              {looking
                ? 'Looking through the text and your marks…'
                : `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`}
            </p>
          )}
          <div className={styles.kinds} role="group" aria-label="Filter by kind">
            {['all', 'article', 'book', 'pdf', 'note'].map(k => (
              <button
                key={k}
                type="button"
                className={styles.kind}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k === 'all' ? 'Everything' : KIND_LABEL[k]}
              </button>
            ))}
            <span className={styles.kindsGap} aria-hidden="true" />
            <button
              type="button"
              className={styles.kind}
              aria-pressed={grouped}
              onClick={() => setGrouped(g => !g)}
            >
              By topic
            </button>
          </div>
          {only && (
            <p className={styles.narrowed}>
              Filed under <strong>{only.title}</strong>
              <button
                type="button"
                className={styles.narrowedClear}
                onClick={() => setOnly(null)}
                aria-label={`Show everything, not only ${only.title}`}
              >
                Show everything
              </button>
            </p>
          )}
        </div>
      )}

      {children}

      {error && <p className={styles.problem}>{error}</p>}

      {/* Shelved by topic: each resource once, under what it is most
          about, unread before read. A shelf's head narrows the inbox to
          that topic, which also finds what only touches it. */}
      {grouped &&
        byTopic([...unread, ...read]).map(shelf => (
          <section key={shelf.topic?.id ?? 'unfiled'}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{shelf.topic?.title ?? 'Filed against nothing'}</h2>
              <span className={styles.sectionNote}>
                {shelf.rows.length}
                {shelf.topic && !only && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className={styles.shelfOnly}
                      onClick={() => setOnly(shelf.topic)}
                    >
                      only this topic
                    </button>
                  </>
                )}
              </span>
            </div>
            <ResourceList resources={shelf.rows} onRemove={remove} hits={hits} />
          </section>
        ))}

      {!grouped && (
      <section>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Unread</h2>
          <span className={styles.sectionNote}>{unread.length} to read</span>
        </div>
        <ResourceList resources={unread} onRemove={remove} hits={hits} />
      </section>
      )}

      {!grouped && read.length > 0 && (
        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Read</h2>
            <span className={styles.sectionNote}>{read.length} done with</span>
          </div>
          <ResourceList resources={read} onRemove={remove} hits={hits} />
        </section>
      )}

      {/* Filed against nothing means no lesson can reach it and it
          appears on no topic sheet -- worth saying out loud. */}
      {(unfiled > 0 || duplicates > 0) && (
        <p className={styles.count}>
          {[
            unfiled > 0 && `${unfiled} filed against no topic`,
            duplicates > 0 && `${duplicates} look like duplicates`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {/* Two rows for one thing.

          Throwing a thing away used to live here too, as a second list
          of every row on the sheet with a Remove beside each. That
          meant scrolling past everything to get rid of the thing you
          were already looking at, and reading the same title twice to
          be sure you had the right one. Removing is on the row now,
          beside the other things you can do to it; what is left here is
          the one errand that genuinely is not about a single row. */}
      {duplicates > 0 && (
        <details className={styles.tidy}>
          <summary className={styles.tidySummary}>
            Two rows for one thing · {duplicates}
          </summary>

          <ul className={styles.tidyList}>
            {resources
              .filter(r => r.sameAs.length > 0)
              .map(r => (
                <li key={r.id} className={styles.tidyRow}>
                  <span className={styles.tidyTitle}>{r.title}</span>
                  <span className={styles.tidyNote}>
                    looks like{' '}
                    {r.sameAs.map((d, i) => (
                      <span key={d.id}>
                        {i > 0 && ', '}
                        {d.title}
                        {' — '}
                        <button
                          type="button"
                          className={styles.tidyAction}
                          onClick={() => merge(r.id, d.id)}
                          disabled={busy === r.id}
                        >
                          {busy === r.id ? 'Merging…' : 'fold it into this one'}
                        </button>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}

    </>
  )
}
