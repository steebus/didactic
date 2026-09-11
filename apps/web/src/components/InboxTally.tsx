'use client'

import { useEffect, useState } from 'react'
import styles from './SheetNav.module.css'

interface Counts {
  decisions: number
  waiting: number
  total: number
}

/**
 * The last figure this browser was told, held for as long as the tab
 * lives.
 *
 * The running head is printed on every sheet, so the tally is fetched
 * again on every navigation. Starting from nothing each time would mean
 * a number that vanishes and comes back on every page, which reads as a
 * fault rather than as a count. Module scope rather than storage: it is
 * empty on the server and empty on the first render in the browser, so
 * there is nothing for hydration to disagree about.
 */
let held: Counts | null = null

/**
 * How many things are waiting in the inbox, printed beside its name.
 *
 * The inbox holds two kinds of waiting and they are not the same
 * errand: topics the resolver would not decide alone, which are a
 * question addressed to the reader, and material filed but not yet
 * read, which is a pile. The figure is both, because that is what "in
 * the inbox" means from the outside, and the title says which is which
 * so the number can be acted on rather than merely noticed.
 */
export function InboxTally() {
  const [counts, setCounts] = useState<Counts | null>(held)

  useEffect(() => {
    let cancelled = false

    fetch('/api/inbox/count')
      .then(res => (res.ok ? res.json() : null))
      .then((body: Counts | null) => {
        if (cancelled || !body) return
        held = {
          decisions: Number(body.decisions) || 0,
          waiting: Number(body.waiting) || 0,
          total: Number(body.total) || 0,
        }
        setCounts(held)
      })
      // A tally that cannot be got is a tally that is not printed. It
      // is a count in a nav; it does not get to interrupt anything.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  if (!counts || counts.total === 0) return null

  const parts = [
    counts.decisions > 0 &&
      `${counts.decisions} ${counts.decisions === 1 ? 'topic needs' : 'topics need'} your call`,
    counts.waiting > 0 && `${counts.waiting} unsown`,
  ].filter(Boolean)

  return (
    <span className={styles.tally} title={parts.join(', ')}>
      {counts.total > 99 ? '99+' : counts.total}
      <span className={styles.tallyReading}> waiting in the inbox: {parts.join(', ')}</span>
    </span>
  )
}
