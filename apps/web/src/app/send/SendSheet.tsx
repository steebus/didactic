'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import { kindLabel, type Shared } from '@didactic/core/shared'
import { urlTitle } from '@didactic/core/titles'
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
