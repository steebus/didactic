'use client'

import { useEffect, useState } from 'react'
import { AddResource } from './AddResource'
import styles from '@/app/inbox/page.module.css'

/** The inbox's send form, opened by the docked + button (`AskButton`
 *  stands for it on this page) through a window event, as the ask does. */
export function InboxAdd() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const toggle = () => setOpen(o => !o)
    window.addEventListener('didactic:add', toggle)
    return () => window.removeEventListener('didactic:add', toggle)
  }, [])
  if (!open) return null
  return (
    <section className={styles.adder} aria-label="Send it something">
      <AddResource />
    </section>
  )
}
