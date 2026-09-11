'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import styles from './SheetNav.module.css'

const api = didactic()

/** Closing the catalogue. Printed in the running head with the sheets,
 *  because it is the one navigation that leaves. */
export function SignOut() {
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
      {busy ? 'Closing…' : 'Close'}
    </button>
  )
}
