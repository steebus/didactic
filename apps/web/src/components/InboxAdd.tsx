'use client'

import { useEffect, useRef, useState } from 'react'
import { AddResource } from './AddResource'
import styles from '@/app/inbox/page.module.css'

/** The inbox's send form, as a modal opened by the docked + button
 *  (`AskButton` stands for it on this page) through a window event. */
export function InboxAdd() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const toggle = () => setOpen(o => !o)
    window.addEventListener('didactic:add', toggle)
    return () => window.removeEventListener('didactic:add', toggle)
  }, [])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.modal}
      aria-label="Send it something"
      onClose={() => setOpen(false)}
      // A press on the backdrop is a press on the dialog element itself.
      onClick={e => e.target === ref.current && setOpen(false)}
    >
      {open && <AddResource />}
    </dialog>
  )
}
