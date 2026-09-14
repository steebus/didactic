'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import styles from './LeaveLine.module.css'

const api = didactic()

/**
 * The way out, at the foot of the subjects sheet.
 *
 * It used to be printed in the running head of all seven sheets, beside
 * the sheets themselves. On a single-user app with no second account
 * that is one press a year taking a slot in the most-read row in the
 * catalogue -- and on a phone it was one of the items pushing that row
 * onto a third line.
 *
 * So it sits here instead: at the bottom of the one sheet everything
 * starts from, which is where someone who means to leave has to end up
 * anyway. Quiet, and not a button -- leaving is not an action this app
 * wants to encourage or to dress up.
 */
export function LeaveLine() {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function leave() {
    setBusy(true)
    // Nothing to branch on: the door is shut either way, and a session
    // that could not be closed server-side is still closed here.
    await api.auth.signOut()
    router.replace('/enter')
    router.refresh()
  }

  return (
    <button type="button" className={styles.leave} onClick={leave} disabled={busy}>
      {busy ? 'Closing…' : 'Close the catalogue'}
    </button>
  )
}
