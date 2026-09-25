'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAskContext } from '@/lib/useAskContext'
import type { AskContext } from '@didactic/core/ask'
import { AskPanel } from './AskPanel'
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
  // Where we are is read when the panel opens, not tracked while it is
  // shut: the context of a question is the moment it was asked.
  const [context, setContext] = useState<AskContext | null>(null)
  const readContext = useAskContext()
  const path = usePathname()

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

  // On a lesson the marking desk carries this button itself, beside the
  // two that already write. Drawing a second one in the corner of the
  // window put it over them, and would have been two arrangements of one
  // idea even if it had not: the desk is sticky inside the prose and
  // this is fixed to the viewport, so nothing keeps them together. The
  // panel still mounts from here, because it is the same panel.
  const onLesson = path.startsWith('/lesson/')

  return (
    <>
      {!onLesson && (
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
      {open && context && <AskPanel context={{ ...context, ...selection }} onClose={close} />}
    </>
  )
}
