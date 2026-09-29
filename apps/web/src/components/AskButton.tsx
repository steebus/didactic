'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAskContext } from '@/lib/useAskContext'
import type { AskContext } from '@didactic/core/ask'
import { AskPanel } from './AskPanel'
import { AsksDrawer } from './AsksDrawer'
import { AskIcon } from './AskIcon'
import styles from './Ask.module.css'

/**
 * The corner a reader can ask from.
 *
 * Rendered from `layout.tsx` outside `main`, which is what makes it the
 * same offer on every page rather than a thing each surface remembers to
 * add. It stands on whatever already has the foot, the way the player's
 * disc does in the opposite corner.
 *
 * The passage arrives by event rather than by prop: the highlighter is
 * inside the sheet and this is docked from the layout, so they are in
 * different trees, and threading one string between them through a
 * context would mean wrapping the whole catalogue for it.
 */
export function AskButton() {
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<{ quote?: string; prefix?: string }>({})
  // The drawer of what was asked on this page. Its own thing rather than
  // the panel's, so the desk's *Asked here* opens the list and nothing
  // else; picking from it is what opens the panel.
  const [shelf, setShelf] = useState(false)
  // The conversation the panel is on, for the drawer to mark; and which
  // one the panel was last started on, which mounts it afresh.
  const [current, setCurrent] = useState<string | undefined>()
  const [start, setStart] = useState<{ id?: string; n: number }>({ n: 0 })
  // Where we are is read when the panel opens, not tracked while it is
  // shut: the context of a question is the moment it was asked.
  const [context, setContext] = useState<AskContext | null>(null)
  const readContext = useAskContext()
  const path = usePathname()

  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { quote?: string; prefix?: string; shelf?: boolean }
        | undefined
      // Asking for the list is not a new question: a conversation already
      // open keeps its passage and its place, and only the drawer comes out.
      if (detail?.shelf) {
        if (!open) setContext(readContext())
        setShelf(true)
        return
      }
      setSelection({ quote: detail?.quote, prefix: detail?.prefix })
      setContext(readContext())
      setOpen(true)
    }
    window.addEventListener('didactic:ask', onAsk)
    return () => {
      window.removeEventListener('didactic:ask', onAsk)
    }
  }, [readContext, open])

  function open_() {
    setContext(readContext())
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setCurrent(undefined)
    // The passage belongs to the conversation it opened, not to the next
    // one: a disc pressed afterwards is a fresh question about the page.
    setSelection({})
  }

  // On a lesson the marking desk carries this button itself, beside the
  // two that already write. Drawing a second one in the corner of the
  // window put it over them, and would have been two arrangements of one
  // idea even if it had not: the desk is sticky inside the prose and
  // this is fixed to the viewport, so nothing keeps them together. The
  // panel still mounts from here, because it is the same panel.
  //
  // A resource read in the app has the same desk (053), so it gives way
  // there too -- but not on its document viewer below it, which has no
  // desk and would otherwise have no way to ask at all.
  const onDesk = path.startsWith('/lesson/') || /^\/resources\/[^/]+\/?$/.test(path)

  // A drawer left out lists the page it was opened on: walking to another
  // puts it away rather than showing one page's questions on the next.
  const [shelfPath, setShelfPath] = useState(path)
  if (path !== shelfPath) {
    setShelfPath(path)
    setShelf(false)
  }

  // The drawer is a column beside the reading, as the marks' list is, so
  // the sheet moves over for it the same way (`body[data-notes]`).
  useEffect(() => {
    if (!shelf) return
    document.body.dataset.notes = 'open'
    return () => {
      delete document.body.dataset.notes
    }
  }, [shelf])

  // The pages whose conversations can be listed: one thing, with an id.
  const listable =
    context?.entityId &&
    (context.route === 'lesson' ||
      context.route === 'resource' ||
      context.route === 'topic' ||
      context.route === 'subject')
      ? { route: context.route, entityId: context.entityId }
      : null

  /** Open the panel on a conversation from the drawer, or on a new one. */
  function begin(id?: string) {
    setShelf(false)
    if (open && id && id === current) return
    setSelection({})
    setCurrent(id)
    setStart(s => ({ id, n: s.n + 1 }))
    setOpen(true)
  }

  return (
    <>
      {!onDesk && (
        <button
          type="button"
          className={styles.disc}
          aria-label="Ask about this"
          aria-expanded={open}
          onClick={() => (open ? close() : open_())}
        >
          <AskIcon />
        </button>
      )}
      {open && context && (
        <AskPanel
          key={start.n}
          context={{ ...context, ...selection }}
          start={start.id}
          shelf={shelf}
          onShelf={listable ? () => setShelf(true) : undefined}
          onConversation={setCurrent}
          onClose={close}
        />
      )}
      {shelf && listable && (
        <AsksDrawer
          about={listable}
          current={current}
          onResume={id => begin(id)}
          onFresh={() => begin()}
          onClose={() => setShelf(false)}
        />
      )}
    </>
  )
}
