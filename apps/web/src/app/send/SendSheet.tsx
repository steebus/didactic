'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import { kindLabel, type Shared } from '@didactic/core/shared'
import { urlTitle } from '@didactic/core/titles'
import { isPdf, MAX_DOCUMENT_BYTES, NOT_A_PDF, titleFromFilename, tooLarge } from '@didactic/core/documents'
import {
  isSettled,
  progressNow,
  stepLine,
  type IngestProgress,
  type TimedStep,
} from '@didactic/core/ingestProgress'
import styles from './page.module.css'

const api = didactic()

type State =
  | { at: 'saving' }
  | { at: 'saved'; id: string; title: string; already: boolean; shape?: string }
  | { at: 'failed'; why: string }

/** Where the service worker leaves a shared file (`public/sw.js`). */
const SHARED_CACHE = 'didactic-shared'
const SHARED_FILE = '/send/shared-file'

/**
 * The file Android shared, from where the service worker left it. Taken
 * once: the entry is removed as it is read, so it is not uploaded again
 * by a reload, and the next share has the place to itself.
 */
async function takeSharedFile(): Promise<File | null> {
  if (!('caches' in window)) return null
  const cache = await caches.open(SHARED_CACHE)
  const held = await cache.match(SHARED_FILE)
  if (!held) return null
  const name = decodeURIComponent(held.headers.get('x-file-name') ?? 'Shared document.pdf')
  const blob = await held.blob()
  await cache.delete(SHARED_FILE)
  return new File([blob], name, { type: held.headers.get('content-type') || blob.type })
}

/** What the upload found in a document, said the way the inbox's upload
 *  says it (`AddResource`). */
function shapeOf(outline: { chapters: number; problem?: string } | null | undefined): string | undefined {
  if (!outline) return undefined
  if (outline.problem) return 'It could not be opened to be read. It is on the shelf either way.'
  const n = outline.chapters
  return n > 0
    ? `${n} ${n === 1 ? 'chapter' : 'chapters'} found in it.`
    : 'No chapters could be found in it, so it is material rather than a shape to follow.'
}

/**
 * Saves what was shared, once, and says so.
 *
 * Either way the reading is then shown as it happens. Opened by the
 * bookmarklet it is a small window the reader wants gone once there is
 * nothing more to see, so it closes itself a few seconds after the
 * reading has filed it, unless the reader has touched it; one that
 * failed stays open to say why. Opened by a share sheet it stays, with
 * the way into what was just saved.
 */
export function SendSheet({
  shared,
  popup,
  file,
  origin,
}: {
  shared: Shared
  popup: boolean
  /** A file was shared, and the service worker is holding it. */
  file: boolean
  origin: string
}) {
  const nothing = !file && !shared.url && !shared.note
  const [state, setState] = useState<State>({ at: 'saving' })
  /** The shared file, once taken: kept so *Try again* has it. */
  const [doc, setDoc] = useState<File | null>(null)
  const sent = useRef(false)
  const [finished, setFinished] = useState(false)

  /**
   * A shared PDF, filed exactly as the inbox's upload files one: checked
   * here, sent straight to storage, then read for its shape and queued
   * (`api.resources.uploadDocument`). The reading is then shown as it is
   * for a link.
   */
  async function sendFile() {
    setState({ at: 'saving' })
    let picked = doc
    if (!picked) {
      try {
        picked = await takeSharedFile()
      } catch {
        picked = null
      }
      setDoc(picked)
    }
    if (!picked) {
      setState({
        at: 'failed',
        why: 'The shared file is no longer here. Share it again from the app it is in.',
      })
      return
    }
    if (!isPdf(picked.name, picked.type)) {
      setState({ at: 'failed', why: NOT_A_PDF })
      return
    }
    if (picked.size > MAX_DOCUMENT_BYTES) {
      setState({ at: 'failed', why: tooLarge(picked.size) })
      return
    }

    const { ok, status, body, error } = await api.resources.uploadDocument(picked)
    if (!ok && status !== 202) {
      setState({ at: 'failed', why: error ?? 'Could not take that file.' })
      return
    }
    setState({ at: 'saved', id: body.id, title: body.title, already: false, shape: shapeOf(body.outline) })
  }

  async function send() {
    if (file) return sendFile()
    setState({ at: 'saving' })
    const { ok, body, error } = shared.url
      ? await api.resources.add({ kind: 'article', url: shared.url, ...(shared.title ? { title: shared.title } : {}) })
      : await api.resources.add({ kind: 'note', text: shared.note!, ...(shared.title ? { title: shared.title } : {}) })
    if (!ok) {
      setState({ at: 'failed', why: error ?? 'It could not be saved.' })
      return
    }
    setState({ at: 'saved', id: body.id, title: body.title, already: Boolean(body.alreadyFiled) })
  }

  useEffect(() => {
    if (nothing || sent.current) return
    sent.current = true
    void send()
    // Once, on arrival: what was shared does not change under the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (nothing) return <HowToSend origin={origin} />

  const what = file ? kindLabel('pdf') : shared.url ? kindLabel('article', shared.url) : 'Note'
  const name = file
    ? doc
      ? titleFromFilename(doc.name)
      : 'A shared document'
    : (shared.title ?? (shared.url ? urlTitle(shared.url) : shared.note!))

  return (
    <section className={styles.receipt} aria-live="polite">
      <p className={styles.kind}>{what}</p>
      <p className={styles.name}>{state.at === 'saved' ? state.title : name}</p>

      {state.at === 'saving' && (
        <p className={styles.said}>
          {file ? 'Uploading it, and opening it to see how it is shaped…' : 'Saving it…'}
        </p>
      )}

      {state.at === 'saved' && (
        <>
          <p className={styles.said}>
            {state.already
              ? 'Already in the inbox. Nothing was added twice.'
              : 'In the inbox. It is being read for what it is about.'}
          </p>
          {state.shape && <p className={styles.said}>{state.shape}</p>}
          <p className={styles.ways}>
            <Link href={`/resources/${state.id}`}>Open it</Link>
            <Link href="/inbox">The inbox</Link>
          </p>
          <Reading id={state.id} onFiled={() => setFinished(true)} />
          {popup && finished && <Closing />}
        </>
      )}

      {state.at === 'failed' && (
        <>
          <p className={styles.problem}>{state.why}</p>
          <p className={styles.ways}>
            <button type="button" className={styles.again} onClick={() => void send()}>
              Try again
            </button>
          </p>
        </>
      )}
    </section>
  )
}

/** How often the reading is asked after while it runs. */
const POLL_MS = 1500

/** When the sheet stops asking. A reading that has not settled by now is
 *  being retried or read in rounds, and the inbox is where to watch it. */
const GIVE_UP_MS = 4 * 60_000

/**
 * The reading, as it happens: each step the worker has passed, what the
 * model said of the piece, and each topic it is filed against as it
 * arrives (`core/ingestProgress`).
 *
 * Polled rather than pushed: the job is worked in another function, and
 * a row read every second and a half for the half-minute a reading takes
 * is cheaper than a channel held open for it. Something already filed
 * settles on the first answer, and says where it went.
 */
function Reading({ id, onFiled }: { id: string; onFiled?: () => void }) {
  const [progress, setProgress] = useState<IngestProgress | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()

    async function ask() {
      const { ok, body } = await api.resources.progress(id)
      if (!live) return
      if (ok) setProgress(body)
      if (ok && isSettled(body)) {
        // Done, or never queued. A failure is settled too, and is not
        // something to close on.
        if (body.job?.state !== 'failed') onFiled?.()
        return
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setStale(true)
        return
      }
      timer = setTimeout(() => void ask(), POLL_MS)
    }

    void ask()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
    // Once per resource: the callback is the parent's and changes with
    // every render of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!progress) return null

  const settled = isSettled(progress)
  const now = progressNow(progress)
  const first = progress.steps[0] ? Date.parse(progress.steps[0].at) : null
  // A resource read before there were steps to keep, or filed again:
  // the summary it already has stands in for the reading.
  const summary = progress.steps.some(s => s.kind === 'read') ? null : progress.summary

  return (
    <div className={styles.reading}>
      {progress.steps.length > 0 && (
        <section>
          <h2 className={styles.label}>The reading</h2>
          <ol className={styles.steps}>
            {progress.steps.map((step, i) => (
              <Step
                key={`${step.at}-${i}`}
                step={step}
                since={first}
                current={!settled && i === progress.steps.length - 1}
              />
            ))}
          </ol>
        </section>
      )}

      {summary && <p className={styles.aside}>{summary}</p>}

      {now && <p className={styles.said}>{now}</p>}
      {!settled && !now && progress.steps.length === 0 && (
        <p className={styles.said}>Starting the reading…</p>
      )}
      {progress.job?.error && progress.job.state !== 'done' && (
        <p className={progress.job.state === 'failed' ? styles.problem : styles.why}>
          {progress.job.error}
        </p>
      )}
      {stale && (
        <p className={styles.said}>Still going. The inbox shows where it has got to.</p>
      )}

      {progress.topics.length > 0 && (
        <section>
          <h2 className={styles.label}>Filed under</h2>
          <ul className={styles.topics}>
            {progress.topics.map(t => (
              <li key={t.id} className={styles.topic}>
                <Link href={t.state === 'pending' ? '/inbox' : `/topics/${t.id}`}>{t.title}</Link>
                {t.state === 'pending' && <span className={styles.asked}>to ask</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** One step, with the time it was passed since the reading began. */
function Step({ step, since, current }: { step: TimedStep; since: number | null; current: boolean }) {
  const { line, aside } = stepLine(step)
  const seconds = since === null ? 0 : Math.max(0, Math.round((Date.parse(step.at) - since) / 1000))
  const concepts = step.kind === 'read' && !step.whole ? step.concepts : []

  return (
    <li className={styles.step} data-current={current || undefined}>
      <span className={styles.when}>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
      <span className={styles.what}>
        {line}
        {current && <span className={styles.dots} aria-hidden="true">…</span>}
      </span>
      {aside && <span className={styles.aside}>{aside}</span>}
      {concepts.length > 0 && (
        <ul className={styles.concepts}>
          {concepts.map(c => (
            <li key={c.name} title={c.description ?? undefined}>{c.name}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** How long the bookmarklet's window waits on a finished reading. */
const CLOSE_AFTER_S = 8

/**
 * The bookmarklet's window, counting itself out once the reading is
 * done. Any touch, key or scroll keeps it: a reader who has started
 * looking at the topics, or reaching for *Open it*, is not done with it.
 */
function Closing() {
  const [left, setLeft] = useState(CLOSE_AFTER_S)
  const [kept, setKept] = useState(false)

  useEffect(() => {
    if (kept) return
    const keep = () => setKept(true)
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, keep, { passive: true })
    const tick = setInterval(() => setLeft(n => n - 1), 1000)
    return () => {
      clearInterval(tick)
      for (const e of events) window.removeEventListener(e, keep)
    }
  }, [kept])

  useEffect(() => {
    if (!kept && left <= 0) window.close()
  }, [kept, left])

  if (kept) return null
  return (
    <p className={styles.closing}>
      Closing in {Math.max(0, left)}. Touch anything to keep it open.
    </p>
  )
}

/**
 * The page opened with nothing sent to it: how to send it things.
 *
 * The bookmarklet's address is set on the link after it is on the page:
 * React refuses to render a `javascript:` href, rightly, since one that
 * reached it from data would run as the reader. This one is the app's own
 * constant.
 */
function HowToSend({ origin }: { origin: string }) {
  const link = useRef<HTMLAnchorElement>(null)
  const code =
    `javascript:(()=>{window.open('${origin}/send?popup=1&url='+encodeURIComponent(location.href)` +
    `+'&title='+encodeURIComponent(document.title),'didactic-send','width=480,height=720')})()`

  useEffect(() => {
    link.current?.setAttribute('href', code)
  }, [code])

  return (
    <div className={styles.how}>
      <section className={styles.way}>
        <h2 className={styles.wayTitle}>From a computer</h2>
        <p>
          Drag this to the bookmarks bar. Pressing it on any page sends that page here,
          in a small window that shows the reading and closes itself once it is filed.
        </p>
        <p>
          <a ref={link} className={styles.bookmarklet} onClick={e => e.preventDefault()}>
            Send to Didactic
          </a>
        </p>
      </section>

      <section className={styles.way}>
        <h2 className={styles.wayTitle}>From an Android phone</h2>
        <p>
          Open Didactic in Chrome, then <em>⋮ → Add to home screen → Install</em>. It then
          appears in every app’s <em>Share</em> list.
        </p>
      </section>

      <section className={styles.way}>
        <h2 className={styles.wayTitle}>From an iPhone</h2>
        <p>
          In Shortcuts, make one that <em>receives URLs from the Share Sheet</em> and does one
          thing, <em>Open URL</em>:
        </p>
        <p className={styles.code}>{origin}/send?url=<span>Shortcut Input</span></p>
        <p>It opens in Safari, where you are already signed in, and saves the link.</p>
      </section>

      <p className={styles.note}>
        A YouTube video is played on its page here, with its transcript read for what it is
        about. An Instagram post is shown with its caption, and a Substack piece is read like
        any article.
      </p>
    </div>
  )
}
