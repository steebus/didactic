'use client'

import { useEffect, useState } from 'react'
import { useAskContext } from '@/lib/useAskContext'
import type { AskContext } from '@didactic/core/ask'
import { AskPanel } from './AskPanel'
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
  // Where we are is read when the panel opens, not tracked while it is
  // shut: the context of a question is the moment it was asked.
  const [context, setContext] = useState<AskContext | null>(null)
  const readContext = useAskContext()

  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent).detail as { quote?: string; prefix?: string } | undefined
      setSelection(detail ?? {})
      setContext(readContext())
      setOpen(true)
    }
    window.addEventListener('didactic:ask', onAsk)
    return () => {
      window.removeEventListener('didactic:ask', onAsk)
    }
  }, [readContext])

  function open_() {
    setContext(readContext())
    setOpen(true)
  }

  function close() {
    setOpen(false)
    // The passage belongs to the conversation it opened, not to the next
    // one: a disc pressed afterwards is a fresh question about the page.
    setSelection({})
  }

  return (
    <>
      <button
        type="button"
        className={styles.disc}
        aria-label="Ask about this"
        aria-expanded={open}
        onClick={() => (open ? close() : open_())}
      >
        <AskIcon />
      </button>
      {open && context && <AskPanel context={{ ...context, ...selection }} onClose={close} />}
    </>
  )
}

function AskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A2.5 2.5 0 0 1 17 6.5v5A2.5 2.5 0 0 1 14.5 14H8l-4 3v-3H5.5A2.5 2.5 0 0 1 3 11.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
