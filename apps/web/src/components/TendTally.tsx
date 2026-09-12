'use client'

import { useEffect, useState } from 'react'
import { didactic } from '@didactic/api'
import type { ClozeCount } from '@didactic/core/clozes'
import { tendPhrase } from '@didactic/core/clozes'
import styles from './SheetNav.module.css'

const api = didactic()

/**
 * The last figure this browser was told, held for as long as the tab
 * lives.
 *
 * Module scope, for the reason `InboxTally` keeps one: the running head
 * is printed on every sheet, so the count is fetched again on every
 * navigation, and starting from nothing each time would mean a number
 * that vanishes and comes back on every page -- which reads as a fault
 * rather than as a count. Empty on the server and on the first render
 * in the browser, so there is nothing for hydration to disagree about.
 */
let held: ClozeCount | null = null

/** Read again when something is answered, so the figure falls as the
 *  reader works rather than only on the next navigation. */
export const TENDED = 'didactic:tended'

/**
 * How many clozes are due, printed beside Tend in the running head.
 *
 * Only what is due. The total is a fact about the garden; what is due
 * is the only part of it that is an errand, and a figure in a nav is a
 * figure you are being asked to do something about.
 */
export function TendTally() {
  const [counts, setCounts] = useState<ClozeCount | null>(held)

  useEffect(() => {
    let cancelled = false

    const read = () => {
      // A tally that cannot be got is a tally that is not printed. It
      // is a count in a nav; it does not get to interrupt anything, so
      // the failure branch leaves the last figure standing.
      void api.clozes.count().then(({ ok, body }) => {
        if (cancelled || !ok) return
        held = {
          due: Number(body.due) || 0,
          total: Number(body.total) || 0,
          next: body.next ?? null,
        }
        setCounts(held)
      })
    }

    read()
    window.addEventListener(TENDED, read)
    return () => {
      cancelled = true
      window.removeEventListener(TENDED, read)
    }
  }, [])

  if (!counts || counts.due === 0) return null

  return (
    <span className={styles.tally} title={tendPhrase(counts.due)}>
      {counts.due > 99 ? '99+' : counts.due}
      <span className={styles.tallyReading}> — {tendPhrase(counts.due)}</span>
    </span>
  )
}

/** Say that something was answered, so every tally on the page falls. */
export function saidTended() {
  try {
    window.dispatchEvent(new Event(TENDED))
  } catch {
    // Nothing on a server, and nothing worth an error on the page.
  }
}
