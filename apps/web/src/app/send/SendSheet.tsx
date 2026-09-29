'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import { kindLabel, type Shared } from '@didactic/core/shared'
import { urlTitle } from '@didactic/core/titles'
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
  | { at: 'saved'; id: string; title: string; already: boolean }
  | { at: 'failed'; why: string }

/**
 * Saves what was shared, once, and says so.
 *
 * Opened by the bookmarklet it is a small window the reader wants gone
 * as soon as it has said *Saved*, so it closes itself; opened by a share
 * sheet it stays, with the way into what was just saved.
 */
export function SendSheet({
  shared,
  popup,
  origin,
}: {
  shared: Shared
  popup: boolean
  origin: string
}) {
  const nothing = !shared.url && !shared.note
  const [state, setState] = useState<State>({ at: 'saving' })
  const sent = useRef(false)

  async function send() {
    setState({ at: 'saving' })
    const { ok, body, error } = shared.url
      ? await api.resources.add({ kind: 'article', url: shared.url, ...(shared.title ? { title: shared.title } : {}) })
      : await api.resources.add({ kind: 'note', text: shared.note!, ...(shared.title ? { title: shared.title } : {}) })
    if (!ok) {
      setState({ at: 'failed', why: error ?? 'It could not be saved.' })
      return
    }
    setState({ at: 'saved', id: body.id, title: body.title, already: Boolean(body.alreadyFiled) })
    if (popup) setTimeout(() => window.close(), 1400)
  }

  useEffect(() => {
    if (nothing || sent.current) return
    sent.current = true
    void send()
    // Once, on arrival: what was shared does not change under the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (nothing) return <HowToSend origin={origin} />

  const what = shared.url ? kindLabel('article', shared.url) : 'Note'
  const name = shared.title ?? (shared.url ? urlTitle(shared.url) : shared.note!)

  return (
    <section className={styles.receipt} aria-live="polite">
      <p className={styles.kind}>{what}</p>
      <p className={styles.name}>{state.at === 'saved' ? state.title : name}</p>

      {state.at === 'saving' && <p className={styles.said}>Saving it…</p>}

      {state.at === 'saved' && (
        <>
          <p className={styles.said}>
            {state.already
              ? 'Already in the inbox. Nothing was added twice.'
              : 'In the inbox. It is being read for what it is about.'}
          </p>
          <p className={styles.ways}>
            <Link href={`/resources/${state.id}`}>Open it</Link>
            <Link href="/inbox">The inbox</Link>
          </p>
          {!popup && <Reading id={state.id} />}
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
function Reading({ id }: { id: string }) {
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
      if (ok && isSettled(body)) return
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
    `+'&title='+encodeURIComponent(document.title),'didactic-send','width=460,height=380')})()`

  useEffect(() => {
    link.current?.setAttribute('href', code)
  }, [code])

  return (
    <div className={styles.how}>
      <section className={styles.way}>
        <h2 className={styles.wayTitle}>From a computer</h2>
        <p>
          Drag this to the bookmarks bar. Pressing it on any page sends that page here,
          in a small window that closes itself.
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
