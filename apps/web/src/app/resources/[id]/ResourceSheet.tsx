'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { ClozeCard } from '@didactic/core/clozes'
import type { ResourceReading } from '@didactic/core/shapes'
import type { ExposureDepth, Highlight as Mark, ResourceStatus } from '@didactic/core/types'
import { lessonSections } from '@didactic/core/sections'
import { summaryOf, summaryTally } from '@didactic/core/summaries'
import { isPlaceholderTitle } from '@didactic/core/titles'
import { kindLabel, mediaOf } from '@didactic/core/shared'
import { filingLine, refileAs, refiledSentence, refileLabel } from '@didactic/core/whole'
import { Prose } from '@/components/Prose'
import { Highlighter } from '@/components/Highlighter'
import { Contents } from '@/components/Contents'
import { SectionSummaries } from '@/components/SectionSummaries'
import { ReadingSummary } from '@/components/ReadingSummary'
import { useSummaries } from '@/components/useSummaries'
import { SheetNav } from '@/components/SheetNav'
import { Crumbs } from '@/components/Crumbs'
import { pressedLink } from '@/lib/pressedLink'
import { useScrollMemory } from '@/lib/useScrollMemory'
import { useReadingRail } from '@/lib/useReadingRail'
import styles from '@/app/lesson/[id]/page.module.css'
import own from './page.module.css'

const api = didactic()

const STATUS_LABEL: Record<ResourceStatus, string> = {
  queued: 'Unread',
  reading: 'Reading',
  consumed: 'Read',
  abandoned: 'Set aside',
}

/** The depths a reading can be said to have been done at, first the
 *  one the button at the foot is for. */
const DEPTHS = [
  { value: 'read', label: 'Read it', note: 'Went through it properly.' },
  { value: 'skim', label: 'Skimmed it', note: 'Passed my eyes over it.' },
  { value: 'applied', label: 'Worked with it', note: 'Did something with what it said.' },
] as const

/**
 * A resource, read the way a lesson is.
 *
 * The same reader -- the prose, the contents at the top, marks and
 * clozes on any passage, a sprig beside every heading for saying that
 * section back, and the whole of it said back at the foot -- because a
 * reader who has learned to work a lesson should not have to learn a
 * second way of working an article.
 *
 * Opening it says the reader is reading it, which is the one thing the
 * inbox used to need a separate press for; and saying it was read is at
 * the foot, where the reading ends.
 */
export default function ResourceSheet({ initial }: { initial: ResourceReading }) {
  const router = useRouter()
  const { resource, topics, readable } = initial
  const id = resource.id

  const article = useRef<HTMLElement>(null)
  const [reading, setReading] = useState<HTMLElement | null>(null)
  const holdArticle = useCallback((node: HTMLElement | null) => {
    article.current = node
    setReading(node)
  }, [])
  const [sheetBody, setSheetBody] = useState<HTMLElement | null>(null)

  const [status, setStatus] = useState<ResourceStatus>(resource.status)
  const [consumedAt, setConsumedAt] = useState<string | null>(resource.consumed_at)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [written, setWritten] = useState<Mark[]>(initial.written)
  const [clozes, setClozes] = useState<ClozeCard[]>([])
  const [garden, setGarden] = useState(0)
  const [title, setTitle] = useState(resource.title)
  const [refiling, setRefiling] = useState(false)
  const [refiled, setRefiled] = useState<string | null>(null)

  const marks = useMemo(() => written.filter(h => h.kind !== 'summary'), [written])
  const summarised = useMemo(() => written.filter(h => h.kind === 'summary'), [written])
  const {
    summaries,
    save: saveSummary,
    remove: removeSummary,
    problem: summaryProblem,
  } = useSummaries({ resourceId: id }, summarised)

  const body = readable.body
  useScrollMemory(`resource:${id}`, body !== null)
  const { sentinel: headEnd, past: pastHead } = useReadingRail<HTMLDivElement>()

  /**
   * Opening it is reading it.
   *
   * Something still waiting in the inbox is moved to *Reading* the
   * moment it is opened here, which is what the inbox's own *Reading*
   * press said by hand. Nothing waits on it and a failure changes
   * nothing but the word: the row stays *Unread* and the next open
   * says it again. It writes no exposure -- only saying it was read
   * does.
   */
  const said = useRef(false)
  useEffect(() => {
    if (said.current || resource.status !== 'queued') return
    said.current = true
    setStatus('reading')
    void api.resources.patch(id, { status: 'reading' }).then(({ ok }) => {
      if (!ok) setStatus('queued')
    })
  }, [id, resource.status])

  /**
   * A resource still wearing its address as a name is given the one its
   * page carries -- saved before ingestion kept it -- the first time it
   * is opened. Nothing waits on it; a page that says nothing better
   * leaves the stand-in, which is short enough to set.
   */
  const named = useRef(false)
  useEffect(() => {
    if (named.current || !isPlaceholderTitle(resource.title, resource.url)) return
    named.current = true
    void api.resources.retitle(id).then(({ ok, body: payload }) => {
      if (ok && payload.changed) setTitle(payload.title)
    })
  }, [id, resource.title, resource.url])

  // The passages this reading is tended on, for the plum under its
  // prose. Its own read, so a garden that cannot be reached costs the
  // reader nothing but the drawing.
  useEffect(() => {
    let cancelled = false
    void api.clozes.inResource(id).then(({ ok, body: payload }) => {
      if (!cancelled && ok) setClozes(payload.clozes)
    })
    return () => {
      cancelled = true
    }
  }, [id, garden])

  /** Read what has been written in it again, after a mark changed. */
  const reread = useCallback(async () => {
    const { ok, body: payload } = await api.resources.reading(id)
    if (ok) setWritten(payload.written)
  }, [id])

  /**
   * Say it was read, and how.
   *
   * The same write the inbox's *Done* makes: the exposure is
   * what moves the topics it is filed under. The word changes on the
   * press and the writing happens behind it; a failure puts it back.
   */
  async function finish(depth: ExposureDepth) {
    const before = { status, consumedAt }
    setBusy(true)
    setError(null)
    setStatus('consumed')
    setConsumedAt(new Date().toISOString())

    const { ok, error: failed } = await api.resources.patch(id, { status: 'consumed', depth })
    if (!ok) {
      setStatus(before.status)
      setConsumedAt(before.consumedAt)
      setError(failed ?? 'Could not save that.')
    } else {
      router.refresh()
    }
    setBusy(false)
  }

  /**
   * File it the other way: as one topic if it is filed by its parts, by
   * its parts if it is one topic. Read again rather than rearranged, so
   * the sheet says so and the new filing arrives with the reading.
   */
  async function refile() {
    const as = refileAs(topics.length)
    setRefiling(true)
    setError(null)
    const { ok, body: answer, error: failed } = await api.resources.refile(id, as)
    setRefiling(false)
    if (!ok) {
      setError(failed ?? 'Could not file it again.')
      return
    }
    setRefiled(refiledSentence(as, answer.cleared))
    router.refresh()
  }

  const done = status === 'consumed'
  const trail = [
    { href: '/inbox', label: 'Inbox' },
    ...(topics[0] ? [{ href: `/topics/${topics[0].id}`, label: topics[0].title }] : []),
  ]
  const host = resource.url ? safeHost(resource.url) : null
  const media = mediaOf(resource.url)

  return (
    <>
      <div className={styles.rail} data-shown={pastHead || undefined}>
        <div className={styles.railInner}>
          <Crumbs className={styles.railCrumbs} trail={trail} />
          <p className={styles.railTitle}>{title}</p>
        </div>
      </div>

      <main className={styles.sheet}>
        <header className={styles.head}>
          <SheetNav
            current="inbox"
            filedUnder={topics[0] ? { id: topics[0].id, title: topics[0].title } : undefined}
          />
          <div className={styles.headRow}>
            <div>
              <Crumbs className={styles.eyebrow} trail={trail} />
              <h1 className={styles.title}>{title}</h1>
            </div>
          </div>

          <div className={styles.figures}>
            <span className={styles.figure}>
              <span className={styles.figureLabel}>Kind</span>
              <span className={styles.figureValue}>{kindLabel(resource.kind, resource.url)}</span>
            </span>
            {host && (
              <span className={styles.figure}>
                <span className={styles.figureLabel}>From</span>
                {/* The page it came from, for the pictures, the video
                    and anything else that did not come across. */}
                <a
                  className={own.source}
                  href={resource.url!}
                  target="_blank"
                  rel="noreferrer"
                >
                  {host}
                </a>
              </span>
            )}
            {resource.has_file && (
              <span className={styles.figure}>
                <span className={styles.figureLabel}>File</span>
                <Link className={own.source} href={`/resources/${id}/read`}>
                  Open the document
                </Link>
              </span>
            )}
            <span className={styles.figure}>
              <span className={styles.figureLabel}>State</span>
              <span className={styles.figureValue}>{STATUS_LABEL[status]}</span>
            </span>
          </div>
        </header>
        <div className={styles.headRule} />

        <div ref={headEnd} className={styles.railMark} aria-hidden="true" />

        <div className={styles.body} ref={setSheetBody}>
          {topics.length > 0 && (
            <p className={own.filed}>
              Filed under{' '}
              {topics.map((topic, i) => (
                <span key={topic.id}>
                  {i > 0 && ', '}
                  <Link href={`/topics/${topic.id}`} className={own.filedLink}>
                    {topic.title}
                  </Link>
                </span>
              ))}
            </p>
          )}

          {/* How it is filed, and the press that files it the other way.
              Gone once it is read: its reading is counted against these
              topics now. */}
          {refiled ? (
            <p className={own.filing}>{refiled}</p>
          ) : (
            topics.length > 0 &&
            !done && (
              <p className={own.filing}>
                {filingLine(topics.length)}{' '}
                <button type="button" className={own.refile} onClick={refile} disabled={refiling}>
                  {refiling ? 'Filing it again…' : refileLabel(topics.length)}
                </button>
              </p>
            )
          )}

          {error && <p className={styles.problem}>{error}</p>}

          {/* A video is watched here and a post seen here; what they said
              in words -- the description, the transcript, the caption --
              is the reading under them. */}
          {media && (
            <div className={own.media} data-kind={media.kind}>
              <iframe
                src={media.embed}
                title={title}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}

          {body ? (
            <>
              <Contents root={article} body={body} />

              <article
                ref={holdArticle}
                onClick={e => {
                  // A link inside the app turns the sheet rather than
                  // reloading it. One out of it -- which is most of an
                  // article's -- is left to the browser.
                  const href = pressedLink(e)
                  if (!href) return
                  e.preventDefault()
                  router.push(href)
                }}
              >
                <Highlighter
                  resourceId={id}
                  existing={marks}
                  summaries={summaries}
                  clozes={clozes}
                  deskWithin={sheetBody}
                  onChanged={() => void reread()}
                  onTended={() => setGarden(g => g + 1)}
                >
                  <Prose markdown={body} pictures />
                </Highlighter>

                <SectionSummaries
                  root={reading}
                  body={body}
                  summaries={summaries}
                  onSave={(section, at, note) => saveSummary(section, at, note)}
                  onRemove={removeSummary}
                />
              </article>
            </>
          ) : (
            <div className={own.unreadable}>
              <p className={own.unreadableWhy}>{readable.body === null ? readable.why : ''}</p>
              {(resource.url || resource.has_file) && (
                <p className={own.unreadableWay}>
                  Read it{' '}
                  {resource.has_file ? (
                    <Link href={`/resources/${id}/read`}>in the document viewer</Link>
                  ) : (
                    <a href={resource.url!} target="_blank" rel="noreferrer">
                      where it lives
                    </a>
                  )}
                  , and come back here to say it back and mark it read.
                </p>
              )}
            </div>
          )}

          {/* The whole of it, said back, at the foot -- whether or not
              the words could be brought in. A book read on paper is
              still worth putting into your own words. */}
          <ReadingSummary
            summary={summaryOf(summaries, null)}
            tally={summaryTally(summaries, body ? lessonSections(body).map(s => s.text) : [])}
            noun={resource.kind === 'book' ? 'book' : resource.kind === 'note' ? 'note' : 'piece'}
            onSave={note => saveSummary(null, null, note)}
            onRemove={removeSummary}
            problem={summaryProblem}
          />

          <section className={styles.finish}>
            {done ? (
              <>
                <h2 className={styles.finishTitle}>Read</h2>
                <p className={styles.finishNote}>
                  {consumedAt
                    ? `Recorded on ${new Date(consumedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}. `
                    : ''}
                  {topics.length > 0
                    ? `It counted toward ${topics.map(t => t.title).join(', ')}.`
                    : 'It is filed under no topic yet, so it moved no figure.'}
                </p>
                <Link href="/inbox" className={styles.quietAction}>
                  Back to the inbox
                </Link>
              </>
            ) : (
              <>
                <h2 className={styles.finishTitle}>Have you read it?</h2>
                <p className={styles.finishNote}>
                  Say so when you are done, and how. Reading is what counts toward the
                  map — keeping something only says you meant to.
                </p>
                <div className={styles.depths}>
                  {DEPTHS.map((d, i) => (
                    <button
                      key={d.value}
                      className={styles.depth}
                      style={{ '--i': i } as React.CSSProperties}
                      disabled={busy}
                      onClick={() => finish(d.value)}
                    >
                      <span className={styles.depthLabel}>{d.label}</span>
                      <span className={styles.depthNote}>{d.note}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

/** The site a link is on, as a reader would name it. */
function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
